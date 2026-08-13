import { fingerprint, idempotencyKeyFor } from './idempotency';
import { emptyDraft } from './draft';
import type { DraftRoute } from './draft';
import { MAX_STOPS } from '@/types';

/**
 * The key that has to fit, and has to keep meaning the same thing.
 *
 * The contract bounds it at 128 characters (`optimizeRequestSchema`), and the
 * previous key — the inputs concatenated — passed that bound at three stops and
 * failed at every route above it. The failure was a 400 raised before the
 * pipeline ran, so it produced no log line at either end and reached the user as
 * "Could not optimize". A length test is the whole reason this file exists.
 */

/** The ceiling in `supabase/functions/_shared/schemas.ts`. Written out rather
 *  than imported: the client bundle and the Deno functions share no module, and
 *  a number that has to agree across that gap is exactly what a test is for. */
const IDEMPOTENCY_KEY_MAX = 128;

/** Longer than Google's base64-form ids for interpolated street addresses, which
 *  are the ones that broke this. */
const LONG_PLACE_ID = `Ei${'x'.repeat(150)}`;

const draftWith = (placeIds: readonly string[]): DraftRoute => ({
  ...emptyDraft('2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f'),
  stops: placeIds.map((placeId, index) => ({
    id: `s${index}`,
    placeId,
    label: null,
    placeText: null,
    note: null,
    position: index,
    entryOrder: index,
    coordinate: null,
    isCompleted: false,
  })),
});

describe('the length, which is the thing that broke', () => {
  it('fits the contract at two stops', () => {
    expect(idempotencyKeyFor(draftWith(['ChIJa', 'ChIJb'])).length).toBeLessThanOrEqual(
      IDEMPOTENCY_KEY_MAX,
    );
  });

  it('fits at three, where the old key first overran', () => {
    const key = idempotencyKeyFor(
      draftWith([
        'ChIJaaaaaaaaaaaaaaaaaaaaaa',
        'ChIJbbbbbbbbbbbbbbbbbbbbbb',
        'ChIJcccccccccccccccccccccc',
      ]),
    );
    expect(key.length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX);
  });

  it('fits at the maximum route, with the longest place ids Google issues', () => {
    // 25 stops of 152 characters each. The old key measured over 3,800.
    const draft = draftWith(Array.from({ length: MAX_STOPS }, (_, i) => `${LONG_PLACE_ID}${i}`));
    expect(idempotencyKeyFor(draft).length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX);
  });

  it('is the same length whatever the route', () => {
    // A constant, not merely a bound: the length cannot drift back toward the
    // ceiling as routes grow.
    const short = idempotencyKeyFor(draftWith(['a', 'b']));
    const long = idempotencyKeyFor(draftWith([LONG_PLACE_ID, LONG_PLACE_ID, LONG_PLACE_ID]));
    expect(short.length).toBe(long.length);
  });
});

describe('what the key must still mean', () => {
  it('is stable for the same work, so a retry is not a second billed call', () => {
    const draft = draftWith(['ChIJa', 'ChIJb']);
    expect(idempotencyKeyFor(draft)).toBe(idempotencyKeyFor(draftWith(['ChIJa', 'ChIJb'])));
  });

  it('changes when a stop is added', () => {
    // A new attempt after an edit must not collide, or the server answers with
    // the previous route's result.
    expect(idempotencyKeyFor(draftWith(['ChIJa', 'ChIJb']))).not.toBe(
      idempotencyKeyFor(draftWith(['ChIJa', 'ChIJb', 'ChIJc'])),
    );
  });

  it('changes when the stops are reordered', () => {
    expect(idempotencyKeyFor(draftWith(['ChIJa', 'ChIJb']))).not.toBe(
      idempotencyKeyFor(draftWith(['ChIJb', 'ChIJa'])),
    );
  });

  it('changes when the shape changes', () => {
    const draft = draftWith(['ChIJa', 'ChIJb']);
    expect(idempotencyKeyFor(draft)).not.toBe(idempotencyKeyFor({ ...draft, shape: 'round-trip' }));
  });

  it('changes when the origin changes', () => {
    const draft = draftWith(['ChIJa', 'ChIJb']);
    expect(idempotencyKeyFor(draft)).not.toBe(
      idempotencyKeyFor({ ...draft, originPlaceId: 'ChIJdepot' }),
    );
  });

  it('separates a first-stop route from a current-location route', () => {
    const draft = draftWith(['ChIJa', 'ChIJb']);
    const currentLocationDraft = {
      ...draft,
      originIsCurrentLocation: true,
      routeStart: 'current-location' as const,
    };

    expect(idempotencyKeyFor(draft)).not.toBe(
      idempotencyKeyFor(currentLocationDraft, { latitude: 45.4642, longitude: 9.19 }),
    );
  });

  it('changes when the current-location coordinate changes', () => {
    const draft = {
      ...draftWith(['ChIJa', 'ChIJb']),
      originIsCurrentLocation: true,
      routeStart: 'current-location' as const,
    };

    expect(idempotencyKeyFor(draft, { latitude: 45.4642, longitude: 9.19 })).not.toBe(
      idempotencyKeyFor(draft, { latitude: 45.4742, longitude: 9.19 }),
    );
  });

  it('is stable for a retry from the same current-location coordinate', () => {
    const draft = {
      ...draftWith(['ChIJa', 'ChIJb']),
      originIsCurrentLocation: true,
      routeStart: 'current-location' as const,
    };
    const origin = { latitude: 45.4642, longitude: 9.19 };

    expect(idempotencyKeyFor(draft, origin)).toBe(idempotencyKeyFor(draft, origin));
  });

  it('separates return-to-start from return-to-current-location', () => {
    const draft = draftWith(['ChIJa', 'ChIJb']);
    const returnToStart = {
      ...draft,
      shape: 'round-trip' as const,
      routeEnd: 'return-to-start' as const,
    };
    const returnToCurrent = {
      ...returnToStart,
      originIsCurrentLocation: true,
      routeStart: 'current-location' as const,
      routeEnd: 'current-location' as const,
    };

    expect(idempotencyKeyFor(returnToStart)).not.toBe(
      idempotencyKeyFor(returnToCurrent, { latitude: 45.4642, longitude: 9.19 }),
    );
  });

  it('separates two routes that happen to hold identical stops', () => {
    // The route id stays outside the hash for exactly this: one route's result
    // must never be served for another's.
    const draft = draftWith(['ChIJa', 'ChIJb']);
    expect(idempotencyKeyFor(draft)).not.toBe(
      idempotencyKeyFor({ ...draft, routeId: '11111111-1111-4111-8111-111111111111' }),
    );
  });

  it('clears the schema’s eight-character floor', () => {
    expect(idempotencyKeyFor(draftWith([])).length).toBeGreaterThanOrEqual(8);
  });
});

describe('the hash itself', () => {
  it('is fixed width, whatever it is given', () => {
    expect(fingerprint('')).toHaveLength(16);
    expect(fingerprint('x'.repeat(10_000))).toHaveLength(16);
  });

  it('is hexadecimal, so it survives a URL and a log line unescaped', () => {
    expect(fingerprint('via roma 12, bergamo')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('separates inputs that differ by one character', () => {
    expect(fingerprint('ChIJa,ChIJb')).not.toBe(fingerprint('ChIJa,ChIJc'));
  });
});
