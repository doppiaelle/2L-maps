import { hmacSha256 } from '../functions/_shared/crypto';
import { optimizeUpstream } from '../functions/_shared/endpoints/optimize';
import type { RoutesPort } from '../functions/_shared/endpoints/optimize';
import { timingSafeEqual, verifyAndApply } from '../functions/_shared/endpoints/revenuecat-webhook';
import { readUsageQuota } from '../functions/_shared/endpoints/usage-quota';
import type { HandlerContext } from '../functions/_shared/handler';

/**
 * The endpoint logic, tested where it lives.
 *
 * It lives in `_shared/endpoints/` rather than in the Deno entrypoints because
 * those are excluded from `tsc` — anything written there is unchecked by
 * construction, which is how a nonsense property name reached a commit during
 * this wave. The rule that came out of it: an entrypoint contains no decisions.
 */

const stop = (stopId: string, placeId: string) => ({ stopId, placeId });

const routesPort = (order: readonly number[]): RoutesPort & { sent: unknown[] } => {
  const sent: unknown[] = [];
  return {
    sent,
    optimizeOrder: async (request) => {
      sent.push(request);
      return { ok: true, order };
    },
    detailFor: async (request) => {
      sent.push(request);
      return {
        ok: true,
        detail: {
          totalDistanceMeters: 1000,
          totalDurationSeconds: 600,
          legs: [{ distanceMeters: 1000, durationSeconds: 600, polyline: 'abc' }],
        },
      };
    },
  };
};

const optimizeRequest = (overrides: { isRoundTrip?: boolean } = {}) => ({
  routeId: '00000000-0000-4000-8000-000000000000',
  origin: { placeId: 'origin-place', isCurrentLocation: false },
  stops: [stop('s1', 'p1'), stop('s2', 'p2'), stop('s3', 'p3')],
  isRoundTrip: overrides.isRoundTrip ?? false,
  departureTime: null,
});

describe('mapping Google’s order back onto our stops', () => {
  it('returns client stop ids, not place ids', async () => {
    // The reply names the user's stops. Ordering by place id would collapse two
    // deliveries in the same building into one — an ordinary Tuesday.
    const routes = routesPort([1, 0]);
    const outcome = await optimizeUpstream(optimizeRequest(), routes);

    expect(outcome.result.orderedStopIds).toEqual(['s2', 's1', 's3']);
  });

  it('keeps the last stop last on a one-way route', async () => {
    // The user chose where they finish; it is the destination and is not
    // reordered.
    const routes = routesPort([1, 0]);
    const outcome = await optimizeUpstream(optimizeRequest(), routes);

    expect(outcome.result.orderedStopIds[2]).toBe('s3');
  });

  it('reorders every stop on a round trip', async () => {
    // Returning to the origin means nothing is pinned to the end.
    const routes = routesPort([2, 0, 1]);
    const outcome = await optimizeUpstream(optimizeRequest({ isRoundTrip: true }), routes);

    expect(outcome.result.orderedStopIds).toEqual(['s3', 's1', 's2']);
  });

  it('asks for detail over the optimized order, not the typed order', async () => {
    // Pricing a different journey from the one we report would make the ETA
    // describe a route the user is not driving.
    const routes = routesPort([1, 0]);
    await optimizeUpstream(optimizeRequest(), routes);

    const detailCall = routes.sent[1] as { intermediates: { placeId: string }[] };
    expect(detailCall.intermediates.map((i) => i.placeId)).toEqual(['p2', 'p1']);
  });

  it('bills one unit regardless of stop count', async () => {
    // T1 bills per call, which is the whole reason the cascade stays here until
    // 25 stops (ADR-0003).
    const outcome = await optimizeUpstream(optimizeRequest(), routesPort([1, 0]));
    expect(outcome.units).toBe(1);
  });

  it('fails loudly rather than returning a shorter route', async () => {
    // If the permutation check and this mapping ever disagree, a silently
    // shorter route is the worst possible outcome.
    const broken: RoutesPort = {
      optimizeOrder: async () => ({ ok: true, order: [9, 9] }),
      detailFor: async () => {
        throw new Error('should not be reached');
      },
    };
    await expect(optimizeUpstream(optimizeRequest(), broken)).rejects.toThrow();
  });

  it('offers the local fallback when routing is unreachable, but not when there is no route', async () => {
    // No ordering algorithm connects places that are not connected, so
    // suggesting T0 there would waste the user's time on a second failure.
    const unreachable: RoutesPort = {
      optimizeOrder: async () => ({ ok: false, failure: { kind: 'unreachable', retryable: true } }),
      detailFor: async () => ({ ok: false, failure: { kind: 'unreachable', retryable: true } }),
    };
    await expect(optimizeUpstream(optimizeRequest(), unreachable)).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      options: { degradationHint: 'T0_AVAILABLE' },
    });

    const noRoute: RoutesPort = {
      optimizeOrder: async () => ({ ok: false, failure: { kind: 'no-route', retryable: false } }),
      detailFor: async () => ({ ok: false, failure: { kind: 'no-route', retryable: false } }),
    };
    await expect(optimizeUpstream(optimizeRequest(), noRoute)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });
});

