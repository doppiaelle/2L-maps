import { ApiClient } from '@/lib/api/client';
import { createGeocodingProvider } from '@/lib/api/geocoding-adapter';
import { createRoutingProvider } from '@/lib/api/routing-adapter';
import type { RoutingOutcome } from '@/lib/providers/types';

import { optimizeUpstream } from '../functions/_shared/endpoints/optimize';
import type { RoutesPort } from '../functions/_shared/endpoints/optimize';

import {
  autocompleteRequestSchema,
  geocodeRequestSchema,
  optimizeRequestSchema,
  parseAddressesRequestSchema,
  parseRequest,
  placeDetailsRequestSchema,
} from '../functions/_shared/schemas';

import type { z } from 'zod';

/**
 * What the client sends, checked against what the server accepts.
 *
 * **This is the test whose absence broke the product.** Both halves of every
 * endpoint were covered: `contracts.test.ts` runs the schemas against
 * hand-written fixtures, and the adapter suites run the client against a mocked
 * server that accepts whatever it is given. Each passed. Neither could see that
 * they disagreed.
 *
 * They disagreed on `null`. The client sends `locale: null` and `bias: null`
 * when it has neither — which is every search — and `z.string().optional()`
 * accepts an absent key while rejecting an explicit `null`. So
 * `/places-autocomplete` answered **400 INVALID_REQUEST to every request the app
 * has ever made**, before Google was contacted, at no cost and with no upstream
 * error to find. From the phone it looked like "no results". The same schema
 * also asked for `latitude`/`longitude` where the contract and the client both
 * say `lat`/`lng`.
 *
 * The fixtures could not have caught it: a fixture is what the author believed
 * the client sends. Only the client knows that.
 *
 * ## How this stays honest
 *
 * The body is taken from a real `ApiClient` at the `fetch` seam, **after
 * `JSON.stringify`**. That is not incidental — it is the whole point. The bug
 * lives in the difference between a key that is absent and a key that is `null`,
 * and `JSON.stringify` is what erases `undefined` and keeps `null`. A test that
 * inspected the object before serialisation would see a third state the server
 * never does, and would have passed too.
 */

/** The request body a provider produced, as the server will receive it. */
async function bodySentBy(act: (client: ApiClient) => Promise<unknown>): Promise<unknown> {
  let captured: string | null = null;

  const client = new ApiClient({
    baseUrl: 'https://example.test/functions/v1',
    getAccessToken: () => Promise.resolve('test-token'),
    fetchImpl: ((_url: string, init: RequestInit) => {
      captured = typeof init.body === 'string' ? init.body : null;
      // The shape does not matter: the adapter's response parsing is covered by
      // its own suite, and a rejection here would not change what was sent.
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }) as unknown as typeof fetch,
  });

  await act(client);

  if (captured === null) {
    // The adapter short-circuited and never called the network — a real
    // behaviour for an empty batch, and never what these cases exercise.
    throw new Error('no request was sent');
  }
  return JSON.parse(captured) as unknown;
}

/** Assert the server accepts it, and say what it objected to when it does not. */
function expectAccepted<T>(schema: z.ZodType<T>, body: unknown): void {
  const outcome = parseRequest(schema, body);
  if (!outcome.ok) {
    throw new Error(
      `the server would reject this with ${outcome.code}: ${JSON.stringify(body, null, 2)}`,
    );
  }
  expect(outcome.ok).toBe(true);
}

describe('/places-autocomplete', () => {
  it('accepts what the client sends with no bias and no locale', async () => {
    // The ordinary case, and the one that was refused every single time.
    const body = await bodySentBy((client) =>
      createGeocodingProvider({ client }).suggest('via roma 12', 'session-token', {}),
    );

    expect(body).toMatchObject({ bias: null, locale: null });
    expectAccepted(autocompleteRequestSchema, body);
  });

  it('accepts a bias in the shape the client actually builds', async () => {
    // `lat`/`lng`, per docs/33. The schema asked for `latitude`/`longitude`, so
    // supplying a bias failed as surely as omitting one.
    const body = await bodySentBy((client) =>
      createGeocodingProvider({ client }).suggest('via roma 12', 'session-token', {
        bias: { latitude: 45.69, longitude: 9.67 },
      }),
    );

    expectAccepted(autocompleteRequestSchema, body);
  });
});

describe('/geocode', () => {
  it('accepts what the client sends', async () => {
    const body = await bodySentBy((client) =>
      createGeocodingProvider({ client }).geocodeAddresses(['Via Roma 1, Bergamo']),
    );

    expectAccepted(geocodeRequestSchema, body);
  });
});

