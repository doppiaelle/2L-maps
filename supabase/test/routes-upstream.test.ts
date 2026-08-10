import {
  createRoutesAdapter,
  FIELD_MASK_DETAIL,
  FIELD_MASK_ORDER,
} from '../functions/_shared/upstream/routes';
import type { RoutesRequest } from '../functions/_shared/upstream/routes';

/**
 * Two things are being verified, and it is worth being precise about which.
 *
 * **What we send.** The field mask decides the bill and the routing preference
 * decides whether the call is even legal, so those are asserted directly. These
 * assertions hold regardless of what Google does.
 *
 * **What we do with what comes back.** Parsed against recorded response shapes.
 * This environment cannot reach Google (docs/36_IMPLEMENTATION_PLAN.md), so
 * these prove we handle the shape we expect — not that Google still sends it.
 * That gap is real and closes at the first live call, not here.
 */

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const adapterReturning = (responses: readonly { status: number; body: unknown }[]) => {
  const sent: Sent[] = [];
  let call = 0;

  const fetchImpl = (async (
    url: string,
    init: { headers: Record<string, string>; body: string },
  ) => {
    sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return {
      ok: (response?.status ?? 200) >= 200 && (response?.status ?? 200) < 300,
      status: response?.status ?? 200,
      json: async () => response?.body ?? null,
    };
  }) as unknown as typeof fetch;

  return { adapter: createRoutesAdapter({ apiKey: 'key-123', fetchImpl }), sent };
};

const request = (intermediates: number): RoutesRequest => ({
  origin: { kind: 'place', placeId: 'origin' },
  destination: { kind: 'place', placeId: 'destination' },
  intermediates: Array.from({ length: intermediates }, (_, i) => ({
    kind: 'place' as const,
    placeId: `stop-${i}`,
  })),
  departureTime: null,
});

const orderResponse = (order: readonly number[]) => ({
  status: 200,
  body: { routes: [{ optimizedIntermediateWaypointIndex: order }] },
});

const detailResponse = () => ({
  status: 200,
  body: {
    routes: [
      {
        distanceMeters: 12_500,
        duration: '1830s',
        legs: [
          { distanceMeters: 6000, duration: '900s', polyline: { encodedPolyline: 'abc' } },
          { distanceMeters: 6500, duration: '930s', polyline: { encodedPolyline: 'def' } },
        ],
      },
    ],
  },
});

describe('the field mask is the bill', () => {
  it('buys exactly one field in phase one', async () => {
    // Anything else here pays Pro-tier prices for data phase two is about to
    // fetch properly.
    const { adapter, sent } = adapterReturning([orderResponse([1, 0])]);
    await adapter.optimizeOrder(request(2));

    expect(sent[0]?.headers['X-Goog-FieldMask']).toBe(FIELD_MASK_ORDER);
    expect(FIELD_MASK_ORDER).toBe('routes.optimizedIntermediateWaypointIndex');
  });

  it('buys geometry and timing in phase two, and nothing beyond it', async () => {
    const { adapter, sent } = adapterReturning([detailResponse()]);
    await adapter.detailFor(request(2));

    const mask = sent[0]?.headers['X-Goog-FieldMask'] ?? '';
    expect(mask).toBe(FIELD_MASK_DETAIL);
    // The absences matter as much as the presences: each of these is a field
    // Google would happily bill us for.
    expect(mask).not.toContain('routes.travelAdvisory');
    expect(mask).not.toContain('routes.legs.steps');
    expect(mask).not.toContain('*');
  });
});

describe('what makes the call legal', () => {
  it('never combines waypoint optimization with the optimal traffic preference', async () => {
    // Documented as incompatible (docs/33_API_CONTRACTS.md §8). Sending both is
    // a 400, and the failure would look like an outage rather than our bug.
    const { adapter, sent } = adapterReturning([orderResponse([0])]);
    await adapter.optimizeOrder(request(1));

    expect(sent[0]?.body['optimizeWaypointOrder']).toBe(true);
    expect(sent[0]?.body['routingPreference']).toBe('TRAFFIC_AWARE');
  });

  it('does not re-ask for an order in phase two', async () => {
    // The order is already decided. Asking again would cost more and could
    // return a different answer than the one the user is looking at.
    const { adapter, sent } = adapterReturning([detailResponse()]);
    await adapter.detailFor(request(2));

    expect(sent[0]?.body['optimizeWaypointOrder']).toBeUndefined();
    expect(sent[0]?.body['routingPreference']).toBe('TRAFFIC_AWARE_OPTIMAL');
  });

  it('sends the key as a header, never in the URL', async () => {
    // A URL reaches access logs and error messages, and this key bills us.
    const { adapter, sent } = adapterReturning([orderResponse([0])]);
    await adapter.optimizeOrder(request(1));

    expect(sent[0]?.headers['X-Goog-Api-Key']).toBe('key-123');
    expect(sent[0]?.url).not.toContain('key-123');
  });
});

