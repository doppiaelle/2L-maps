import { reorderableCount, routeEndsOf, shapeForEnd } from './route-ends';
import type { RouteEndsInputs } from './route-ends';

/**
 * Where the round begins and ends.
 *
 * Both ends were invisible until now, and the end was being decided by
 * accident: `setRouteShape` had no caller, so every route was one-way, and a
 * one-way route pins its **last typed stop** as the destination. A driver who
 * typed Rome, Abruzzo, Milan, Bari got Bari fixed at the end because they wrote
 * it last, and only two of the four stops were ever offered to the optimizer.
 *
 * The case that matters most is therefore the last one in this file: how many
 * stops the optimizer actually gets to move.
 */

const inputs = (overrides: Partial<RouteEndsInputs> = {}): RouteEndsInputs => ({
  originPlaceId: null,
  originIsCurrentLocation: true,
  originAddress: null,
  shape: 'one-way',
  firstStopTitle: 'Via Roma 12',
  ...overrides,
});

describe('where the round starts', () => {
  it('names the device when that is the origin', () => {
    expect(routeEndsOf(inputs()).startLabel).toBe('My location');
  });

  it('names the place when the driver chose one', () => {
    const ends = routeEndsOf(
      inputs({
        originIsCurrentLocation: false,
        originPlaceId: 'ChIJa',
        originAddress: 'Corso Francia 12, 10138 Torino TO, Italia',
      }),
    );

    expect(ends.startLabel).toBe('Corso Francia 12');
  });

  it('still names a chosen origin whose address has expired', () => {
    // The `place_id` is durable and the route still starts there; only the words
    // are gone (ADR-0007). Saying nothing would read as no origin at all.
    const ends = routeEndsOf(
      inputs({ originIsCurrentLocation: false, originPlaceId: 'ChIJa', originAddress: null }),
    );

    expect(ends.startLabel).toBe('Saved starting point');
  });

  it('names the first stop when no origin was ever chosen', () => {
    // Which is exactly what the endpoint does with such a route, so the label
    // states the behaviour rather than describing an absence.
    const ends = routeEndsOf(
      inputs({ originIsCurrentLocation: false, firstStopTitle: 'Via Po 2' }),
    );
    expect(ends.startLabel).toBe('Via Po 2');
  });

  it('survives an empty route with no origin and no stops', () => {
    const ends = routeEndsOf(inputs({ originIsCurrentLocation: false, firstStopTitle: null }));
    expect(ends.startLabel).toBe('The first stop');
  });
});

describe('where the round ends', () => {
  it('offers two ends, one of them selected', () => {
    const ends = routeEndsOf(inputs());
    expect(ends.options.map((option) => option.end)).toEqual(['last-stop', 'back-to-start']);
    expect(ends.options.filter((option) => option.isSelected)).toHaveLength(1);
  });

  it('says "back to my location" when the origin is the device', () => {
    // "Round trip" is what the geometry is called. This is what the driver is
    // asking for, and on a van round it is usually the whole point.
    const ends = routeEndsOf(inputs());
    expect(ends.options[1]?.label).toBe('Back to my location');
  });

  it('names the place when the origin is one', () => {
    const ends = routeEndsOf(
      inputs({
        originIsCurrentLocation: false,
        originPlaceId: 'ChIJa',
        originAddress: 'Corso Francia 12, Torino',
      }),
    );

    expect(ends.options[1]?.label).toBe('Back to Corso Francia 12');
  });

  it('reflects the shape the draft is actually in', () => {
    expect(routeEndsOf(inputs({ shape: 'one-way' })).options[0]?.isSelected).toBe(true);
    expect(routeEndsOf(inputs({ shape: 'round-trip' })).options[1]?.isSelected).toBe(true);
  });
});

describe('translating an end into a shape', () => {
  it('maps the two vocabularies in exactly one place', () => {
    // The screen speaks about ends; the draft, the database and the Routes API
    // all speak about shape.
    expect(shapeForEnd('back-to-start')).toBe('round-trip');
    expect(shapeForEnd('last-stop')).toBe('one-way');
  });
});

describe('how many stops the optimizer may actually move', () => {
  it('loses two of four when neither end was chosen', () => {
    // The reported defect, stated as a number. Rome, Abruzzo, Milan, Bari with
    // no origin: Rome is consumed as the origin, Bari is pinned as the
    // destination because it was typed last, and Google is offered two stops.
    expect(reorderableCount({ stopCount: 4, end: 'last-stop', startsFromFirstStop: true })).toBe(2);
  });

  it('gets all four back on a return to the start', () => {
    // A round trip's destination is the origin, so nothing is pinned. This is
    // the single change that most affects the order.
    expect(
      reorderableCount({ stopCount: 4, end: 'back-to-start', startsFromFirstStop: false }),
    ).toBe(4);
  });

  it('recovers the first stop as soon as an origin is chosen', () => {
    // Choosing "my location" is not only about where the van is: it hands the
    // first stop back to the optimizer.
    expect(reorderableCount({ stopCount: 4, end: 'last-stop', startsFromFirstStop: false })).toBe(
      3,
    );
  });

  it('does not go negative on an empty or single-stop route', () => {
    expect(reorderableCount({ stopCount: 0, end: 'last-stop', startsFromFirstStop: true })).toBe(0);
    expect(reorderableCount({ stopCount: 1, end: 'last-stop', startsFromFirstStop: true })).toBe(0);
    expect(
      reorderableCount({ stopCount: 1, end: 'back-to-start', startsFromFirstStop: false }),
    ).toBe(1);
  });
});
