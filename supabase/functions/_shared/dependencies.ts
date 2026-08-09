import { ApiError } from './errors';
import {
  allowanceFor,
  quotaResetsAt,
  quotaWindowStart,
  resolvePlan,
  type EntitlementRow,
  type PlanTier,
} from './plans';
import type {
  AuthenticatedUser,
  EntitlementState,
  PipelineDependencies,
  QuotaState,
  RateLimitState,
  UpstreamOutcome,
  UsageRecord,
} from './pipeline';

/**
 * The Supabase-backed pipeline dependencies, shared by every metered function.
 *
 * All four authorisation reads happen here, against the database, using the
 * service role. None of them consults the client (ADR-0011): the client's own
 * billing state drives its interface and never its access, and the two can
 * legitimately disagree after an offline period, a refund or a family-sharing
 * change. When they do, this is what is right.
 *
 * The database client is injected rather than constructed. That keeps this file
 * runnable in a test without a Supabase project, and keeps the service-role key
 * in exactly one place — the entrypoint that reads it from the environment.
 */

/** The narrow slice of the Supabase client this module uses. Depending on the
 *  interface rather than the SDK keeps ADR-0006's seam intact and makes the
 *  queries mockable without the SDK present. */
export interface DatabaseClient {
  queryOne: <T>(sql: string, params: readonly unknown[]) => Promise<T | null>;
  queryMany: <T>(sql: string, params: readonly unknown[]) => Promise<readonly T[]>;
  execute: (sql: string, params: readonly unknown[]) => Promise<void>;
}

export interface TokenVerifier {
  /** Returns the user id for a valid Supabase JWT, or null. */
  verify: (authorizationHeader: string | null) => Promise<string | null>;
}

export interface QuotaLimits {
  /**
   * Short-window velocity ceiling, and the window itself in seconds.
   *
   * Burst is deliberately **not** per plan. It exists to catch a stuck input or
   * a retry loop, which is a client defect rather than a purchase — charging a
   * paying user a lower ceiling for the same bug would be arbitrary, and giving
   * a free user a higher one would make them the cheaper way to attack us.
   */
  readonly burst: Readonly<
    Record<string, { readonly max: number; readonly windowSeconds: number }>
  >;
}

export interface DependencyContext<TRequest, TResult> {
  readonly endpoint: string;
  readonly database: DatabaseClient;
  readonly tokens: TokenVerifier;
  readonly limits: QuotaLimits;
  readonly authorizationHeader: string | null;
  callUpstream: (request: TRequest, user: AuthenticatedUser) => Promise<UpstreamOutcome<TResult>>;
  readCache?: (request: TRequest) => Promise<TResult | null>;
  writeCache?: (request: TRequest, result: TResult) => Promise<void>;
}

export function buildDependencies<TRequest, TResult>(
  context: DependencyContext<TRequest, TResult>,
): PipelineDependencies<TRequest, TResult> {
  const { database, tokens, limits, endpoint } = context;

  // Held between step 3 and step 4 so the quota window can be derived from the
  // same row the plan was. A day pass has a window that is not the calendar
  // month, and re-reading the row to find it would let the two steps disagree.
  let entitlementRow: EntitlementRow | null = null;

  return {
    endpoint,

    authenticate: async (): Promise<AuthenticatedUser | null> => {
      const userId = await tokens.verify(context.authorizationHeader);
      return userId === null ? null : { userId };
    },

    readEntitlement: async (userId: string): Promise<EntitlementState> => {
      entitlementRow = await database.queryOne<EntitlementRow>(
        `select status, plan, trial_ends_at, renews_at, day_pass_expires_at
           from user_entitlements where user_id = $1`,
        [userId],
      );

      const plan = resolvePlan(entitlementRow, new Date());
      return {
        // Every plan grants access to its own allowances, free included
        // (ADR-0015). Refusing here for want of a subscription is the hard
        // paywall that ADR removed, and it would answer 402 to every new
        // account on its first search.
        hasEntitlement: true,
        status: entitlementRow?.status ?? 'none',
        plan,
      };
    },

    checkRateLimit: async (userId: string, forEndpoint: string): Promise<RateLimitState> => {
      const burst = limits.burst[forEndpoint];
      if (burst === undefined) return { isLimited: false, retryAfterSeconds: 0 };

      const row = await database.queryOne<{ n: number }>(
        `select count(*)::int as n
           from usage_events
          where user_id = $1
            and endpoint = $2
            and occurred_at > now() - make_interval(secs => $3)`,
        [userId, forEndpoint, burst.windowSeconds],
      );
      const used = row?.n ?? 0;
      return {
        isLimited: used >= burst.max,
        retryAfterSeconds: burst.windowSeconds,
      };
    },

    checkQuota: async (
      userId: string,
      forEndpoint: string,
      entitlement: EntitlementState,
    ): Promise<QuotaState> => {
      const now = new Date();
      const plan = entitlement.plan as PlanTier;
      const limit = allowanceFor(plan, forEndpoint);

      if (limit === undefined) {
        // An endpoint with no configured allowance is a configuration gap, not a
        // free pass. Failing closed is the only safe direction on a metered call.
        throw new ApiError('INTERNAL', 'Quota not configured for this endpoint');
      }

      const row = await database.queryOne<{ used: number }>(
        `select coalesce(sum(units), 0)::int as used
           from usage_events
          where user_id = $1
            and endpoint = $2
            and occurred_at >= $3`,
        [userId, forEndpoint, quotaWindowStart(plan, entitlementRow, now).toISOString()],
      );
      const used = row?.used ?? 0;

      return {
        isExhausted: used >= limit,
        limit,
        used,
        resetsAt: quotaResetsAt(plan, entitlementRow, now).toISOString(),
      };
    },

    ...(context.readCache === undefined ? {} : { readCache: context.readCache }),
    ...(context.writeCache === undefined ? {} : { writeCache: context.writeCache }),

    callUpstream: context.callUpstream,

    recordUsage: async (record: UsageRecord): Promise<void> => {
      // Recorded for every outcome, hit or miss. This table is what makes
      // docs/31_COST_MODEL.md verifiable rather than theoretical, and it carries
      // no address, coordinate or place_id (docs/21_ANALYTICS.md).
      await database.execute(
        `insert into usage_events (user_id, endpoint, tier, cache_hit, units)
         values ($1, $2, $3, $4, $5)`,
        [record.userId, record.endpoint, record.tier, record.cacheHit, record.units],
      );
    },
  };
}
