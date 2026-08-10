import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useConnectivity } from './connectivity-provider';
import { useRouteSync } from '@/features/routes/use-route-sync';
import { queryKeys } from '@/lib/query/client';

/**
 * What happens when the signal comes back.
 *
 * A driver spends the day in and out of coverage. The interesting moment is not
 * losing it — everything already works from the local stores and the persisted
 * cache — but **regaining** it, when the server's copy of the day is behind and
 * nothing has asked it to catch up.
 *
 * Two things happen on that edge, and the order matters:
 *
 * 1. **Push first.** The route is re-synced, so the marks made underground reach
 *    the server before anything is read back. Reading first and writing second
 *    would fetch a version of the route that predates the work just done, and
 *    the next render would show a driver their morning undone.
 * 2. **Then invalidate the reads.** History and the address book may have moved
 *    on another device.
 *
 * **Only on the edge, never on the state.** Firing while offline is pointless
 * and firing repeatedly while online is a request loop, so the previous value is
 * held and compared.
 */
export function useDrainOnReconnect(): void {
  const connectivity = useConnectivity();
  const queryClient = useQueryClient();
  const { sync } = useRouteSync();

  // `unknown` is the initial value and resolves to `online` within a second on
  // a working connection. Seeding with it means the first resolution is not
  // mistaken for a reconnection — there was nothing to catch up on.
  const previous = useRef(connectivity);

  useEffect(() => {
    const wasOffline = previous.current === 'offline';
    previous.current = connectivity;

    if (!wasOffline || connectivity !== 'online') return;

    sync();
    void queryClient.invalidateQueries({ queryKey: queryKeys.savedRoutes() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook() });
  }, [connectivity, sync, queryClient]);
}
