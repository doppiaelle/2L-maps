import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AuthProvider, Session, SignInMethod, SignInOutcome } from '@/lib/providers/types';

/**
 * The session, held once for the whole tree.
 *
 * This is the one piece of server state that does not live in React Query, and
 * the exception is deliberate: the session is not fetched, it is *subscribed
 * to*. A token refresh, an expiry, a sign-out on another device all arrive
 * without anyone asking, and a query cache would be the last to know
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md)).
 *
 * `isRestored` is the flag the whole launch sequence turns on. Until the
 * persisted session has been read, the app knows nothing and must render
 * nothing — showing a signed-out screen and then swapping in a signed-in one is
 * a flash that reads as a bug ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §4).
 */

export interface SessionContextValue {
  readonly session: Session | null;
  readonly isRestored: boolean;
  signIn: (method: SignInMethod) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  /** Null when this build has no Supabase project configured. The app then
   *  restores immediately into the signed-out state and says so, rather than
   *  hanging on a splash screen waiting for a client that does not exist. */
  readonly auth: AuthProvider | null;
  readonly children: React.ReactNode;
}

export function SessionProvider({ auth, children }: SessionProviderProps): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestored, setIsRestored] = useState(auth === null);

  useEffect(() => {
    if (auth === null) return undefined;

    let cancelled = false;

    // Subscribed *before* the first read, not after. A sign-in completing in the
    // gap between the two would otherwise be missed, and the app would sit on
    // the sign-in screen holding a valid session.
    const unsubscribe = auth.subscribe((next) => {
      if (cancelled) return;
      setSession(next);
      setIsRestored(true);
    });

    void auth.currentSession().then((restored) => {
      if (cancelled) return;
      setSession(restored);
      setIsRestored(true);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth]);

  const signIn = useCallback(
    async (method: SignInMethod): Promise<SignInOutcome> => {
      if (auth === null) return { ok: false, reason: 'unavailable' };
      return auth.signIn(method);
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    // Cleared locally as well as remotely. Waiting for the provider to confirm
    // would leave the user on a signed-in screen while the network decides.
    setSession(null);
    if (auth !== null) await auth.signOut();
  }, [auth]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, isRestored, signIn, signOut }),
    [session, isRestored, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  // Throwing rather than returning a signed-out default: a missing provider is a
  // wiring mistake, and a default would turn it into a silent sign-out that
  // looks like a session expiry.
  if (value === null) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}
