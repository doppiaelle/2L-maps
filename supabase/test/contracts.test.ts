import { MAX_STOPS, MIN_STOPS } from '@/types';

import {
  DEPARTURE_BUCKET_MINUTES,
  canonicalCacheInput,
  departureBucket,
  optimizationCacheKey,
} from '../functions/_shared/cache-key';
import {
  autocompleteRequestSchema,
  geocodeRequestSchema,
  optimizeRequestSchema,
  parseRequest,
  revenueCatWebhookSchema,
} from '../functions/_shared/schemas';
import { errorResponse } from '../functions/_shared/http';

/**
 * Contract tests for request validation and the shared cache key
 * (docs/33_API_CONTRACTS.md).
 *
 * Two properties carry real consequences beyond correctness: a request that
 * escapes validation becomes a billed upstream call, and a cache key containing
 * anything personal makes cross-user sharing a data leak rather than a cost
 * saving.
 */

const validOptimize = {
  routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
  origin: { placeId: 'place-origin', isCurrentLocation: false },
  stops: [
    { stopId: 'stop-a', placeId: 'place-a' },
    { stopId: 'stop-b', placeId: 'place-b' },
  ],
  isRoundTrip: false,
};

describe('/optimize input', () => {
  it('accepts a well-formed request', () => {
    expect(parseRequest(optimizeRequestSchema, validOptimize).ok).toBe(true);
  });

  it('enforces the stop range the server, not the client, is responsible for', () => {
    // The client's check states the limit before it is reached, for the user's
    // benefit. This one is the enforcement: a client can be modified, and above
    // 25 stops the request escalates to a tier that bills per stop.
    const tooFew = { ...validOptimize, stops: [{ stopId: 'stop-a', placeId: 'only-one' }] };
    const tooMany = {
      ...validOptimize,
      stops: Array.from({ length: MAX_STOPS + 1 }, (_, i) => ({
        stopId: `s-${i}`,
        placeId: `p-${i}`,
      })),
    };
    const exactlyMax = {
      ...validOptimize,
      stops: Array.from({ length: MAX_STOPS }, (_, i) => ({ stopId: `s-${i}`, placeId: `p-${i}` })),
    };
    const exactlyMin = {
      ...validOptimize,
      stops: Array.from({ length: MIN_STOPS }, (_, i) => ({ stopId: `s-${i}`, placeId: `p-${i}` })),
    };

    expect(parseRequest(optimizeRequestSchema, tooFew).ok).toBe(false);
    expect(parseRequest(optimizeRequestSchema, tooMany).ok).toBe(false);
    expect(parseRequest(optimizeRequestSchema, exactlyMax).ok).toBe(true);
    expect(parseRequest(optimizeRequestSchema, exactlyMin).ok).toBe(true);
  });

  it('rejects an out-of-range coordinate', () => {
    const bad = {
      ...validOptimize,
      origin: { placeId: null, isCurrentLocation: true, latitude: 91, longitude: 0 },
    };
    expect(parseRequest(optimizeRequestSchema, bad).ok).toBe(false);
  });

  it('rejects a non-uuid route id', () => {
    expect(parseRequest(optimizeRequestSchema, { ...validOptimize, routeId: 'nope' }).ok).toBe(
      false,
    );
  });

  it('rejects entirely unexpected input rather than coercing it', () => {
    for (const body of [null, undefined, 'a string', 42, []]) {
      expect(parseRequest(optimizeRequestSchema, body).ok).toBe(false);
    }
  });

  it('reports INVALID_REQUEST, which is our defect and alerts', () => {
    const outcome = parseRequest(optimizeRequestSchema, {});
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.code).toBe('INVALID_REQUEST');
  });

  it('never echoes the validation detail back to the caller', async () => {
    // The client built the request, so the user cannot act on the specifics, and
    // echoing them describes our internals to whoever sent it.
    //
    // **The assertion is on the response, not on the parse outcome.** It used to
    // be on the outcome, which made it a proxy for the property rather than the
    // property — and the proxy blocked a fix it was never meant to block. The
    // outcome now carries the failing field *names* so the handler can log them:
    // a rejection that leaves no trace anywhere is how an `idempotencyKey` too
    // long by five characters broke `/optimize` for weeks with nothing to find.
    // What must not leak is what leaves the building, and that is this.
    const outcome = parseRequest(optimizeRequestSchema, { routeId: 'not-a-uuid' });
    expect(outcome.ok).toBe(false);

    const body = await errorResponse(
      outcome.ok ? 'INTERNAL' : outcome.code,
      'Something went wrong on our side',
    ).text();

    expect(body).not.toContain('uuid');
    expect(body).not.toContain('routeId');
    expect(body).not.toContain('not-a-uuid');
  });

  it('names the failing fields to the log, and only their names', () => {
    // Field names are ours — we chose them and they appear in the contract.
    // Their values are the user's, and an address may never reach a log line
    // (`CLAUDE.md` §9 rule 7).
    const outcome = parseRequest(optimizeRequestSchema, {
      routeId: 'not-a-uuid',
      origin: { placeId: null, isCurrentLocation: true },
      stops: [{ stopId: 's1', placeId: 'ChIJ', label: 'Via Collatina 22, Roma' }],
      isRoundTrip: false,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.fields).toContain('routeId');
    expect(JSON.stringify(outcome.fields)).not.toContain('Collatina');
    expect(JSON.stringify(outcome.fields)).not.toContain('not-a-uuid');
  });
});

