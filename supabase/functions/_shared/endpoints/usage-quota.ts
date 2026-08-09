import { startOfNextMonth } from '../dependencies';

import type { HandlerContext } from '../handler';

/**
 * `/usage-quota` — what this user may do, and how much of it is left.
 *
 * The single authoritative answer about entitlement and allowances
 * ([ADR-0011](../../../../docs/adr/0011-server-side-quota-enforcement.md)). The
 * client carries a fallback copy of these numbers only so it can render an
 * allowance bar offline; when the two disagree, this wins
 * ([ADR-0015](../../../../docs/adr/0015-ad-supported-free-tier.md)).
 *
 * Entitlement and allowances come back together because they are the same
 * question asked twice, and two round trips on every app start to render one
 * screen is the sort of cost this product spends its discipline avoiding.
 */

export type PlanTier = 'free' | 'day-pass' | 'pro';
export type EntitlementStatus = 'trial' | 'active' | 'lapsed' | 'none';

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

/** Per-plan monthly allowances, from docs/20_SUBSCRIPTIONS.md §6. Server-side so
 *  they move without an app release, which is the control that keeps the
 *  ad-supported free tier cost-neutral. */
const ALLOWANCES: Readonly<Record<PlanTier, Readonly<Record<string, number>>>> = {
  free: { optimizations: 15, autocompleteSessions: 10 },
  'day-pass': { optimizations: 25, autocompleteSessions: 40 },
  pro: { optimizations: 300, autocompleteSessions: 1_200 },
};

interface EntitlementRow {
  readonly status: string;
  readonly plan: string | null;
  readonly trial_ends_at: string | null;
  readonly renews_at: string | null;
  readonly day_pass_expires_at: string | null;
}

interface UsageRow {
  readonly optimizations: number;
  readonly autocomplete_sessions: number;
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

  const usage = await context.database.queryOne<UsageRow>(
    `select
       count(*) filter (where endpoint = '/optimize')            as optimizations,
       count(*) filter (where endpoint = '/places-autocomplete') as autocomplete_sessions
     from usage_events
     where user_id = $1 and occurred_at >= date_trunc('month', $2::timestamptz)`,
    [userId, now.toISOString()],
  );

  const plan = resolvePlan(entitlement, now);
  const allowance = ALLOWANCES[plan];

  return {
    period: {
      from: startOfMonth(now).toISOString().slice(0, 10),
      to: startOfNextMonth(now).toISOString().slice(0, 10),
    },
    plan,
    status: resolveStatus(entitlement?.status ?? null),
    trialEndsAt: entitlement?.trial_ends_at ?? null,
    renewsAt: entitlement?.renews_at ?? null,
    dayPassExpiresAt: entitlement?.day_pass_expires_at ?? null,
    limits: [
      {
        name: 'optimizations',
        used: usage?.optimizations ?? 0,
        limit: allowance['optimizations'] ?? 0,
      },
      {
        name: 'autocompleteSessions',
        used: usage?.autocomplete_sessions ?? 0,
        limit: allowance['autocompleteSessions'] ?? 0,
      },
    ],
  };
}

/**
 * Which rung this user is actually on right now.
 *
 * A day pass is checked before the stored plan and against the clock, because
 * it is consumable: the row keeps saying `day-pass` after it expires, and
 * trusting it would hand out Pro allowances indefinitely for €1.99.
 *
 * No row at all means free — a user who has never bought anything, which is the
 * common case now that a free tier exists rather than an error state.
 */
function resolvePlan(row: EntitlementRow | null, now: Date): PlanTier {
  if (row === null) return 'free';

  if (row.day_pass_expires_at !== null && Date.parse(row.day_pass_expires_at) > now.getTime()) {
    return 'day-pass';
  }

  // `grace` keeps a user working through a billing retry rather than locking
  // them out of a route they are halfway through driving.
  const entitled = row.status === 'trial' || row.status === 'active' || row.status === 'grace';
  return entitled ? 'pro' : 'free';
}

function resolveStatus(status: string | null): EntitlementStatus {
  switch (status) {
    case 'trial':
      return 'trial';
    case 'active':
    case 'grace':
      return 'active';
    case 'lapsed':
    case 'cancelled':
    case 'expired':
      return 'lapsed';
    default:
      return 'none';
  }
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
