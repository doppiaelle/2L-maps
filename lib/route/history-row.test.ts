import { historyRowOf } from './history-row';
import type { SavedRouteStop, SavedRouteSummary } from './persistence';

/**
 * What a History row says.
 *
 * The reported problem was that it said nothing about *which day* it was — a
 * name most routes do not have, a distance and a duration that are identical
 * across a week of rounds. So the cases that matter are the ones where the row
 * has to stay useful with less than everything: a route whose addresses have
 * expired, a round trip that has one endpoint rather than two, and a degraded
 * result that has no duration to show.
 */

const stop = (overrides: Partial<SavedRouteStop> = {}): SavedRouteStop => ({
  placeId: 'ChIJa',
  entryOrder: 0,
  optimizedOrder: null,
  address: 'Corso Francia 12, 10138 Torino TO, Italia',
  ...overrides,
});

const summary = (overrides: Partial<SavedRouteSummary> = {}): SavedRouteSummary => ({
  routeId: 'route-1',
  name: null,
  status: 'optimized',
  stopCount: 12,
  isRoundTrip: false,
  stops: [
    stop({ placeId: 'ChIJa', entryOrder: 0 }),
    stop({ placeId: 'ChIJb', entryOrder: 1, address: 'Via Meucci 3, 10098 Rivoli TO, Italia' }),
  ],
  isDegraded: false,
  distanceMeters: 34_000,
  durationSeconds: 4_320,
  updatedAt: '2026-08-11T09:00:00.000Z',
  ...overrides,
});

describe('what the row says at a glance', () => {
  it('names the day, its size and its shape', () => {
    const row = historyRowOf(summary());

    expect(row.title).toBe('11 Aug · 12 stops');
    expect(row.meta).toBe('12 stops · one way');
  });

  it('shows where it started and where it ended', () => {
    // The thing that distinguishes Tuesday's round from Wednesday's, and the
    // reason the row was rebuilt.
    expect(historyRowOf(summary()).journey).toBe('Corso Francia 12 → Via Meucci 3');
  });

  it('takes the street rather than the whole postal address', () => {
    // The full form truncates in the middle of a postcode at row width and
    // identifies nothing. The first component is what the driver recognises,
    // and is what Google's own autocomplete puts on its first line.
    expect(historyRowOf(summary()).journey).not.toContain('10138');
  });

  it('keeps a name the user gave it', () => {
    expect(historyRowOf(summary({ name: 'Monday north' })).title).toBe('Monday north');
  });
});

describe('the order shown is the order driven', () => {
  it('uses the optimized order when there is one', () => {
    // A route reopened in one order and listed in another is two answers to one
    // question. `fromRows` sorts by the same rule.
    const row = historyRowOf(
      summary({
        stops: [
          stop({ placeId: 'ChIJa', entryOrder: 0, optimizedOrder: 1, address: 'Via Roma 1' }),
          stop({ placeId: 'ChIJb', entryOrder: 1, optimizedOrder: 0, address: 'Via Po 2' }),
        ],
      }),
    );

    expect(row.journey).toBe('Via Po 2 → Via Roma 1');
  });

  it('falls back to the entry order for a route that was never optimized', () => {
    const row = historyRowOf(
      summary({
        stops: [
          stop({ entryOrder: 1, address: 'Via Po 2' }),
          stop({ entryOrder: 0, address: 'Via Roma 1' }),
        ],
      }),
    );

    expect(row.journey).toBe('Via Roma 1 → Via Po 2');
  });
});

describe('a round trip', () => {
  it('shows one endpoint, not the same one twice', () => {
    // "Corso Francia → Corso Francia" is a fact about the shape, which the meta
    // line already states more clearly.
    const row = historyRowOf(summary({ isRoundTrip: true }));

    expect(row.journey).toBe('Corso Francia 12');
    expect(row.meta).toBe('12 stops · round trip');
  });
});

describe('when the thirty days have passed', () => {
  it('shows no journey rather than a placeholder', () => {
    // The purge nulls the address and keeps the `place_id` (ADR-0007). That is
    // the ordinary state of an old route, not a failure, and the row shows what
    // it still knows.
    const row = historyRowOf(
      summary({ stops: [stop({ address: null }), stop({ entryOrder: 1, address: null })] }),
    );

    expect(row.journey).toBeNull();
    expect(row.title).toBe('11 Aug · 12 stops');
    expect(row.metrics).toBe('34.0 km · 1h 12min');
  });

  it('shows the end it still knows when only one has expired', () => {
    // Half an answer beats none: "started at Corso Francia" is still the thing
    // the driver is scanning for.
    const row = historyRowOf(
      summary({
        stops: [stop({ entryOrder: 0 }), stop({ entryOrder: 1, address: null })],
      }),
    );

    expect(row.journey).toBe('Corso Francia 12');
  });

  it('shows no journey for a route with no stops at all', () => {
    expect(historyRowOf(summary({ stops: [], stopCount: 0 })).journey).toBeNull();
  });
});

describe('what the row admits about its numbers', () => {
  it('omits the duration a degraded route never had', () => {
    // A T0 result is an ordering with no road timing. A blank is the honest half
    // of the same rule the chip states out loud (`CLAUDE.md` §7 rule 6).
    const row = historyRowOf(summary({ isDegraded: true, durationSeconds: null }));

    expect(row.metrics).toBe('34.0 km');
    expect(row.isDegraded).toBe(true);
  });

  it('omits the metrics line entirely when there is nothing measured', () => {
    expect(
      historyRowOf(summary({ distanceMeters: null, durationSeconds: null })).metrics,
    ).toBeNull();
  });
});

describe('which routes wear a chip', () => {
  it('marks the one the driver set off on', () => {
    expect(historyRowOf(summary({ status: 'in_progress' })).status).toBe('in-progress');
  });

  it('marks a route the next one closed', () => {
    expect(historyRowOf(summary({ status: 'completed' })).status).toBe('done');
  });

  it('leaves the ordinary case unmarked, so a chip means something', () => {
    expect(historyRowOf(summary({ status: 'optimized' })).status).toBeNull();
    expect(historyRowOf(summary({ status: 'draft' })).status).toBeNull();
  });
});

describe('what a screen reader hears', () => {
  it('reads the whole row as one utterance', () => {
    // Five separate stops teach the same thing five times and leave no way to
    // tell where one route ends and the next begins.
    const spoken = historyRowOf(summary({ status: 'in_progress' })).spoken;

    expect(spoken).toBe(
      '11 Aug · 12 stops, 12 stops, one way, Corso Francia 12 to Via Meucci 3, 34.0 km · 1h 12min, in progress',
    );
  });

  it('says a degraded route is estimated, wherever it appears', () => {
    expect(historyRowOf(summary({ isDegraded: true })).spoken).toContain(
      'estimated without traffic',
    );
  });
});
