import { createAuthProvider } from './auth-adapter';
import type { SupabaseAuthPort } from './auth-adapter';

/**
 * Guards fail closed (docs/10_NAVIGATION_FLOW.md §10): an error while deciding
 * who the caller is must never be the thing that lets them past. Most of this
 * file is that one rule, applied to every way the SDK can go wrong.
 */

const RAW = { access_token: 'jwt', user: { id: 'user-1' } };

const port = (overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort => ({
  getSession: () => Promise.resolve({ data: { session: RAW }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  signInWithOAuth: () => Promise.resolve({ error: null }),
  signOut: () => Promise.resolve({ error: null }),
  ...overrides,
});

describe('reading the session', () => {
  it('carries only the id and the token', () => {
    // Authorisation is decided by RLS from the JWT the server verifies. Anything
    // more here would be personal data held for no purpose (CLAUDE.md §9 rule 7).
    return expect(createAuthProvider(port()).currentSession()).resolves.toEqual({
      userId: 'user-1',
      accessToken: 'jwt',
    });
  });

  it('reports signed out when there is no session', async () => {
    const auth = createAuthProvider(
      port({ getSession: () => Promise.resolve({ data: { session: null }, error: null }) }),
    );
    await expect(auth.currentSession()).resolves.toBeNull();
  });

  it('treats an error as signed out rather than propagating it', async () => {
    const auth = createAuthProvider(
      port({
        getSession: () => Promise.resolve({ data: { session: null }, error: { message: 'boom' } }),
      }),
    );
    await expect(auth.currentSession()).resolves.toBeNull();
  });

  it('treats a thrown error as signed out too', async () => {
    const auth = createAuthProvider(
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
    const auth = createAuthProvider(
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

    const auth = createAuthProvider(
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
    const auth = createAuthProvider(
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
    await expect(createAuthProvider(port()).signIn('apple')).resolves.toEqual({ ok: true });
  });

  it('distinguishes a cancellation from a failure', async () => {
    // Backing out of the provider's sheet is the user changing their mind. A red
    // banner for that is the app arguing with them.
    const cancelled = createAuthProvider(
      port({
        signInWithOAuth: () => Promise.resolve({ error: { message: 'User cancelled the flow' } }),
      }),
    );
    await expect(cancelled.signIn('google')).resolves.toEqual({
      ok: false,
      reason: 'cancelled',
    });

    const failed = createAuthProvider(
      port({ signInWithOAuth: () => Promise.resolve({ error: { message: 'network down' } }) }),
    );
    await expect(failed.signIn('google')).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('never throws at the call site', async () => {
    const auth = createAuthProvider(
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
    const auth = createAuthProvider(
      port({
        signOut: () => {
          throw new Error('offline');
        },
      }),
    );
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});
