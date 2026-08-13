import {
  ALLOWANCES,
  REPORTED_LIMITS,
  quotaResetsAt,
  quotaWindowStart,
  resolvePlan,
  resolveStatus,
  type EntitlementRow,
  type EntitlementStatus,
  type PlanTier,
} from '../plans.ts';

import type { HandlerContext } from '../handler.ts';

/**
 * `/usage-quota` — what this user may do, and how much of it is left.
 *
 * The single authoritative answer about entitlement and allowances
 * ([ADR-0011](../../../../docs/adr/0011-server-side-quota-enforcement.md)). The
 * client carries a fallback copy of these numbers only so it can render an
 * allowance bar offline; when the two disagree, this wins
 * ([ADR-0029](../../../../docs/adr/0029-single-driver-wedge-and-subscription-first-freemium.md)).
 *
 * Entitlement and allowances come back together because they are the same
 * question asked twice, and two round trips on every app start to render one
 * screen is the sort of cost this product spends its discipline avoiding.
 *
 * **Every number here comes from `plans.ts`, which the quota gate also reads.**
 * Held separately they drift, and the drift is invisible from either side: an
 * allowance bar reading "4 of 15 left" above a button that answers 429 gives the
 * user no way to tell which of the two is lying.
 */

export type { PlanTier, EntitlementStatus };

export interface UsageQuotaResponse {
  readonly period: { readonly from: string; readonly to: string };
  readonly plan: PlanTier;
  readonly status: EntitlementStatus;
  readonly trialEndsAt: string | null;
  readonly renewsAt: string | null;
  readonly dayPassExpiresAt: string | null;
  readonly limits: readonly {
    readonly name: string;
    readonly used: number;
    readonly limit: number;
  }[];
}

interface UsageRow {
  readonly endpoint: string;
  readonly used: number;
}

export async function readUsageQuota(
  userId: string,
  context: HandlerContext,
  now: Date = new Date(),
): Promise<UsageQuotaResponse> {
  const entitlement = await context.database.queryOne<EntitlementRow>(
    `select status, plan, trial_ends_at, renews_at, day_pass_expires_at
       from user_entitlements where user_id = $1`,
    [userId],
  );

  const plan = resolvePlan(entitlement, now);
  const windowStart = quotaWindowStart(plan, entitlement, now);
  const resetsAt = quotaResetsAt(plan, entitlement, now);

  // Summed by `units`, and grouped rather than counted per endpoint in separate
  // filters, because `units` is not always one: `/place-details` charges what it
  // actually fetched, and counting rows would report a twenty-five stop
  // resolution as a single use.
  const usage = await context.database.queryMany<UsageRow>(
    `select endpoint, coalesce(sum(units), 0)::int as used
       from usage_events
      where user_id = $1 and occurred_at >= $2::timestamptz
      group by endpoint`,
    [userId, windowStart.toISOString()],
  );

  const usedByEndpoint = new Map(usage.map((row) => [row.endpoint, row.used]));
  const allowance = ALLOWANCES[plan];

  return {
    period: {
      from: windowStart.toISOString().slice(0, 10),
      to: resetsAt.toISOString().slice(0, 10),
    },
    plan,
    status: resolveStatus(entitlement?.status ?? null),
    trialEndsAt: entitlement?.trial_ends_at ?? null,
    renewsAt: entitlement?.renews_at ?? null,
    dayPassExpiresAt: entitlement?.day_pass_expires_at ?? null,
    limits: REPORTED_LIMITS.map(({ name, endpoint }) => ({
      name,
      used: usedByEndpoint.get(endpoint) ?? 0,
      limit: allowance[endpoint] ?? 0,
    })),
  };
}
