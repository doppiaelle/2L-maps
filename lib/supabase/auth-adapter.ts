import type { AuthProvider, Session, SignInMethod, SignInOutcome } from '@/lib/providers/types';

/**
 * The Supabase implementation of `AuthProvider`.
 *
 * The SDK is reachable from here and from nowhere else (`CLAUDE.md` §0 rule 2,
 * [ADR-0006](../../docs/adr/0006-mandatory-backend-proxy.md)), and it arrives
 * through `SupabaseAuthPort` rather than being imported: the client is built in
 * `lib/supabase/client.ts` from configuration this module has no business
 * reading, and injecting it keeps every branch below testable without a project.
 *
 * **Guards fail closed** ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md)
 * §10). Every failure here resolves to "signed out" rather than throwing: an
 * error while deciding who the caller is must never be the thing that lets them
 * past. That is why nothing in this file rejects.
 */

/** The slice of `supabase.auth` this adapter uses, named in its own terms. A
 *  wider dependency would make the facade a pass-through. */
export interface SupabaseAuthPort {
  getSession: () => Promise<{
    data: { session: { access_token: string; user: { id: string } } | null };
    error: { message: string } | null;
  }>;
  onAuthStateChange: (
    callback: (
      event: string,
      session: { access_token: string; user: { id: string } } | null,
    ) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
  /**
   * **Returns a URL; it does not navigate.**
   *
   * That is the whole reason this adapter grew a second port. On the web the SDK
   * redirects the page and the method never returns; on React Native there is no
   * page to redirect, so it hands back a link and expects the caller to open it.
   * Reading only `error` from this call — which is what this file used to do —
   * yields `{ ok: true }` and a user still looking at the sign-in screen.
   */
  signInWithPassword?: (args: { email: string; password: string }) => Promise<{ data: { session: { access_token: string; user: { id: string } } | null }; error: { message: string } | null }>;
  signUp?: (args: { email: string; password: string }) => Promise<{ data: { session: { access_token: string; user: { id: string } } | null }; error: { message: string } | null }>;
  signInWithOAuth: (args: {
    provider: SignInMethod;
    options: { redirectTo: string; skipBrowserRedirect: true };
  }) => Promise<{ data: { url: string | null }; error: { message: string } | null }>;
  /** Completes the PKCE exchange with the code the callback URL carried. */
  exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<{ error: { message: string } | null }>;
}

/**
 * Opening the provider's page and waiting for the app to be called back.
 *
 * A port rather than a direct import for the usual reason — it is a native
 * module and the whole flow would otherwise be untestable — and for one more:
 * this is the only place the app hands control to a browser, which makes it
 * worth having exactly one implementation and one description of what it
 * returns.
 */
export interface AuthBrowserPort {
  openAuthSession: (
    url: string,
    redirectTo: string,
  ) => Promise<{ readonly type: string; readonly url?: string }>;
}

const AUTH_FLOW_TIMEOUT_MS = 30_000;

function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Authentication timed out')), AUTH_FLOW_TIMEOUT_MS)),
  ]);
}

const toSession = (raw: { access_token: string; user: { id: string } } | null): Session | null => {
  if (raw === null) return null;
  // A session with no token is not a session. Supabase should never produce one,
  // but treating it as signed in would attach `Bearer undefined` to every
  // request and turn a clean sign-out into a wall of 401s.
  if (raw.access_token === '' || raw.user.id === '') return null;
  return { userId: raw.user.id, accessToken: raw.access_token };
};

export interface AuthProviderOptions {
  /** Where the provider sends the user back to. Must be listed in
   *  `supabase/config.toml` under `additional_redirect_urls`, or the auth server
   *  refuses the redirect and the user lands on an error page in a browser they
   *  did not ask to open. */
  readonly redirectTo: string;
}

