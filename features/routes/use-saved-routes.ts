import { useQuery } from '@tanstack/react-query';

import { useServices } from '@/features/api/services-provider';
import { GC_TIME_MS, STALE_TIME_MS, queryKeys } from '@/lib/query/client';
import type { SavedRouteSummary } from '@/lib/route/persistence';

/**
 * The user's saved routes.
 *
 * **Retained for twenty-four hours, and that retention *is* the offline story**
 * ([ADR-0008](../../docs/adr/0008-offline-scope.md),
 * [`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §6). A
 * driver with no signal must still be able to open History and read the day
 * they are part-way through; a shorter retention would make the offline states
 * elsewhere in this app decorative.
 *
 * History is the user's own work and is never plan-gated. It is also a cost
 * control: reopening an unchanged optimized route must not buy the same
 * optimization again (ADR-0029).
 */

/** Enough to fill the first History page without paging a list nobody scrolls. */
const HISTORY_PAGE_SIZE = 50;

export interface SavedRoutes {
  readonly routes: readonly SavedRouteSummary[];
  readonly isLoading: boolean;
  /** True when the read itself failed, as distinct from an empty history. The
   *  two need different screens and only one of them has a retry. */
  readonly isUnavailable: boolean;
  refetch: () => void;
}

export function useSavedRoutes(): SavedRoutes {
  const services = useServices();

  const query = useQuery({
    queryKey: queryKeys.savedRoutes(),
    // Not merely disabled: an unconfigured build has nothing to ask, and a query
    // that fails on every mount would retry through the screen's whole lifetime
    // for an answer that cannot arrive.
    enabled: services !== null,
    staleTime: STALE_TIME_MS.savedData,
    gcTime: GC_TIME_MS.savedData,
    queryFn: () => services?.routes.list(HISTORY_PAGE_SIZE) ?? Promise.resolve(null),
  });

  const summaries = query.data ?? null;
  return {
    routes: summaries ?? [],
    isLoading: query.isLoading,
    // The adapter returns null for an answer it could not read, which is not the
    // same as none. Saying "you have never saved a route" to somebody who has is
    // a lie they cannot argue with.
    isUnavailable: !query.isLoading && summaries === null,
    refetch: () => {
      void query.refetch();
    },
  };
}
