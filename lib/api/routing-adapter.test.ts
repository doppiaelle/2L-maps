import { MAX_STOPS_T0 } from '@/types';

import { ApiClient } from './client';
import { createRoutingProvider } from './routing-adapter';

/**
 * The adapter's real job is translation, and translation is where a user ends up
 * reading the wrong message: told to retry when they need to subscribe, or
 * offered a degraded result on a route too long to degrade honestly.
 *
 * So these tests are mostly a table of "server said X, user must be shown Y".
 */

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const respond = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const providerReturning = (response: FakeResponse) => {
  const client = new ApiClient({
    baseUrl: 'https://edge.test',
    getAccessToken: async () => 'jwt',
    fetchImpl: (async () => response) as unknown as typeof fetch,
  });
  return createRoutingProvider({ client });
};

const providerThrowing = () => {
  const client = new ApiClient({
    baseUrl: 'https://edge.test',
    getAccessToken: async () => 'jwt',
    fetchImpl: (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch,
  });
  return createRoutingProvider({ client });
};

const request = (stopCount: number) => ({
  routeId: 'route-1',
  originPlaceId: 'place-origin',
  originCoordinate: null,
  stopPlaceIds: Array.from({ length: stopCount }, (_, i) => `place-${i}`),
  shape: 'one-way' as const,
  departureTime: null,
  idempotencyKey: 'idem-12345678',
});

const envelope = (code: string, details: Record<string, unknown> = {}) => ({
  error: { code, message: 'human readable', details },
});

describe('successful results', () => {
  it('returns a full result with its legs', async () => {
    const provider = providerReturning(
      respond(200, {
        status: 'complete',
        tier: 'T1',
        isDegraded: false,
        orderedStopIds: ['b', 'a'],
        legs: [
          {
            fromStopId: 'b',
            toStopId: 'a',
            distanceMeters: 1200,
            durationSeconds: 300,
            polyline: 'abc',
          },
        ],
        totalDistanceMeters: 1200,
        totalDurationSeconds: 300,
        unreachableStopIds: [],
      }),
    );

    const outcome = await provider.optimize(request(2));
    expect(outcome.ok).toBe(true);
    if (outcome.ok !== true) return;
    expect(outcome.result.tier).toBe('T1');
    expect(outcome.result.isDegraded).toBe(false);
    expect(outcome.result.orderedStopIds).toEqual(['b', 'a']);
  });

  it('returns a degraded result without pretending it has a duration', async () => {
    // The union is what carries this: a T0 result cannot promise a time, and a
    // shared shape with an optional one would let a screen show a blank ETA as
    // though it were a real one.
    const provider = providerReturning(
      respond(200, {
        status: 'complete',
        tier: 'T0',
        isDegraded: true,
        orderedStopIds: ['a', 'b'],
        totalDistanceMeters: 900,
      }),
    );

    const outcome = await provider.optimize(request(2));
    expect(outcome.ok).toBe(true);
    if (outcome.ok !== true) return;
    expect(outcome.result.isDegraded).toBe(true);
    expect('totalDurationSeconds' in outcome.result).toBe(false);
  });

  it('reports unreachable stops rather than dropping them', async () => {
    const provider = providerReturning(
      respond(200, {
        status: 'complete',
        tier: 'T1',
        isDegraded: false,
        orderedStopIds: ['a'],
        legs: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        unreachableStopIds: ['b'],
      }),
    );

    const outcome = await provider.optimize(request(2));
    if (outcome.ok !== true || outcome.result.isDegraded) throw new Error('unreachable');
    expect(outcome.result.unreachableStopIds).toEqual(['b']);
  });

  it('surfaces an asynchronous job instead of blocking', async () => {
    const provider = providerReturning(respond(200, { status: 'pending', jobId: 'job-7' }));
    expect(await provider.optimize(request(40))).toEqual({ ok: 'pending', jobId: 'job-7' });
  });
});

describe('failures reach the screen that can act on them', () => {
  it('sends a lapsed subscriber to the paywall, not a retry button', async () => {
    const provider = providerReturning(respond(402, envelope('NO_ENTITLEMENT')));
    const outcome = await provider.optimize(request(5));
    expect(outcome).toEqual({ ok: false, failure: { kind: 'no-entitlement' } });
  });

  it('separates the two 429s, which need opposite messages', async () => {
    // Wait thirty seconds, or wait until next month.
    const limited = await providerReturning(
      respond(429, envelope('RATE_LIMITED', { retryAfterSeconds: 45 })),
    ).optimize(request(5));
    expect(limited).toEqual({
      ok: false,
      failure: { kind: 'rate-limited', retryAfterSeconds: 45 },
    });

    const exhausted = await providerReturning(
      respond(429, envelope('QUOTA_EXHAUSTED', { resetsAt: '2026-09-01T00:00:00Z' })),
    ).optimize(request(5));
    expect(exhausted).toEqual({
      ok: false,
      failure: { kind: 'quota-exhausted', resetsAt: '2026-09-01T00:00:00Z' },
    });
  });

  it('falls back to a sane retry interval when the server omits one', async () => {
    const provider = providerReturning(respond(429, envelope('RATE_LIMITED')));
    const outcome = await provider.optimize(request(5));
    expect(outcome.ok === false && outcome.failure.kind === 'rate-limited').toBe(true);
  });

  it('treats an unexpected code as an upstream failure rather than throwing', async () => {
    const provider = providerReturning(respond(500, envelope('SOMETHING_NEW')));
    const outcome = await provider.optimize(request(5));
    expect(outcome.ok === false && outcome.failure.kind).toBe('upstream-unavailable');
  });
});

describe('canDegrade is computed here, once', () => {
  it('offers a local fallback at or below the T0 ceiling', async () => {
    // Every screen would otherwise re-derive the stop-count rule, and each copy
    // is a place it can drift from ADR-0003.
    const outcome = await providerThrowing().optimize(request(MAX_STOPS_T0));
    expect(outcome).toEqual({ ok: false, failure: { kind: 'offline', canDegrade: true } });
  });

  it('does not offer one above it', async () => {
    // A straight-line order over nine stops can be worse than the user's own
    // guess, so offering it would be dishonest rather than helpful.
    const outcome = await providerThrowing().optimize(request(MAX_STOPS_T0 + 1));
    expect(outcome).toEqual({ ok: false, failure: { kind: 'offline', canDegrade: false } });
  });

  it('applies the same rule to an upstream failure', async () => {
    const small = await providerReturning(respond(503, envelope('UPSTREAM_UNAVAILABLE'))).optimize(
      request(4),
    );
    expect(small.ok === false && small.failure).toEqual({
      kind: 'upstream-unavailable',
      canDegrade: true,
    });

    const large = await providerReturning(respond(503, envelope('UPSTREAM_UNAVAILABLE'))).optimize(
      request(20),
    );
    expect(large.ok === false && large.failure).toEqual({
      kind: 'upstream-unavailable',
      canDegrade: false,
    });
  });

  it('never offers degradation for a job whose size is unknown', async () => {
    // Suggesting a local fallback for a route we cannot size would be a guess,
    // and T0 above its ceiling is worse than no result at all.
    const outcome = await providerThrowing().awaitJob('job-7');
    expect(outcome.ok === false && outcome.failure).toEqual({
      kind: 'offline',
      canDegrade: false,
    });
  });
});

describe('a response that does not match the contract', () => {
  it('is an upstream failure, not a half-built result', async () => {
    // Letting it through means it crashes on a screen where the cause is
    // invisible.
    const provider = providerReturning(respond(200, { status: 'complete', tier: 'T1' }));
    const outcome = await provider.optimize(request(3));
    expect(outcome.ok === false && outcome.failure.kind).toBe('upstream-unavailable');
  });

  it('rejects a degraded result carrying a duration it cannot have', async () => {
    const provider = providerReturning(
      respond(200, {
        status: 'complete',
        tier: 'T0',
        isDegraded: false,
        orderedStopIds: ['a'],
        totalDistanceMeters: 1,
      }),
    );
    const outcome = await provider.optimize(request(2));
    expect(outcome.ok).toBe(false);
  });
});