// ─── Usage quota ─────────────────────────────────────────────────────────────

const quotaContext = (entitlement: Record<string, unknown> | null): HandlerContext => ({
  database: {
    queryOne: (async () => entitlement) as HandlerContext['database']['queryOne'],
    // Usage arrives grouped by endpoint and summed by `units`, not counted by
    // row: `/place-details` charges what it actually fetched, so counting rows
    // would report a twenty-five stop resolution as a single use.
    queryMany: (async () => [
      { endpoint: '/optimize', used: 4 },
      { endpoint: '/places-autocomplete', used: 2 },
    ]) as HandlerContext['database']['queryMany'],
    execute: async () => undefined,
  },
  tokens: { verify: async () => 'user-1' },
  limits: { burst: {} },
});

describe('the plan a user is actually on', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('treats a user with no entitlement row as free, not as an error', async () => {
    // The common case now that a free tier exists (ADR-0015).
    const response = await readUsageQuota('user-1', quotaContext(null), now);
    expect(response.plan).toBe('free');
    expect(response.status).toBe('none');
    expect(response.limits.find((l) => l.name === 'optimizations')?.limit).toBe(15);
  });

  it('reports a lapsed subscriber as free rather than locked out', async () => {
    const response = await readUsageQuota(
      'user-1',
      quotaContext({
        status: 'lapsed',
        plan: 'pro',
        trial_ends_at: null,
        renews_at: null,
        day_pass_expires_at: null,
      }),
      now,
    );
    expect(response.plan).toBe('free');
    expect(response.status).toBe('lapsed');
  });

  it('ignores a day pass that has expired', async () => {
    // The row keeps saying day-pass afterwards. Trusting it would hand out Pro
    // allowances indefinitely for €1.99.
    const response = await readUsageQuota(
      'user-1',
      quotaContext({
        status: 'none',
        plan: 'day-pass',
        trial_ends_at: null,
        renews_at: null,
        day_pass_expires_at: '2026-08-14T00:00:00Z',
      }),
      now,
    );
    expect(response.plan).toBe('free');
  });

  it('honours a day pass that is still running', async () => {
    const response = await readUsageQuota(
      'user-1',
      quotaContext({
        status: 'none',
        plan: 'day-pass',
        trial_ends_at: null,
        renews_at: null,
        day_pass_expires_at: '2026-08-16T00:00:00Z',
      }),
      now,
    );
    expect(response.plan).toBe('day-pass');
    expect(response.limits.find((l) => l.name === 'optimizations')?.limit).toBe(25);
  });

  it('keeps a user in a billing retry working', async () => {
    // `grace` exists so nobody is locked out of a route they are halfway
    // through driving because a card expired.
    const response = await readUsageQuota(
      'user-1',
      quotaContext({
        status: 'grace',
        plan: 'pro',
        trial_ends_at: null,
        renews_at: null,
        day_pass_expires_at: null,
      }),
      now,
    );
    expect(response.plan).toBe('pro');
    expect(response.status).toBe('active');
  });

  it('reports usage alongside the limit, so a bar can be drawn', async () => {
    const response = await readUsageQuota('user-1', quotaContext(null), now);
    expect(response.limits.find((l) => l.name === 'optimizations')?.used).toBe(4);
  });
});

