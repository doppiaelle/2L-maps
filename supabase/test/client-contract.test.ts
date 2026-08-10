import { ApiClient } from '@/lib/api/client';
import { createGeocodingProvider } from '@/lib/api/geocoding-adapter';
import { createRoutingProvider } from '@/lib/api/routing-adapter';

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
