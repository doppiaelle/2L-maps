import { ApiError, shouldAlert, statusFor, type ErrorCode } from '../functions/_shared/errors';
import {
  PIPELINE_STEPS,
  runPipeline,
  type PipelineDependencies,
  type PipelineStep,
  type UsageRecord,
} from '../functions/_shared/pipeline';

/**
 * Contract tests for the seven-step pipeline (docs/33_API_CONTRACTS.md,
 * docs/13_BACKEND.md §4).
 *
 * The order is the thing under test. It is easy to reorder these steps while
 * every individual check still passes its own test — and the two placements that
 * matter would then be silently wrong: a lapsed user would be told they are going
 * too fast, and a user with a recurring route would consume unlimited cached
 * value while the quota reported them idle.
 */

interface Req {
  readonly token: string | null;
}
interface Res {
  readonly value: string;
}

const UPSTREAM: Res = { value: 'from-upstream' };
const CACHED: Res = { value: 'from-cache' };

interface Overrides {
  authenticated?: boolean;
  entitled?: boolean;
  rateLimited?: boolean;
  quotaExhausted?: boolean;
  cached?: Res | null;
  upstreamThrows?: unknown;
  withCache?: boolean;
}

function makeDeps(overrides: Overrides = {}): {
  deps: PipelineDependencies<Req, Res>;
  usage: UsageRecord[];
  cacheWrites: Res[];
  upstreamCalls: number;
} {
  const usage: UsageRecord[] = [];
  const cacheWrites: Res[] = [];
  let upstreamCalls = 0;
  const withCache = overrides.withCache ?? true;

  const deps: PipelineDependencies<Req, Res> = {
    endpoint: '/optimize',
    authenticate: async () => ((overrides.authenticated ?? true) ? { userId: 'user-1' } : null),
    readEntitlement: async () => ({
      hasEntitlement: overrides.entitled ?? true,
      status: (overrides.entitled ?? true) ? 'active' : 'expired',
      // The real dependencies never return `hasEntitlement: false` any more —
      // every plan grants access to its own allowances (ADR-0015). The step is
      // still tested here because it is where a suspended account would be
      // refused, and an untested refusal path is an unwritten one.
      plan: (overrides.entitled ?? true) ? 'pro' : 'free',
    }),
    checkRateLimit: async () => ({
      isLimited: overrides.rateLimited ?? false,
      retryAfterSeconds: 30,
    }),
    checkQuota: async () => ({
      isExhausted: overrides.quotaExhausted ?? false,
      limit: 100,
      used: overrides.quotaExhausted === true ? 100 : 3,
      resetsAt: '2026-09-01T00:00:00Z',
    }),
    ...(withCache
      ? {
          readCache: async () => overrides.cached ?? null,
          writeCache: async (_request: Req, result: Res) => {
            cacheWrites.push(result);
          },
        }
      : {}),
    callUpstream: async () => {
      upstreamCalls += 1;
      if (overrides.upstreamThrows !== undefined) throw overrides.upstreamThrows;
      return { result: UPSTREAM, tier: 'T1', units: 1 };
    },
    recordUsage: async (record: UsageRecord) => {
      usage.push(record);
    },
  };

  return {
    deps,
    usage,
    cacheWrites,
    get upstreamCalls() {
      return upstreamCalls;
    },
  };
}

const run = async (overrides: Overrides = {}) => {
  const harness = makeDeps(overrides);
  const trace: PipelineStep[] = [];
  const outcome = await runPipeline<Req, Res>({ token: 'jwt' }, harness.deps, trace);
  return { ...harness, outcome, trace };
};

