import { QueryClient } from '@tanstack/react-query';

/**
 * The React Query client, and the cache policy that makes offline read work.
 *
 * React Query owns server state entirely (`CLAUDE.md` §4). Nothing here is
 * copied into Zustand: a query result duplicated into a store is a second
 * source of truth that will eventually disagree with the first, and the
 * disagreement always surfaces at the worst moment.
 *
 * The times below come from [`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md)
 * §6. Each is a product decision rather than a default:
 *
 * - **Saved routes, route detail, history** are stale at 5 minutes and kept for
 *   24 hours, because they must be readable with no network at all. The long
 *   retention *is* the offline story ([ADR-0008](../../docs/adr/0008-offline-scope.md)).
 * - **Entitlement** is stale at 1 minute and refetched on foreground, because a
 *   purchase may have completed elsewhere and webhook delivery is asynchronous.
 * - **Quota** is stale at 1 minute and refetched before any metered action, so
 *   the allowance bar is not showing last week's number when it matters.
 */

export const STALE_TIME_MS = {
  /** Saved routes, route detail, history. */
  savedData: 5 * 60_000,
  /** Entitlement and quota, which change out from under us. */
  entitlement: 60_000,
} as const;

export const GC_TIME_MS = {
  /** Long enough to be read through a day with no network. */
  savedData: 24 * 60 * 60_000,
  entitlement: 60 * 60_000,
  quota: 10 * 60_000,
} as const;

/**
 * Retry policy.
 *
 * A 4xx is never retried: the client does not construct upstream requests, so a
 * malformed one is our defect, and retrying burns quota while hiding the bug
 * (docs/33_API_CONTRACTS.md §9). The client's own taxonomy is used rather than
 * a status code, because by the time a failure reaches here it has already been
 * translated.
 */
export const NON_RETRYABLE = new Set([
  'UNAUTHENTICATED',
  'NO_ENTITLEMENT',
  'QUOTA_EXHAUSTED',
  'INVALID_REQUEST',
  'MISSING_SESSION_TOKEN',
]);

export function shouldRetry(failureCount: number, code: string | null): boolean {
  if (code !== null && NON_RETRYABLE.has(code)) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS.savedData,
        gcTime: GC_TIME_MS.savedData,
        // The default would refetch on every window focus. On a phone that is
        // every app resume, and each one is a billed call for data that is
        // almost always unchanged. Foreground refetch is opted into per query
        // — entitlement wants it, saved routes do not.
        refetchOnWindowFocus: false,
        // Nothing is fetched while offline. The persisted cache answers instead,
        // which is the whole point of keeping it for 24 hours.
        networkMode: 'offlineFirst',
        retry: (failureCount, error) => shouldRetry(failureCount, codeOf(error)),
      },
      mutations: {
        // A mutation issued offline is queued rather than retried in place
        // (docs/11_STATE_MANAGEMENT.md §8); retrying here would race the queue.
        networkMode: 'offlineFirst',
        retry: false,
      },
    },
  });
}

/** Read our error code off whatever React Query hands back, without asserting a
 *  shape we did not produce. */
function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * Query keys, in one place.
 *
 * Centralised so an invalidation cannot miss a cache entry because two call
 * sites spelled the same key differently — a bug that shows up as stale data
 * on one screen and fresh data on the next, with nothing in between to explain
 * it.
 */
export const queryKeys = {
  savedRoutes: () => ['routes'] as const,
  route: (routeId: string) => ['routes', routeId] as const,
  history: () => ['history'] as const,
  entitlement: () => ['entitlement'] as const,
  addressBook: () => ['address-book'] as const,
} as const;
