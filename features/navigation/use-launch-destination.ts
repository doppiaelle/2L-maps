import { useEffect, useState } from 'react';

import { useSession } from '@/features/auth/session-provider';
import { decideLaunch } from '@/lib/navigation/launch';
import type { LaunchDestination } from '@/lib/navigation/launch';
import type { DeepLinkTarget } from '@/lib/navigation/deep-links';

/**
 * Where this launch lands.
 *
 * The decision itself is `decideLaunch` in `lib/navigation/launch.ts`, tested
 * exhaustively without a renderer. What this hook adds is only the gathering:
 * session, store hydration, in-progress route, held deep link. Keeping the two
 * apart is what makes "a deep link arrives while a route is in progress"
 * something a test can express in one line rather than something reproducible
 * only on a device.
 */

export interface LaunchInputs {
  /** Every persisted store has finished reading from disk. */
  readonly isStoreHydrated: boolean;
  readonly hasRouteInProgress: boolean;
  readonly pendingDeepLink: DeepLinkTarget | null;
}

export function useLaunchDestination(inputs: LaunchInputs): LaunchDestination {
  const { session, isRestored } = useSession();

  return decideLaunch({
    // Both halves, never one. The session without the stores lands the user on
    // the right screen with the wrong contents, which reads as data loss.
    isRestored: isRestored && inputs.isStoreHydrated,
    isSignedIn: session !== null,
    hasRouteInProgress: inputs.hasRouteInProgress,
    pendingDeepLink: inputs.pendingDeepLink,
  });
}

/** The shape `zustand/persist` exposes. Named locally so this file does not
 *  depend on the middleware's own types leaking upward. */
export interface HydratableStore {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
}

/**
 * Whether every persisted store has finished loading.
 *
 * Polling would be simpler and wrong: hydration completes in a microtask on a
 * warm start and after a real disk read on a cold one, so a poll either burns
 * frames or adds a delay to the launch this product measures in milliseconds
 * (`CLAUDE.md` §6).
 */
export function useStoresHydrated(stores: readonly HydratableStore[]): boolean {
  const [isHydrated, setIsHydrated] = useState(() =>
    stores.every((store) => store.persist.hasHydrated()),
  );

  useEffect(() => {
    if (isHydrated) return undefined;

    const check = () => {
      if (stores.every((store) => store.persist.hasHydrated())) setIsHydrated(true);
    };

    const unsubscribes = stores.map((store) => store.persist.onFinishHydration(check));
    // Checked once more after subscribing: a store that finished between the
    // initial state and this effect would otherwise never fire its listener,
    // and the splash would be held for ever.
    check();

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [stores, isHydrated]);

  return isHydrated;
}
