import { createAuthProvider, readAuthCode } from './auth-adapter';
import type { AuthBrowserPort, SupabaseAuthPort } from './auth-adapter';

/**
 * Guards fail closed (docs/10_NAVIGATION_FLOW.md §10): an error while deciding
 * who the caller is must never be the thing that lets them past. Most of this
 * file is that one rule, applied to every way the SDK can go wrong.
 */

const RAW = { access_token: 'jwt', user: { id: 'user-1' } };

const REDIRECT = 'twolmaps://auth-callback';

const port = (overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort => ({
  getSession: () => Promise.resolve({ data: { session: RAW }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  signInWithOAuth: () =>
    Promise.resolve({ data: { url: 'https://accounts.google.test/o/oauth2' }, error: null }),
  exchangeCodeForSession: () => Promise.resolve({ error: null }),
  signOut: () => Promise.resolve({ error: null }),
  ...overrides,
});

/** Comes back with a code by default, which is the happy path. */
const browser = (overrides: Partial<AuthBrowserPort> = {}): AuthBrowserPort => ({
  openAuthSession: () => Promise.resolve({ type: 'success', url: `${REDIRECT}?code=abc123` }),
  ...overrides,
});

const provider = (auth: SupabaseAuthPort = port(), b: AuthBrowserPort = browser()) =>
  createAuthProvider(auth, b, { redirectTo: REDIRECT });

describe('reading the session', () => {
  it('carries only the id and the token', () => {
    // Authorisation is decided by RLS from the JWT the server verifies. Anything
    // more here would be personal data held for no purpose (CLAUDE.md §9 rule 7).
    return expect(provider(port()).currentSession()).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'jwt',
    });
  });

  it('reports signed out when there is no session', async () => {
    const auth = provider(
      port({ getSession: () => Promise.resolve({ data: { session: null }, error: null }) }),
    );
    await expect(auth.currentSession()).resolves.toBeNull();
  });

  it('treats an error as signed out rather than propagating it', async () => {
    const auth = provider(
      port({
        getSession: () => Promise.resolve({ data: { session: null }, error: { message: 'boom' } }),
      }),
    );
    await expect(auth.currentSession()).resolves.toBeNull();
  });

  it('treats a thrown error as signed out too', async () => {
    const auth = provider(
      port({
        getSession: () => {
          throw new Error('storage unavailable');
        },
      }),
    );
    await expect(auth.currentSession()).resolves.toBeNull();
  });

  it('refuses a session with no token', async () => {
    // Treating it as signed in would attach `Bearer undefined` to every request
    // and turn a clean sign-out into a wall of 401s.
    const auth = provider(
      port({
        getSession: () =>
          Promise.resolve({
            data: { session: { access_token: '', user: { id: 'user-1' } } },
            error: null,
          }),
      }),
    );
    await expect(auth.currentSession()).resolves.toBeNull();
  });
});

describe('watching the session', () => {
  it('answers every event with the same question', () => {
    // Branching on the event name means adding a case each time the SDK adds
    // one, and missing a case means holding a session that stopped being true.
    let emit: ((event: string, session: typeof RAW | null) => void) | null = null;
    const seen: (string | null)[] = [];

    const auth = provider(
      port({
        onAuthStateChange: (callback) => {
          emit = callback;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      }),
    );

    auth.subscribe((session) => seen.push(session?.userId ?? null));

    if (emit === null) throw new Error('expected a subscription');
    const publish = emit as (event: string, session: typeof RAW | null) => void;

    publish('SIGNED_IN', RAW);
    publish('TOKEN_REFRESHED', RAW);
    publish('SOME_FUTURE_EVENT', null);
    publish('SIGNED_OUT', null);

    expect(seen).toEqual(['user-1', 'user-1', null, null]);
  });

  it('unsubscribes when told to', () => {
    let unsubscribed = false;
    const auth = provider(
      port({
        onAuthStateChange: () => ({
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true;
              },
            },
          },
        }),
      }),
    );

    auth.subscribe(() => undefined)();
    expect(unsubscribed).toBe(true);
  });
});

