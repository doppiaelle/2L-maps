import { useCallback, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import { useDraftRouteStore, useRouteProgressStore } from '@/features/stores';

/**
 * Opening a saved route into the working surface.
 *
 * **Both halves land together or neither does.** A route and the progress
 * through it are restored in one step, because a route restored without its
 * progress puts a driver back at stop one on a day they are halfway through —
 * which is the same experience as data loss, arrived at differently
 * ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §5).
 *
 * **No coordinate arrives with it.** The rows carry none by design
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)),
 * so the stops land with `place_id` and nothing else and Plan resolves them
 * through `useResolvedPlaces` — which is also where a stop that can no longer be
 * resolved gets named rather than silently blanked.
 */

export type OpenFailure = 'not-found' | 'unavailable';

export interface OpenRoute {
  readonly isOpening: boolean;
  readonly failure: OpenFailure | null;
  /** Resolves true when the route is in the stores and the caller may navigate. */
  open: (routeId: string) => Promise<boolean>;
  clearFailure: () => void;
}

export function useOpenRoute(): OpenRoute {
  const services = useServices();
  const [isOpening, setIsOpening] = useState(false);
  const [failure, setFailure] = useState<OpenFailure | null>(null);

  const replaceDraft = useDraftRouteStore((store) => store.replaceDraft);
  const restoreProgress = useRouteProgressStore((store) => store.restore);

  const open = useCallback(
    async (routeId: string): Promise<boolean> => {
      if (services === null) {
        setFailure('unavailable');
        return false;
      }

      setIsOpening(true);
      setFailure(null);

      const loaded = await services.routes.load(routeId);
      setIsOpening(false);

      if (loaded === null) {
        // A link to a route that was deleted, or to somebody else's — RLS
        // returns nothing for both, and both are "not found" to the person
        // holding the link. Saying which would be an ownership oracle.
        setFailure('not-found');
        return false;
      }

      // Draft first: the progress store prunes to the stops it is given, and
      // restoring progress against the previous route's stops would drop every
      // mark before the new stops arrived.
      replaceDraft(loaded.draft);
      restoreProgress(loaded.progress);
      return true;
    },
    [services, replaceDraft, restoreProgress],
  );

  return {
    isOpening,
    failure,
    open,
    clearFailure: () => {
      setFailure(null);
    },
  };
}