describe('the happy path runs every step in the specified order', () => {
  it('follows the documented sequence exactly', async () => {
    const { trace, outcome } = await run();
    expect(trace).toEqual([...PIPELINE_STEPS]);
    expect(outcome.ok).toBe(true);
  });

  it('returns the upstream result and records the call', async () => {
    const { outcome, usage } = await run();
    expect(outcome.ok && outcome.body).toEqual(UPSTREAM);
    expect(usage).toEqual([
      { userId: 'user-1', endpoint: '/optimize', tier: 'T1', cacheHit: false, units: 1 },
    ]);
  });

  it('writes the result to the cache', async () => {
    const { cacheWrites } = await run();
    expect(cacheWrites).toEqual([UPSTREAM]);
  });
});

describe('each gate short-circuits everything after it', () => {
  it('401 before entitlement is even read', async () => {
    const { outcome, trace, usage } = await run({ authenticated: false });
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.status).toBe(401);
    expect(!outcome.ok && outcome.body.error.code).toBe('UNAUTHENTICATED');
    expect(trace).toEqual(['authenticate']);
    // Nothing is recorded against a user we could not identify.
    expect(usage).toEqual([]);
  });

  it('402 before rate limiting — the placement that matters most', async () => {
    // Reversed, a lapsed user is told they are going too fast. The message would
    // send them to wait, and waiting cannot fix an expired subscription.
    const { outcome, trace } = await run({ entitled: false });
    expect(!outcome.ok && outcome.status).toBe(402);
    expect(!outcome.ok && outcome.body.error.code).toBe('NO_ENTITLEMENT');
    expect(trace).toEqual(['authenticate', 'entitlement']);
  });

  it('429 RATE_LIMITED before the quota is consulted', async () => {
    const { outcome, trace } = await run({ rateLimited: true });
    expect(!outcome.ok && outcome.status).toBe(429);
    expect(!outcome.ok && outcome.body.error.code).toBe('RATE_LIMITED');
    expect(trace).toEqual(['authenticate', 'entitlement', 'rate-limit']);
  });

  it('429 QUOTA_EXHAUSTED before the cache is even read', async () => {
    const { outcome, trace, upstreamCalls } = await run({ quotaExhausted: true });
    expect(!outcome.ok && outcome.status).toBe(429);
    expect(!outcome.ok && outcome.body.error.code).toBe('QUOTA_EXHAUSTED');
    expect(trace).toEqual(['authenticate', 'entitlement', 'rate-limit', 'quota']);
    expect(upstreamCalls).toBe(0);
  });

  it('distinguishes the two 429s by code, since the status cannot', async () => {
    // Velocity and allowance are different problems with different user actions:
    // one says wait thirty seconds, the other says wait until September.
    const limited = await run({ rateLimited: true });
    const exhausted = await run({ quotaExhausted: true });
    expect(!limited.outcome.ok && limited.outcome.body.error.code).toBe('RATE_LIMITED');
    expect(!exhausted.outcome.ok && exhausted.outcome.body.error.code).toBe('QUOTA_EXHAUSTED');
  });
});

describe('the cache sits after the quota, deliberately', () => {
  it('a hit skips upstream but still records usage', async () => {
    // The whole point: a hit costs nothing upstream and must still consume
    // allowance, or a user with a recurring route gets unlimited free value.
    const { outcome, usage, upstreamCalls, trace } = await run({ cached: CACHED });

    expect(outcome.ok && outcome.body).toEqual(CACHED);
    expect(outcome.ok && outcome.cacheHit).toBe(true);
    expect(upstreamCalls).toBe(0);
    expect(usage).toEqual([
      { userId: 'user-1', endpoint: '/optimize', tier: null, cacheHit: true, units: 1 },
    ]);
    expect(trace).toEqual([
      'authenticate',
      'entitlement',
      'rate-limit',
      'quota',
      'cache',
      'record',
    ]);
  });

  it('an exhausted quota beats a warm cache', async () => {
    const { outcome, usage } = await run({ quotaExhausted: true, cached: CACHED });
    expect(!outcome.ok && outcome.body.error.code).toBe('QUOTA_EXHAUSTED');
    expect(usage).toEqual([]);
  });

  it('works for an endpoint with no cache at all', async () => {
    // /places-autocomplete has none: caching would breach Places session
    // semantics and return stale suggestions.
    const { outcome, trace } = await run({ withCache: false });
    expect(outcome.ok).toBe(true);
    expect(trace).toEqual([...PIPELINE_STEPS]);
  });
});