// ─── Webhook ─────────────────────────────────────────────────────────────────

const SECRET = 'whsec-test';

const webhookContext = () => {
  const writes: unknown[][] = [];
  const context: HandlerContext = {
    database: {
      queryOne: (async () => null) as HandlerContext['database']['queryOne'],
      queryMany: (async () => []) as HandlerContext['database']['queryMany'],
      execute: async (_sql: string, params: readonly unknown[]) => {
        writes.push([...params]);
      },
    },
    tokens: { verify: async () => 'user-1' },
    limits: { burst: {} },
  };
  return { context, writes };
};

const webhookRequest = async (body: unknown, signature?: string) => {
  const raw = JSON.stringify(body);
  return new Request('https://edge.test/revenuecat-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === undefined
        ? { 'x-revenuecat-signature': await hmacSha256(raw, SECRET) }
        : { 'x-revenuecat-signature': signature }),
    },
    body: raw,
  });
};

const deps = { signingSecret: SECRET, computeSignature: hmacSha256 };

const event = (type: string) => ({
  event: { id: 'evt-1', type, app_user_id: 'user-1', product_id: 'monthly' },
});

describe('the webhook is the only door to entitlement', () => {
  it('writes nothing when the signature does not match', async () => {
    // An unverified webhook is an open door to free entitlement.
    const { context, writes } = webhookContext();
    const request = await webhookRequest(event('INITIAL_PURCHASE'), 'deadbeef'.repeat(8));

    const response = await verifyAndApply(request, context, deps);
    expect(response.status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('writes nothing when the signature header is absent', async () => {
    const { context, writes } = webhookContext();
    const request = new Request('https://edge.test/revenuecat-webhook', {
      method: 'POST',
      body: JSON.stringify(event('RENEWAL')),
    });

    expect((await verifyAndApply(request, context, deps)).status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('applies a verified purchase', async () => {
    const { context, writes } = webhookContext();
    const request = await webhookRequest(event('INITIAL_PURCHASE'));

    const response = await verifyAndApply(request, context, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, applied: true });
    expect(writes[0]?.[1]).toBe('active');
  });

  it('maps a billing issue to grace rather than to lapsed', async () => {
    // Locking someone out on the first failed charge would end a route they are
    // driving.
    const { context, writes } = webhookContext();
    await verifyAndApply(await webhookRequest(event('BILLING_ISSUE')), context, deps);
    expect(writes[0]?.[1]).toBe('grace');
  });

  it('acknowledges an event type it does not act on instead of retrying forever', async () => {
    const { context, writes } = webhookContext();
    const response = await verifyAndApply(await webhookRequest(event('TEST')), context, deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, applied: false });
    expect(writes).toHaveLength(0);
  });

  it('acknowledges a verified event whose shape changed', async () => {
    // RevenueCat changing shape is not something a retry can fix.
    const { context } = webhookContext();
    const response = await verifyAndApply(await webhookRequest({ nope: true }), context, deps);
    expect(response.status).toBe(200);
  });
});

describe('signature comparison', () => {
  it('is length-independent in its result and byte-independent in its timing', () => {
    // A `===` returns on the first differing byte, and that timing difference
    // recovers a valid signature one byte at a time.
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('produces the hex form RevenueCat sends', async () => {
    const signature = await hmacSha256('body', SECRET);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
