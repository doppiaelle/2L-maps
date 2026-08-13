import { ApiError, statusFor, type DegradationHint, type ErrorEnvelope } from './errors.ts';

/**
 * The seven-step pipeline every metered function runs.
 *
 *   1 verify JWT        → 401
 *   2 check entitlement → 402
 *   3 rate limit        → 429 RATE_LIMITED
 *   4 quota             → 429 QUOTA_EXHAUSTED
 *   5 cache lookup      → hit returns, still recorded
 *   6 upstream call     → the only step that costs money
 *   7 record usage      → always, hit or miss
 *
 * **The order is load-bearing** (docs/13_BACKEND.md §4), and two placements in
 * particular are decisions rather than conveniences.
 *
 * Entitlement precedes rate limiting because reversing them tells a lapsed user
 * they are going too fast when the truth is they are not subscribed. The error a
 * user sees has to name the real cause, or the action they take next cannot fix
 * it.
 *
 * Cache lookup follows the quota check because a hit costs us nothing upstream
 * and must still consume allowance. Free hits would let a user with a recurring
 * route consume unlimited value while the quota reports them idle — and recurring
 * routes are precisely what this segment has.
 *
 * Every dependency is injected. That is what lets the order be tested without a
 * network, a database or a Deno runtime: mock the network, never the function
 * under test (CLAUDE.md §5).
 */

export interface AuthenticatedUser {
  readonly userId: string;
}

export interface EntitlementState {
  /**
   * Whether this user may use metered features **at all**.
   *
   * Since [ADR-0029](../../../docs/adr/0029-single-driver-wedge-and-subscription-first-freemium.md) a free
   * user is entitled — to the free allowances. This is false only where there is
   * genuinely no rung to stand on, which today means nothing: the flag stays
   * because the step is the right place to refuse a suspended or fraudulent
   * account, and removing it would leave nowhere to put that.
   */
  readonly hasEntitlement: boolean;
  readonly status: string;
  /** Which rung, and therefore which allowances the quota step applies. */
  readonly plan: string;
}

export interface QuotaState {
  readonly isExhausted: boolean;
  readonly limit: number;
  readonly used: number;
  readonly resetsAt: string;
}

export interface RateLimitState {
  readonly isLimited: boolean;
  readonly retryAfterSeconds: number;
}

export interface UsageRecord {
  readonly userId: string;
  readonly endpoint: string;
  readonly tier: string | null;
  readonly cacheHit: boolean;
  readonly units: number;
}

/**
 * What the pipeline needs from the outside world.
 *
 * `readCache` and `writeCache` are optional: `/places-autocomplete` deliberately
 * has no cache, because caching would breach Places session semantics and return
 * stale suggestions (docs/13_BACKEND.md §6).
 */
export interface PipelineDependencies<TRequest, TResult> {
  readonly endpoint: string;
  authenticate: (request: TRequest) => Promise<AuthenticatedUser | null>;
  readEntitlement: (userId: string) => Promise<EntitlementState>;
  checkRateLimit: (userId: string, endpoint: string) => Promise<RateLimitState>;
  /**
   * The allowance is per plan, so the plan is passed in rather than read again.
   *
   * Explicit because it is an ordering dependency: step 4 cannot answer without
   * what step 3 learned. Re-reading the entitlement here would be a second
   * database round trip that can disagree with the first — a user whose day pass
   * expires between the two would be entitled and out of allowance in the same
   * request.
   */
  checkQuota: (
    userId: string,
    endpoint: string,
    entitlement: EntitlementState,
  ) => Promise<QuotaState>;
  readCache?: (request: TRequest) => Promise<TResult | null>;
  callUpstream: (request: TRequest, user: AuthenticatedUser) => Promise<UpstreamOutcome<TResult>>;
  writeCache?: (request: TRequest, result: TResult) => Promise<void>;
  recordUsage: (record: UsageRecord) => Promise<void>;
}

export interface UpstreamOutcome<TResult> {
  readonly result: TResult;
  /** Which engine served it, for the usage record. Null where the notion does not apply. */
  readonly tier: string | null;
  /** Billable units. Stops for T2, which bills per stop; requests otherwise. */
  readonly units: number;
}

export type PipelineOutcome<TResult> =
  | { readonly ok: true; readonly status: 200; readonly body: TResult; readonly cacheHit: boolean }
  | { readonly ok: false; readonly status: number; readonly body: ErrorEnvelope };