describe('/place-details', () => {
  it('accepts what the client sends', async () => {
    const body = await bodySentBy((client) =>
      createGeocodingProvider({ client }).resolveBatch(['ChIJtest']),
    );

    expectAccepted(placeDetailsRequestSchema, body);
  });
});

describe('/parse-addresses', () => {
  it('accepts a text paste, including its null locale', async () => {
    const body = await bodySentBy((client) =>
      createGeocodingProvider({ client }).parse({
        kind: 'text',
        text: 'via roma 1 e via milano 2',
      }),
    );

    expect(body).toMatchObject({ locale: null });
    expectAccepted(parseAddressesRequestSchema, body);
  });
});

describe('/optimize', () => {
  it('accepts what the client sends for an ordinary route', async () => {
    const body = await bodySentBy((client) =>
      createRoutingProvider({ client }).optimize({
        routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
        originPlaceId: 'ChIJorigin',
        originCoordinate: null,
        stops: [
          { id: 'stop-a', placeId: 'ChIJa' },
          { id: 'stop-b', placeId: 'ChIJb' },
        ],
        shape: 'one-way',
        departureTime: null,
        // Required by `RoutingRequest`, and the schema puts a floor of 8
        // characters under it — a shorter key would be refused exactly as the
        // nulls were, so the length belongs in the assertion rather than in a
        // reviewer's memory.
        idempotencyKey: 'idem-0001-abcd',
      }),
    );

    expectAccepted(optimizeRequestSchema, body);
  });
});

/**
 * And now the other direction — what the server answers, checked against what
 * the client accepts.
 *
 * **This half was missing, and its absence hid a total failure.** Everything
 * above tests the request. The response was covered the same way the request had
 * been before this file existed: `endpoints.test.ts` asserts what the server
 * builds, and `routing-adapter.test.ts` asserts what the client parses — from a
 * fixture the author wrote by hand. Both passed for weeks while **`/optimize`
 * failed one hundred per cent of the time**, because the fixture had two fields
 * on every leg that the server has never once sent.
 *
 * A response the client rejects is worse than an error. It arrives as 200, so
 * the pipeline has already recorded the usage and charged the user's monthly
 * allowance; then Zod refuses it, `ApiClient` reports `MALFORMED_RESPONSE`, and
 * the screen says "Could not optimize. Your stops are unchanged." There is no
 * upstream error anywhere to find, because upstream succeeded.
 *
 * So the body here is **not written by hand**. It is produced by the real
 * `optimizeUpstream`, serialised the way `pipelineResponse` serialises it, and
 * handed to the real `createRoutingProvider` through the real `ApiClient`. Every
 * hand-written fixture in this repository is a statement of what its author
 * believed; only the two implementations know what they actually do.
 */