describe('the returned order must be a permutation', () => {
  it('accepts a genuine reordering', async () => {
    const { adapter } = adapterReturning([orderResponse([2, 0, 1])]);
    const outcome = await adapter.optimizeOrder(request(3));

    expect(outcome).toEqual({ ok: true, order: [2, 0, 1] });
  });

  it('refuses an order that is missing a stop', async () => {
    // This check is the difference between a reordered route and a silently
    // dropped stop — a route that looks complete and is not.
    const { adapter } = adapterReturning([orderResponse([0, 1])]);
    const outcome = await adapter.optimizeOrder(request(3));

    expect(outcome.ok).toBe(false);
  });

  it('refuses an order that repeats a stop', async () => {
    const { adapter } = adapterReturning([orderResponse([0, 0, 1])]);
    expect((await adapter.optimizeOrder(request(3))).ok).toBe(false);
  });

  it('refuses an index outside the range', async () => {
    const { adapter } = adapterReturning([orderResponse([0, 1, 9])]);
    expect((await adapter.optimizeOrder(request(3))).ok).toBe(false);
  });

  it('accepts an empty order when there is nothing in between', async () => {
    // Origin to destination with no stops between them is a legitimate route,
    // and an empty array is the correct answer rather than a malformed one.
    const { adapter } = adapterReturning([{ status: 200, body: { routes: [{}] } }]);
    expect(await adapter.optimizeOrder(request(0))).toEqual({ ok: true, order: [] });
  });
});

describe('reading the detail response', () => {
  it('parses durations from the protobuf string form', async () => {
    // Google sends "1830s", not 1830. Reading it as a number yields NaN, and a
    // NaN ETA renders as a blank where the user expects a time.
    const { adapter } = adapterReturning([detailResponse()]);
    const outcome = await adapter.detailFor(request(2));

    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.detail.totalDurationSeconds).toBe(1830);
    expect(outcome.detail.legs[0]?.durationSeconds).toBe(900);
  });

  it('carries every leg through with its geometry', async () => {
    const { adapter } = adapterReturning([detailResponse()]);
    const outcome = await adapter.detailFor(request(2));

    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.detail.legs).toHaveLength(2);
    expect(outcome.detail.legs[1]).toEqual({
      distanceMeters: 6500,
      durationSeconds: 930,
      polyline: 'def',
    });
  });

  it('refuses a leg with a missing polyline rather than inventing one', async () => {
    const { adapter } = adapterReturning([
      {
        status: 200,
        body: {
          routes: [
            {
              distanceMeters: 100,
              duration: '60s',
              legs: [{ distanceMeters: 100, duration: '60s' }],
            },
          ],
        },
      },
    ]);
    expect((await adapter.detailFor(request(1))).ok).toBe(false);
  });
});

describe('failures a caller must tell apart', () => {
  it('reports an empty routes array as no route, not as an error', async () => {
    // Every waypoint resolved and nothing connects them — an island, a closed
    // border. A real answer about the world, not a fault.
    const { adapter } = adapterReturning([{ status: 200, body: { routes: [] } }]);
    const outcome = await adapter.optimizeOrder(request(2));

    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'no-route', retryable: false },
    });
  });

  it('marks a 5xx retryable and a 4xx not', async () => {
    // A 4xx is our request being wrong, and we built it. Retrying burns quota
    // and hides the bug.
    const server = adapterReturning([{ status: 503, body: {} }]);
    const serverOutcome = await server.adapter.optimizeOrder(request(2));
    expect(serverOutcome.ok === false && serverOutcome.failure.retryable).toBe(true);

    const client = adapterReturning([{ status: 400, body: {} }]);
    const clientOutcome = await client.adapter.optimizeOrder(request(2));
    expect(clientOutcome).toEqual({
      ok: false,
      failure: { kind: 'rejected', retryable: false, status: 400 },
    });
  });

  it('reports an unreachable network as retryable', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('network request failed');
    }) as unknown as typeof fetch;
    const adapter = createRoutesAdapter({ apiKey: 'k', fetchImpl });

    const outcome = await adapter.optimizeOrder(request(2));
    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'unreachable', retryable: true },
    });
  });

  it('reports a timeout as its own kind, so the caller can say "that took too long"', async () => {
    const fetchImpl = (async (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      })) as unknown as typeof fetch;

    const adapter = createRoutesAdapter({ apiKey: 'k', fetchImpl, timeoutMs: 10 });
    const outcome = await adapter.optimizeOrder(request(2));

    expect(outcome).toEqual({ ok: false, failure: { kind: 'timeout', retryable: true } });
  });
});