/** The steps, in order, for assertions that the order itself has not changed. */
export const PIPELINE_STEPS = [
  'authenticate',
  'entitlement',
  'rate-limit',
  'quota',
  'cache',
  'upstream',
  'record',
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export async function runPipeline<TRequest, TResult>(
  request: TRequest,
  deps: PipelineDependencies<TRequest, TResult>,
  /** Records which steps ran, so tests can assert the order and the short-circuits. */
  trace: PipelineStep[] = [],
): Promise<PipelineOutcome<TResult>> {
  try {
    // 1 — who is calling
    trace.push('authenticate');
    const user = await deps.authenticate(request);
    if (user === null) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue');
    }

    // 2 — may they use metered features at all
    trace.push('entitlement');
    const entitlement = await deps.readEntitlement(user.userId);
    if (!entitlement.hasEntitlement) {
      throw new ApiError('NO_ENTITLEMENT', 'Your subscription has ended', {
        details: { status: entitlement.status },
      });
    }

    // 3 — burst protection
    trace.push('rate-limit');
    const rate = await deps.checkRateLimit(user.userId, deps.endpoint);
    if (rate.isLimited) {
      throw new ApiError('RATE_LIMITED', 'Too many requests just now', {
        details: { retryAfterSeconds: rate.retryAfterSeconds },
        degradationHint: 'RETRY_LATER',
      });
    }

    // 4 — monthly allowance
    trace.push('quota');
    const quota = await deps.checkQuota(user.userId, deps.endpoint, entitlement);
    if (quota.isExhausted) {
      throw new ApiError('QUOTA_EXHAUSTED', 'Monthly limit reached', {
        details: { limit: quota.limit, used: quota.used, resetsAt: quota.resetsAt },
        degradationHint: 'T0_AVAILABLE',
      });
    }

    // 5 — a hit costs nothing upstream, and still consumes allowance
    trace.push('cache');
    if (deps.readCache !== undefined) {
      const cached = await deps.readCache(request);
      if (cached !== null) {
        trace.push('record');
        await deps.recordUsage({
          userId: user.userId,
          endpoint: deps.endpoint,
          tier: null,
          cacheHit: true,
          units: 1,
        });
        return { ok: true, status: 200, body: cached, cacheHit: true };
      }
    }

    // 6 — the only step that costs money
    trace.push('upstream');
    const outcome = await deps.callUpstream(request, user);

    if (deps.writeCache !== undefined) {
      await deps.writeCache(request, outcome.result);
    }

    // 7 — always, hit or miss
    trace.push('record');
    await deps.recordUsage({
      userId: user.userId,
      endpoint: deps.endpoint,
      tier: outcome.tier,
      cacheHit: false,
      units: outcome.units,
    });

    return { ok: true, status: 200, body: outcome.result, cacheHit: false };
  } catch (error) {
    return toFailure(error);
  }
}

function toFailure<TResult>(error: unknown): PipelineOutcome<TResult> {
  if (error instanceof ApiError) {
    // **Logged too, and this branch is the one that was missing.** A deliberate
    // refusal is still the answer to "why does nothing work" — an upstream that
    // rejects us reaches here as `UPSTREAM_UNAVAILABLE` and used to leave no
    // trace at all, so a wrong model id and a revoked key looked identical from
    // the outside and neither appeared in the logs.
    //
    // `details` is ours: we construct every field (a retry delay, a limit, an
    // upstream status). No upstream body and no credential passes through it.
    console.error(
      JSON.stringify({
        event: 'request_refused',
        code: error.code,
        details: error.options.details ?? {},
      }),
    );
    return { ok: false, status: statusFor(error.code), body: error.toEnvelope() };
  }

  // An unexpected throw becomes a generic INTERNAL. The original message never
  // reaches the client: error objects are the most common way a query, a stack
  // trace or a credential ends up somewhere it should not be.
  //
  // **It is logged before it is discarded, and this is the catch that matters.**
  // The adapters are built inside `callUpstream`, so a missing upstream key
  // throws *here* rather than in `serveWith` — which meant the single most
  // likely production failure, a secret that was never set, produced `INTERNAL`
  // to the client and not one line anywhere an operator could read.
  //
  // Message and type only, no stack: our own throws name the missing key and
  // never its value (§9 rule 8).
  console.error(
    JSON.stringify({
      event: 'pipeline_failed',
      type: error instanceof Error ? error.name : typeof error,
      reason: error instanceof Error ? error.message : 'non-error thrown',
    }),
  );

  return {
    ok: false,
    status: statusFor('INTERNAL'),
    body: {
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side',
        degradationHint: 'RETRY_LATER' satisfies DegradationHint,
      },
    },
  };
}

// Status codes live in errors.ts and are read from there. A second copy here
// would be a number in two places, which is the failure the audit exists to
// catch — and the two would diverge the first time one of them changed.