describe('/places-autocomplete input', () => {
  it('accepts a request carrying a session token', () => {
    const outcome = parseRequest(autocompleteRequestSchema, {
      input: 'Via Roma',
      sessionToken: 'session-abc',
    });
    expect(outcome.ok).toBe(true);
  });

  it('rejects a request without one, with its own code', () => {
    // Without a session token every keystroke bills separately instead of under
    // session pricing — the single largest way this product's COGS escapes
    // control. It gets a distinct code so the client defect is visible.
    const outcome = parseRequest(autocompleteRequestSchema, { input: 'Via Roma' });
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.code).toBe('MISSING_SESSION_TOKEN');
  });

  it('rejects an empty session token as firmly as a missing one', () => {
    const outcome = parseRequest(autocompleteRequestSchema, {
      input: 'Via Roma',
      sessionToken: '',
    });
    expect(!outcome.ok && outcome.code).toBe('MISSING_SESSION_TOKEN');
  });

  it('accepts an optional location bias, in the shape the contract states', () => {
    // `lat`/`lng` (docs/33_API_CONTRACTS.md §`/places-autocomplete`). This case
    // used to assert `latitude`/`longitude` plus a `radiusMeters` the contract
    // never mentions, and it passed — because it was checking the schema against
    // its own author's belief rather than against the client. It is the reason
    // a broken endpoint looked covered.
    const outcome = parseRequest(autocompleteRequestSchema, {
      input: 'Via Roma',
      sessionToken: 's',
      bias: { lat: 45.46, lng: 9.19 },
    });
    expect(outcome.ok).toBe(true);
  });

  it('accepts an explicit null where the client has no bias and no locale', () => {
    // `.optional()` alone accepts an absent key and rejects `null`. The client
    // sends `null`, so this is the exact request every search made — and every
    // one was answered 400 before Google was contacted.
    const outcome = parseRequest(autocompleteRequestSchema, {
      input: 'Via Roma',
      sessionToken: 's',
      bias: null,
      locale: null,
    });
    expect(outcome.ok).toBe(true);
  });
});

describe('/geocode input', () => {
  it('accepts a batch within the stop limit', () => {
    const outcome = parseRequest(geocodeRequestSchema, {
      addresses: ['Via Roma 1, Milano', 'Corso Buenos Aires 33, Milano'],
    });
    expect(outcome.ok).toBe(true);
  });

  it('rejects an empty batch and one over the limit', () => {
    expect(parseRequest(geocodeRequestSchema, { addresses: [] }).ok).toBe(false);
    expect(
      parseRequest(geocodeRequestSchema, {
        addresses: Array.from({ length: MAX_STOPS + 1 }, () => 'Via Roma 1'),
      }).ok,
    ).toBe(false);
  });
});

describe('the RevenueCat webhook', () => {
  it('accepts an event and ignores fields it does not read', () => {
    // RevenueCat adds fields on their schedule; a strict schema would start
    // rejecting valid events on their release cadence rather than ours.
    const outcome = parseRequest(revenueCatWebhookSchema, {
      event: {
        id: 'evt-1',
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-1',
        some_future_field: { nested: true },
      },
      api_version: '1.0',
    });
    expect(outcome.ok).toBe(true);
  });

  it('rejects an event with no id, since idempotency depends on it', () => {
    // RevenueCat retries on failure, so the handler must be idempotent by event
    // id — without one, a retry grants entitlement twice.
    const outcome = parseRequest(revenueCatWebhookSchema, {
      event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1' },
    });
    expect(outcome.ok).toBe(false);
  });
});