describe('/optimize — what comes back', () => {
  const stop = (stopId: string, placeId: string) => ({ stopId, placeId });

  const routesPort = (order: readonly number[]): RoutesPort => ({
    optimizeOrder: () => Promise.resolve({ ok: true, order }),
    detailFor: (request) =>
      Promise.resolve({
        ok: true,
        detail: {
          totalDistanceMeters: 484_100,
          totalDurationSeconds: 18_720,
          // One leg per hop, which is what Google returns: the number of
          // waypoints minus one.
          legs: Array.from({ length: request.intermediates.length + 1 }, (_, index) => ({
            distanceMeters: 1_000 * (index + 1),
            durationSeconds: 600 * (index + 1),
            polyline: 'ab_cde',
          })),
        },
      }),
  });

  /** The client's own parse of a body the server really produced. */
  async function clientReadingServer(
    request: Parameters<typeof optimizeUpstream>[0],
    order: readonly number[],
  ): Promise<RoutingOutcome> {
    const upstream = await optimizeUpstream(request, routesPort(order));
    // Exactly what `pipelineResponse` puts on the wire: the result, serialised,
    // and nothing else. Passing the object directly would skip `JSON.stringify`,
    // which is the step that erases `undefined` — the same distinction the
    // request half of this file exists for.
    const body = JSON.stringify(upstream.result);

    const client = new ApiClient({
      baseUrl: 'https://example.test/functions/v1',
      getAccessToken: () => Promise.resolve('test-token'),
      fetchImpl: (() =>
        Promise.resolve(
          new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
        )) as unknown as typeof fetch,
    });

    return createRoutingProvider({ client }).optimize({
      routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
      originPlaceId: 'ChIJorigin',
      originCoordinate: null,
      stops: request.stops.map((s) => ({ id: s.stopId, placeId: s.placeId })),
      shape: request.isRoundTrip ? 'round-trip' : 'one-way',
      departureTime: null,
      idempotencyKey: 'idem-0001-abcd',
    });
  }

  it('is a result the client accepts, not a malformed response', async () => {
    // The regression, in one line. Every field the client requires must be one
    // the server sends.
    const outcome = await clientReadingServer(
      {
        routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
        origin: { placeId: 'ChIJorigin', isCurrentLocation: false },
        stops: [stop('s1', 'ChIJa'), stop('s2', 'ChIJb'), stop('s3', 'ChIJc')],
        isRoundTrip: false,
        departureTime: null,
      },
      [1, 0],
    );

    expect(outcome).toMatchObject({ ok: true });
  });

  it('names the stops each leg runs between, so a leg can be attributed', async () => {
    const outcome = await clientReadingServer(
      {
        routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
        origin: { placeId: 'ChIJorigin', isCurrentLocation: false },
        stops: [stop('s1', 'ChIJa'), stop('s2', 'ChIJb'), stop('s3', 'ChIJc')],
        isRoundTrip: false,
        departureTime: null,
      },
      [1, 0],
    );

    if (outcome.ok !== true || outcome.result.isDegraded) throw new Error('expected a T1 result');

    // The origin is a saved place rather than a stop, so the first leg starts
    // nowhere the route lists — `null` says so instead of naming a stop that is
    // not where the driver began.
    expect(outcome.result.legs.map((leg) => [leg.fromStopId, leg.toStopId])).toEqual([
      [null, 's2'],
      ['s2', 's1'],
      ['s1', 's3'],
    ]);
  });

  it('survives the two-stop route, where there is nothing to reorder', async () => {
    // The shape in the bug report: Rome and Milan, one way, no origin chosen.
    // One intermediate at most, and with the first stop as the origin, none —
    // which is the case no endpoint test covered.
    const outcome = await clientReadingServer(
      {
        routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
        origin: { placeId: null, isCurrentLocation: true },
        stops: [stop('s1', 'ChIJroma'), stop('s2', 'ChIJmilano')],
        isRoundTrip: false,
        departureTime: null,
      },
      [],
    );

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok !== true || outcome.result.isDegraded) throw new Error('expected a T1 result');
    expect(outcome.result.orderedStopIds).toEqual(['s1', 's2']);
  });

  it('accepts a response from a server that has not been redeployed yet', async () => {
    // **The failure this test exists for happened.** The leg ids were added to
    // both halves in one change, but the app ships on every push to `main` and
    // the Edge Functions deployed by hand — so a build went out with the new
    // client against the old server, and `.nullable()` still demands the key be
    // present. Optimization stayed broken for exactly the reason it had been
    // broken before, after being fixed.
    //
    // Nothing in the product reads these ids. A field nobody consumes must never
    // be able to fail a response (ADR-0024).
    const legacyBody = JSON.stringify({
      status: 'complete',
      tier: 'T1',
      isDegraded: false,
      orderedStopIds: ['s2', 's1', 's3'],
      // No `fromStopId`, no `toStopId` — the shape the server sent for weeks.
      legs: [{ distanceMeters: 1000, durationSeconds: 600, polyline: 'ab_cde' }],
      totalDistanceMeters: 484_100,
      totalDurationSeconds: 18_720,
      unreachableStopIds: [],
    });

    const client = new ApiClient({
      baseUrl: 'https://example.test/functions/v1',
      getAccessToken: () => Promise.resolve('test-token'),
      fetchImpl: (() =>
        Promise.resolve(
          new Response(legacyBody, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )) as unknown as typeof fetch,
    });

    const outcome = await createRoutingProvider({ client }).optimize({
      routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
      originPlaceId: 'ChIJorigin',
      originCoordinate: null,
      stops: [{ id: 's1', placeId: 'ChIJa' }],
      shape: 'one-way',
      departureTime: null,
      idempotencyKey: 'idem-0001-abcd',
    });

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok !== true || outcome.result.isDegraded) throw new Error('expected a T1 result');
    // Absent and null both mean the same thing, and the domain has one way of
    // saying it.
    expect(outcome.result.legs[0]?.fromStopId).toBeNull();
  });

  it('accepts a round trip, where the origin is also the destination', async () => {
    const outcome = await clientReadingServer(
      {
        routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
        origin: { placeId: 'ChIJorigin', isCurrentLocation: false },
        stops: [stop('s1', 'ChIJa'), stop('s2', 'ChIJb')],
        isRoundTrip: true,
        departureTime: null,
      },
      [1, 0],
    );

    expect(outcome).toMatchObject({ ok: true });
  });
});