describe('signing in', () => {
  it('succeeds quietly', async () => {
    await expect(provider(port()).signIn('apple')).resolves.toEqual({ ok: true });
  });

  it('distinguishes a cancellation from a failure', async () => {
    // Backing out of the provider's sheet is the user changing their mind. A red
    // banner for that is the app arguing with them.
    const cancelled = provider(
      port({
        signInWithOAuth: () =>
          Promise.resolve({ data: { url: null }, error: { message: 'User cancelled the flow' } }),
      }),
    );
    await expect(cancelled.signIn('google')).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
    });

    const failed = provider(
      port({
        signInWithOAuth: () =>
          Promise.resolve({ data: { url: null }, error: { message: 'network down' } }),
      }),
    );
    await expect(failed.signIn('google')).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('opens the URL the SDK handed back, rather than assuming it navigated', async () => {
    // The defect this whole flow exists to fix. `signInWithOAuth` returns a link
    // and does not navigate on React Native, so reading only `error` yielded
    // `{ ok: true }` and a user still looking at the sign-in screen.
    const opened: string[] = [];
    const auth = provider(
      port(),
      browser({
        openAuthSession: (url) => {
          opened.push(url);
          return Promise.resolve({ type: 'success', url: `${REDIRECT}?code=abc123` });
        },
      }),
    );

    await expect(auth.signIn('google')).resolves.toEqual({ ok: true });
    expect(opened).toEqual(['https://accounts.google.test/o/oauth2']);
  });

  it('asks the SDK not to navigate, and tells it where to come back to', async () => {
    let sent: unknown = null;
    const auth = provider(
      port({
        signInWithOAuth: (args) => {
          sent = args;
          return Promise.resolve({ data: { url: 'https://accounts.google.test' }, error: null });
        },
      }),
    );

    await auth.signIn('google');
    expect(sent).toEqual({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
  });

  it('exchanges the code from the callback for a session', async () => {
    const exchanged: string[] = [];
    const auth = provider(
      port({
        exchangeCodeForSession: (code) => {
          exchanged.push(code);
          return Promise.resolve({ error: null });
        },
      }),
    );

    await expect(auth.signIn('google')).resolves.toEqual({ ok: true });
    expect(exchanged).toEqual(['abc123']);
  });

  it('treats closing the browser as a change of mind, not a fault', async () => {
    const auth = provider(
      port(),
      browser({ openAuthSession: () => Promise.resolve({ type: 'dismiss' }) }),
    );
    await expect(auth.signIn('google')).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });

  it('reports a callback with no code as a failure', async () => {
    // The provider refused, or the user denied the consent screen. Either way
    // there is no session to exchange for, and saying `ok` would leave the app
    // claiming a sign-in it does not have.
    const auth = provider(
      port(),
      browser({
        openAuthSession: () =>
          Promise.resolve({ type: 'success', url: `${REDIRECT}?error=denied` }),
      }),
    );
    await expect(auth.signIn('google')).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a failed exchange rather than a session that does not exist', async () => {
    const auth = provider(
      port({ exchangeCodeForSession: () => Promise.resolve({ error: { message: 'expired' } }) }),
    );
    await expect(auth.signIn('google')).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a missing URL rather than a success nobody can see', async () => {
    const auth = provider(
      port({ signInWithOAuth: () => Promise.resolve({ data: { url: null }, error: null }) }),
    );
    await expect(auth.signIn('google')).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('never throws at the call site', async () => {
    const auth = provider(
      port({
        signInWithOAuth: () => {
          throw new Error('native module missing');
        },
      }),
    );
    await expect(auth.signIn('apple')).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('signing out', () => {
  it('cannot fail from the user’s point of view', async () => {
    // The local session is cleared either way, and reporting a failure would
    // leave them looking at a screen they asked to leave.
    const auth = provider(
      port({
        signOut: () => {
          throw new Error('offline');
        },
      }),
    );
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});

describe('reading the code out of the callback', () => {
  it('takes it from the query, where PKCE puts it', () => {
    expect(readAuthCode('twolmaps://auth-callback?code=abc123')).toBe('abc123');
  });

  it('takes it from the fragment too', () => {
    // An implicit-flow project puts it there, and a project switched between the
    // two mid-development would otherwise fail with no clue why.
    expect(readAuthCode('twolmaps://auth-callback#code=abc123')).toBe('abc123');
  });

  it('finds it beside other parameters', () => {
    expect(readAuthCode('twolmaps://auth-callback?state=xyz&code=abc123&scope=email')).toBe(
      'abc123',
    );
  });

  it('decodes what the provider encoded', () => {
    expect(readAuthCode('twolmaps://auth-callback?code=a%2Fb')).toBe('a/b');
  });

  it('returns null when there is none', () => {
    expect(readAuthCode('twolmaps://auth-callback?error=access_denied')).toBeNull();
    expect(readAuthCode('twolmaps://auth-callback')).toBeNull();
  });

  it('does not mistake another parameter ending in code', () => {
    // `?errorcode=5` contains "code=5". Anchoring on a delimiter is what stops
    // the app exchanging a status number for a session.
    expect(readAuthCode('twolmaps://auth-callback?errorcode=5')).toBeNull();
  });
});
