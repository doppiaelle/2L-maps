import { useQuery } from '@tanstack/react-query';

import { useServices } from '@/features/api/services-provider';
import type { UsageQuota } from '@/lib/api/quota-adapter';
import { optimizeAvailability, resolveAllowances } from '@/lib/entitlement/plans';
import type { OptimizeAvailability } from '@/lib/entitlement/plans';
import { GC_TIME_MS, STALE_TIME_MS } from '@/lib/query/client';
import type { PlanAllowances } from '@/types';

/**
 * What the user is allowed to do, read from the server.
 *
 * `/usage-quota` is the authoritative source ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md)).
 * This hook exists to make the *interface* honest — the Edge Function refuses a
 * metered call whatever this returns, so nothing here is a gate.
 *
 * Stale at a minute and refetched on focus, because a purchase may have
 * completed on another device and webhook delivery is asynchronous
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §6).
 *
 * **Unreachable falls back to free**, never to the last known paid state — the
 * same rule the billing adapter follows. Guessing upward gives the product away
 * to anyone who can turn off their radio; guessing downward is a bad five
 * minutes for a paying user, which their next successful request repairs.
 */

export const USAGE_QUOTA_QUERY_KEY = ['usage-quota'] as const;

export interface QuotaSnapshot {
  readonly quota: UsageQuota | null;
  readonly allowances: PlanAllowances;
  readonly isLoading: boolean;
}

export function useUsageQuota(): QuotaSnapshot {
  const services = useServices();

  const query = useQuery({
    queryKey: USAGE_QUOTA_QUERY_KEY,
    // Not merely disabled: an unconfigured build has nothing to ask, and a
    // query that fails on every mount would retry its way through the screen's
    // whole lifetime for an answer that cannot arrive.
    enabled: services !== null,
    staleTime: STALE_TIME_MS.entitlement,
    gcTime: GC_TIME_MS.quota,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => services?.quota.read(signal) ?? Promise.resolve(null),
  });

  const quota = query.data ?? null;

  return {
    quota,
    // Free is the answer when nothing is known, including while the first read
    // is in flight. The screen then shows the free allowances rather than a
    // blank where a number belongs.
    allowances: resolveAllowances(quota?.plan ?? 'free', quota?.serverLimits ?? null),
    isLoading: query.isLoading,
  };
}

/**
 * Whether this route can be optimized, and on what terms.
 *
 * The decision is `optimizeAvailability` in `lib/entitlement/plans.ts`; this
 * supplies it with server truth and nothing else. Unknown usage counts as zero
 * used — the server is the one that refuses, and pre-emptively blocking a user
 * whose quota we simply have not read yet would be the client deciding access.
 */
export function useOptimizeAvailability(
  stopCount: number,
  snapshot: QuotaSnapshot,
): OptimizeAvailability {
  return optimizeAvailability(
    snapshot.allowances,
    snapshot.quota?.usage ?? { optimizations: 0, autocompleteSessions: 0 },
    stopCount,
  );
}
