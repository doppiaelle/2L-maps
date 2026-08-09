import { z } from 'zod';

import type { ApiClient } from './client';
import type { EntitlementStatus, PlanTier, PlanUsage } from '@/types';

/**
 * `/usage-quota`, behind an adapter like every other endpoint.
 *
 * It is **the authoritative source of plan, entitlement and remaining quota**
 * ([`docs/33_API_CONTRACTS.md`](../../docs/33_API_CONTRACTS.md)) — read-only, no
 * upstream call, no quota consumed by reading it. The client's own RevenueCat
 * state drives the interface and never decides access
 * ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md)).
 *
 * One response answers the whole screen: which plan, which entitlement state,
 * how much is used, and when the period ends. `plan` and `status` are distinct
 * on purpose — a lapsed subscriber is on the free plan, not locked out
 * ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)).
 */

const limitSchema = z.object({
  name: z.string(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

const quotaResponseSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  plan: z.union([z.literal('free'), z.literal('day-pass'), z.literal('pro')]),
  status: z.union([
    z.literal('trial'),
    z.literal('active'),
    z.literal('lapsed'),
    z.literal('none'),
  ]),
  trialEndsAt: z.string().nullable(),
  renewsAt: z.string().nullable(),
  dayPassExpiresAt: z.string().nullable(),
  limits: z.array(limitSchema),
});

export interface UsageQuota {
  readonly plan: PlanTier;
  readonly status: EntitlementStatus;
  readonly usage: PlanUsage;
  /** What the server says the limits are, so a tuned free tier takes effect
   *  without a release (ADR-0015). Merged over the local fallback field by
   *  field in `resolveAllowances`. */
  readonly serverLimits: {
    readonly optimizationsPerPeriod?: number;
    readonly autocompleteSessionsPerPeriod?: number;
  };
  /** When the allowance resets. The screen says *when*, not merely that the
   *  user is out — "come back later" is not an answer a driver can act on. */
  readonly periodEndsAt: string;
  readonly trialEndsAt: string | null;
  readonly dayPassExpiresAt: string | null;
}

export interface QuotaProvider {
  read: (signal?: AbortSignal) => Promise<UsageQuota | null>;
}

export interface QuotaAdapterOptions {
  readonly client: ApiClient;
}

/** A limit the response did not mention is not zero — it is unknown, and the
 *  local fallback answers for it. Reading it as zero would tell a paying user
 *  they had run out. */
const limitOf = (
  limits: readonly z.infer<typeof limitSchema>[],
  name: string,
): { used: number; limit: number | undefined } => {
  const found = limits.find((entry) => entry.name === name);
  return { used: found?.used ?? 0, limit: found?.limit };
};

export function createQuotaProvider(options: QuotaAdapterOptions): QuotaProvider {
  const { client } = options;

  return {
    read: async (signal) => {
      const result = await client.get('/usage-quota', quotaResponseSchema, signal);
      // Null rather than a thrown error or a guessed plan: unreachable is a
      // state the caller has to render anyway, and guessing upward would give
      // the product away to anyone who can turn off their radio.
      if (!result.ok) return null;

      const optimizations = limitOf(result.data.limits, 'optimizations');
      const sessions = limitOf(result.data.limits, 'autocompleteSessions');

      return {
        plan: result.data.plan,
        status: result.data.status,
        usage: {
          optimizations: optimizations.used,
          autocompleteSessions: sessions.used,
        },
        serverLimits: {
          ...(optimizations.limit === undefined
            ? {}
            : { optimizationsPerPeriod: optimizations.limit }),
          ...(sessions.limit === undefined
            ? {}
            : { autocompleteSessionsPerPeriod: sessions.limit }),
        },
        periodEndsAt: result.data.period.to,
        trialEndsAt: result.data.trialEndsAt,
        dayPassExpiresAt: result.data.dayPassExpiresAt,
      };
    },
  };
}