describe('failures carry a usable envelope', () => {
  it('quota exhaustion states the limit, the usage and the reset date', async () => {
    // "Show the limit, the reset time, and what still works" — an error with no
    // next action is a dead end (CLAUDE.md §0 rule 5).
    const { outcome } = await run({ quotaExhausted: true });
    expect(!outcome.ok && outcome.body.error.details).toEqual({
      limit: 100,
      used: 100,
      resetsAt: '2026-09-01T00:00:00Z',
    });
    expect(!outcome.ok && outcome.body.error.degradationHint).toBe('T0_AVAILABLE');
  });

  it('rate limiting says how long to wait', async () => {
    const { outcome } = await run({ rateLimited: true });
    expect(!outcome.ok && outcome.body.error.details).toEqual({ retryAfterSeconds: 30 });
    expect(!outcome.ok && outcome.body.error.degradationHint).toBe('RETRY_LATER');
  });

  it('an upstream ApiError keeps its own code and hint', async () => {
    const { outcome } = await run({
      upstreamThrows: new ApiError('UPSTREAM_TIMEOUT', 'Google took too long', {
        degradationHint: 'T0_AVAILABLE',
      }),
    });
    expect(!outcome.ok && outcome.status).toBe(504);
    expect(!outcome.ok && outcome.body.error.degradationHint).toBe('T0_AVAILABLE');
  });

  it('an unexpected throw never leaks its message to the client', async () => {
    // Error objects are the most common way a query, a stack trace or a
    // credential reaches somewhere it should not (CLAUDE.md §9 rule 8).
    const { outcome } = await run({
      upstreamThrows: new Error('connection to postgres://user:hunter2@db failed'),
    });
    expect(!outcome.ok && outcome.status).toBe(500);
    expect(!outcome.ok && outcome.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(outcome)).not.toContain('hunter2');
    expect(JSON.stringify(outcome)).not.toContain('postgres://');
  });

  it('a failed upstream call records no usage', async () => {
    // Recording a call that produced nothing would overstate cost and consume
    // the user's allowance for a result they never received.
    const { usage } = await run({ upstreamThrows: new Error('boom') });
    expect(usage).toEqual([]);
  });
});

describe('the error taxonomy matches the contract', () => {
  const expected: [ErrorCode, number][] = [
    ['UNAUTHENTICATED', 401],
    ['NO_ENTITLEMENT', 402],
    ['RATE_LIMITED', 429],
    ['QUOTA_EXHAUSTED', 429],
    ['INVALID_REQUEST', 400],
    ['MISSING_SESSION_TOKEN', 400],
    ['UPSTREAM_UNAVAILABLE', 503],
    ['UPSTREAM_TIMEOUT', 504],
    ['PARTIAL_RESULT', 200],
    ['INTERNAL', 500],
  ];

  it.each(expected)('%s maps to HTTP %i', (code, status) => {
    expect(statusFor(code)).toBe(status);
  });

  it('alerts only on our own defects, never on a user-caused outcome', async () => {
    // Paging on an exhausted quota trains everyone to ignore the pager.
    expect(shouldAlert('INVALID_REQUEST')).toBe(true);
    expect(shouldAlert('MISSING_SESSION_TOKEN')).toBe(true);
    expect(shouldAlert('INTERNAL')).toBe(true);

    expect(shouldAlert('QUOTA_EXHAUSTED')).toBe(false);
    expect(shouldAlert('NO_ENTITLEMENT')).toBe(false);
    expect(shouldAlert('RATE_LIMITED')).toBe(false);
    expect(shouldAlert('UNAUTHENTICATED')).toBe(false);
  });
});
