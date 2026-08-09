import { useQuery } from '@tanstack/react-query';

import { useServices } from '@/features/api/services-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { GC_TIME_MS, STALE_TIME_MS, queryKeys } from '@/lib/query/client';
import { partitionByAllowance, type SavedRouteSummary } from '@/lib/route/persistence';

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
 * **Over the allowance is locked, not deleted.** Free keeps the last three and
 * history beyond a handful is one of the things Pro sells
 * ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)) — but the routes
 * over the line are still the user's own work, and a product that quietly
 * removes a driver's records in order to sell them back is a different product.
 * The query asks for more than the allowance for exactly that reason.
 */

/** Enough to fill History for a Pro user and to show a free user what they are
 *  missing, without paging a list nobody scrolls. */
const HISTORY_PAGE_SIZE = 50;

export interface SavedRoutes {
  readonly visible: readonly SavedRouteSummary[];
  /** Saved, real, and out of allowance. Shown as locked rows with the reason. */
  readonly locked: readonly SavedRouteSummary[];
  readonly isLoading: boolean;
  /** True when the read itself failed, as distinct from an empty history. The
   *  two need different screens and only one of them has a retry. */
  readonly isUnavailable: boolean;
  refetch: () => void;
}

export function useSavedRoutes(): SavedRoutes {
  const services = useServices();
  const { allowances } = useUsageQuota();

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
  const { visible, locked } = partitionByAllowance(summaries ?? [], allowances.savedRoutes);

  return {
    visible,
    locked,
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