describe('the shared cache key', () => {
  const base = {
    stopPlaceIds: ['place-a', 'place-b', 'place-c'],
    originPlaceId: 'place-origin',
    originCoordinate: null,
    isRoundTrip: false,
    departureTime: null,
  };

  it('ignores the order the stops were entered in', () => {
    // The order is what the optimization produces. Keying on the input order
    // would miss every hit from a user who entered the same stops differently —
    // and that is most of the sharing this cache exists for.
    const reversed = { ...base, stopPlaceIds: ['place-c', 'place-b', 'place-a'] };
    expect(optimizationCacheKey(base)).toBe(optimizationCacheKey(reversed));
  });

  it('separates round trip from one way', () => {
    // The optimal order genuinely differs, so sharing a key would serve the wrong
    // route.
    expect(optimizationCacheKey(base)).not.toBe(
      optimizationCacheKey({ ...base, isRoundTrip: true }),
    );
  });

  it('separates different origins', () => {
    expect(optimizationCacheKey(base)).not.toBe(
      optimizationCacheKey({ ...base, originPlaceId: 'somewhere-else' }),
    );
  });

  it('separates different stop sets', () => {
    expect(optimizationCacheKey(base)).not.toBe(
      optimizationCacheKey({ ...base, stopPlaceIds: ['place-a', 'place-b'] }),
    );
  });

  it('separates two routes that start from different places on the device', () => {
    // The bug this replaced: a null origin canonicalised to the literal string
    // `current-location`, so every "start from where I am" route with the same
    // stops shared one key — and a driver in Bergamo could be served the answer
    // computed for a driver in Palermo.
    const here = {
      ...base,
      originPlaceId: null,
      originCoordinate: { latitude: 45.69, longitude: 9.67 },
    };
    const there = {
      ...base,
      originPlaceId: null,
      originCoordinate: { latitude: 38.11, longitude: 13.36 },
    };
    expect(optimizationCacheKey(here)).not.toBe(optimizationCacheKey(there));
  });

  it('shares a key between two starts in the same yard', () => {
    // Rounded to about 110 m, so two vans loading at the same depot share the
    // upstream call rather than each buying their own.
    const one = {
      ...base,
      originPlaceId: null,
      originCoordinate: { latitude: 45.6983, longitude: 9.6773 },
    };
    const other = {
      ...base,
      originPlaceId: null,
      originCoordinate: { latitude: 45.69834, longitude: 9.67729 },
    };
    expect(optimizationCacheKey(one)).toBe(optimizationCacheKey(other));
  });

  it('contains nothing personal — the reason cross-user sharing is acceptable', () => {
    const canonical = canonicalCacheInput(base);
    expect(canonical).toContain('place-a');
    // No user id, no label, no note, no coordinate can appear here.
    expect(canonical).not.toMatch(/user/i);
    expect(canonical).not.toMatch(/\d+\.\d+,\s*-?\d+\.\d+/);
  });

  it('buckets departure times so near-identical requests share a key', () => {
    const bucket = DEPARTURE_BUCKET_MINUTES;
    const a = new Date('2026-08-07T09:01:00.000Z');
    const b = new Date(`2026-08-07T09:${String(bucket - 1).padStart(2, '0')}:00.000Z`);
    expect(departureBucket(a)).toBe(departureBucket(b));
  });

  it('separates departures in different buckets', () => {
    const a = new Date('2026-08-07T09:01:00.000Z');
    const later = new Date('2026-08-07T11:01:00.000Z');
    expect(departureBucket(a)).not.toBe(departureBucket(later));
  });

  it('treats an absent departure as its own bucket', () => {
    expect(departureBucket(null)).toBe('now');
    expect(departureBucket(new Date('nonsense'))).toBe('now');
  });

  it('is stable across calls, or nothing would ever hit', () => {
    expect(optimizationCacheKey(base)).toBe(optimizationCacheKey({ ...base }));
  });

  it('is a fixed-width hex string', () => {
    expect(optimizationCacheKey(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('carries a version prefix so the format can change without stale hits', () => {
    expect(canonicalCacheInput(base)).toMatch(/^v2\|/);
  });
});
