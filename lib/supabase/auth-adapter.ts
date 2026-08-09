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
  signInWithOAuth: (args: {
    provider: SignInMethod;
  }) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<{ error: { message: string } | null }>;
}

const toSession = (raw: { access_token: string; user: { id: string } } | null): Session | null => {
  if (raw === null) return null;
  // A session with no token is not a session. Supabase should never produce one,
  // but treating it as signed in would attach `Bearer undefined` to every
  // request and turn a clean sign-out into a wall of 401s.
  if (raw.access_token === '' || raw.user.id === '') return null;
  return { userId: raw.user.id, accessToken: raw.access_token };
};

export function createAuthProvider(auth: SupabaseAuthPort): AuthProvider {
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

    signIn: async (method: SignInMethod): Promise<SignInOutcome> => {
      try {
        const { error } = await auth.signInWithOAuth({ provider: method });
        if (error === null) return { ok: true };

        // Backing out of the provider's sheet is not an error and is never shown
        // as one — the user changed their mind, and a red banner for that is the
        // app arguing with them.
        const cancelled = /cancel|dismiss|abort/i.test(error.message);
        return { ok: false, reason: cancelled ? 'cancelled' : 'failed' };
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