export function createAuthProvider(
  auth: SupabaseAuthPort,
  browser: AuthBrowserPort,
  options: AuthProviderOptions,
): AuthProvider {
  return {
    currentSession: async () => {
      try {
        const { data, error } = await auth.getSession();
        // Fail closed: an error reading the session is treated as signed out.
        if (error !== null) return null;
        return toSession(data.session);
      } catch {
        return null;
      }
    },

    subscribe: (listener) => {
      const { data } = auth.onAuthStateChange((_event, session) => {
        // The event name is deliberately ignored. Every one of them — signed in,
        // signed out, token refreshed, user updated — is answered by the same
        // question: is there a usable session now? Branching on the name means
        // adding a case every time the SDK adds an event, and missing one means
        // holding a session that stopped being true.
        listener(toSession(session));
      });

      return () => {
        data.subscription.unsubscribe();
      };
    },

    /**
     * The whole round trip: ask for a URL, open it, wait to be called back,
     * exchange the code.
     *
     * Four steps rather than one because each can fail differently and the user
     * has to be told which. The one that used to be missing is the middle two —
     * without them the method resolved `{ ok: true }` while nothing at all had
     * happened, which is the worst shape a failure can take: the screen reports
     * success and stays exactly where it was.
     */
    signIn: async (method: SignInMethod, credentials): Promise<SignInOutcome> => {
      try {
        if (method === 'email') {
          if (credentials?.email === undefined || credentials.password === undefined) return { ok: false, reason: 'failed' };
          if (auth.signInWithPassword === undefined) return { ok: false, reason: 'unavailable' };
          const result = await auth.signInWithPassword({ email: credentials.email, password: credentials.password });
          return result.error === null && result.data.session !== null ? { ok: true } : { ok: false, reason: 'failed' };
        }
        const { data, error } = await auth.signInWithOAuth({
          provider: method,
          options: {
            redirectTo: options.redirectTo,
            // The SDK must not try to navigate. There is no page to navigate,
            // and on React Native the attempt is a silent no-op.
            skipBrowserRedirect: true,
          },
        });

        if (error !== null) {
          const cancelled = /cancel|dismiss|abort/i.test(error.message);
          return { ok: false, reason: cancelled ? 'cancelled' : 'failed' };
        }
        // No error and no URL means the SDK changed shape under us. Reported as
        // a failure rather than as a success nobody can see.
        if (data.url === null) return { ok: false, reason: 'failed' };

        const result = await withAuthTimeout(browser.openAuthSession(data.url, options.redirectTo));

        // Backing out of the provider's sheet is not an error and is never shown
        // as one — the user changed their mind, and a red banner for that is the
        // app arguing with them.
        if (result.type !== 'success' || result.url === undefined) {
          return { ok: false, reason: 'cancelled' };
        }

        const code = readAuthCode(result.url);
        // Called back without a code: the provider refused, or the user denied
        // the consent screen. Either way there is no session to exchange for.
        if (code === null) return { ok: false, reason: 'failed' };

        const exchange = await withAuthTimeout(auth.exchangeCodeForSession(code));
        return exchange.error === null ? { ok: true } : { ok: false, reason: 'failed' };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },

    signUp: async (credentials): Promise<SignInOutcome> => {
      try {
        if (auth.signUp === undefined) return { ok: false, reason: 'unavailable' };
        const result = await auth.signUp(credentials);
        return result.error === null && result.data.session !== null ? { ok: true } : { ok: false, reason: 'failed' };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },

    signOut: async () => {
      try {
        await auth.signOut();
      } catch {
        // Signing out cannot fail from the user's point of view. The local
        // session is cleared by the SDK either way, and reporting a failure
        // would leave them looking at a screen they asked to leave.
      }
    },
  };
}

/**
 * The authorisation code out of the callback URL.
 *
 * Parsed by hand rather than with `URL`, because React Native's implementation
 * is partial and a custom scheme like `twolmaps://` is exactly the shape it
 * handles worst — `new URL('twolmaps://cb?code=x').searchParams` is empty on
 * some engines and populated on others, which is the kind of difference that
 * works in a simulator and fails on a phone.
 *
 * The fragment is checked as well as the query. PKCE puts the code in the query;
 * an implicit-flow project puts tokens in the fragment, and a project switched
 * between the two mid-development would otherwise fail with no clue why.
 */
export function readAuthCode(callbackUrl: string): string | null {
  const match = /[?&#]code=([^&]+)/.exec(callbackUrl);
  const code = match?.[1];
  if (code === undefined || code === '') return null;
  return decodeURIComponent(code);
}
