import { COORDINATE_MAX_AGE_DAYS } from '@/types';
import type { Stop } from '@/types';

import { isPlaceTextFresh, NEEDS_REFRESHING, placeTextFrom, stopTextOf } from './stop-text';

/**
 * What a row says, and why it stopped saying the wrong thing.
 *
 * "Address needs refreshing" was on every row of a two-stop route in a
 * screenshot from a real phone, on addresses that had just been chosen from a
 * working search. The cause was not the lookup failing — it was the app
 * discarding the text autocomplete had already handed it, then depending on a
 * second billed round trip to recover it.
 *
 * So the cases below are mostly about *not* needing the network, and about the
 * placeholder appearing only when it is true.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z');

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000 - 1_000).toISOString();

const stop = (overrides: Partial<Stop> = {}): Stop => ({
  id: 's1',
  placeId: 'ChIJa',
  label: null,
  placeText: null,
  note: null,
  position: 0,
  entryOrder: 0,
  coordinate: null,
  ...overrides,
});

const suggestion = { primaryText: 'Via Roma 12', secondaryText: 'Torino, TO, Italia' };

describe('a stop chosen from search reads immediately', () => {
  it('shows Google’s two lines with no lookup at all', () => {
    // The regression, in one case. Before this the same stop rendered the
    // placeholder until `/place-details` answered — and for ever if it did not.
    const text = stopTextOf({
      stop: stop({ placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text).toEqual({
      title: 'Via Roma 12',
      subtitle: 'Torino, TO, Italia',
      needsRefreshing: false,
    });
  });

  it('reads offline, because nothing about it is a round trip', () => {
    // `resolvedAddress: null` is exactly what a dead radio produces (ADR-0008).
    const text = stopTextOf({
      stop: stop({ placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text.needsRefreshing).toBe(false);
  });

  it('drops a second line that Google left empty rather than showing a blank', () => {
    const text = stopTextOf({
      stop: stop({ placeText: placeTextFrom({ primaryText: 'Roma', secondaryText: '' }, NOW) }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text).toEqual({ title: 'Roma', subtitle: null, needsRefreshing: false });
  });
});

describe('which of the three sources wins', () => {
  it('prefers the user’s own label to anything Google says', () => {
    // Somebody who typed "Magazzino nord" does not want it replaced by a street
    // address on the next refresh.
    const text = stopTextOf({
      stop: stop({ label: 'Magazzino nord', placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: 'Via Roma 12, 10121 Torino TO, Italia',
      now: NOW,
    });

    expect(text.title).toBe('Magazzino nord');
    // And the address becomes the second line rather than being thrown away.
    expect(text.subtitle).toBe('Via Roma 12, 10121 Torino TO, Italia');
  });

  it('prefers the canonical address to the suggestion text', () => {
    // `/place-details` is more canonical than an autocomplete line; when both
    // are present and fresh, the better one wins.
    const text = stopTextOf({
      stop: stop({ placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: 'Via Roma 12, 10121 Torino TO, Italia',
      now: NOW,
    });

    expect(text.title).toBe('Via Roma 12, 10121 Torino TO, Italia');
  });

  it('falls back to the suggestion when the lookup has not landed', () => {
    const text = stopTextOf({
      stop: stop({ placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text.title).toBe('Via Roma 12');
  });

  it('gives a label its Google line when no address has arrived', () => {
    const text = stopTextOf({
      stop: stop({ label: 'Cliente 4', placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text.subtitle).toBe('Via Roma 12, Torino, TO, Italia');
  });
});

describe('the thirty-day rule applies to Google’s words too', () => {
  it('accepts text inside the window', () => {
    expect(
      isPlaceTextFresh({ ...suggestion, refreshedAt: daysAgo(COORDINATE_MAX_AGE_DAYS - 1) }, NOW),
    ).toBe(true);
  });

  it('expires it on the same day a coordinate expires', () => {
    // Autocomplete text is Google-derived content and perishes exactly as a
    // coordinate does (ADR-0007). Two clocks for one obligation is one of them
    // being wrong.
    expect(
      isPlaceTextFresh({ ...suggestion, refreshedAt: daysAgo(COORDINATE_MAX_AGE_DAYS) }, NOW),
    ).toBe(false);
  });

  it('shows the placeholder once it has expired and nothing replaced it', () => {
    const text = stopTextOf({
      stop: stop({
        placeText: { ...suggestion, refreshedAt: daysAgo(COORDINATE_MAX_AGE_DAYS + 5) },
      }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text).toEqual({ title: NEEDS_REFRESHING, subtitle: null, needsRefreshing: true });
  });

  it('refuses a timestamp from the future rather than treating it as fresh', () => {
    // A device set forward would otherwise hold Google's text indefinitely.
    const ahead = new Date(NOW.getTime() + 86_400_000).toISOString();
    expect(isPlaceTextFresh({ ...suggestion, refreshedAt: ahead }, NOW)).toBe(false);
  });

  it('refuses an unparseable timestamp', () => {
    expect(isPlaceTextFresh({ ...suggestion, refreshedAt: 'not a date' }, NOW)).toBe(false);
  });

  it('will not show an address whose coordinate has expired', () => {
    // `formattedAddress` lives inside the coordinate cache and the purge nulls
    // the row together — an address outliving its coordinate on the device
    // would be the one copy nothing clears.
    const text = stopTextOf({
      stop: stop({
        coordinate: {
          latitude: 45.07,
          longitude: 7.68,
          formattedAddress: 'Via Roma 12, Torino',
          refreshedAt: daysAgo(COORDINATE_MAX_AGE_DAYS + 1),
        },
      }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text.needsRefreshing).toBe(true);
  });
});

describe('when there is genuinely nothing to show', () => {
  it('says so, and says it only then', () => {
    const text = stopTextOf({ stop: stop(), resolvedAddress: null, now: NOW });
    expect(text).toEqual({ title: NEEDS_REFRESHING, subtitle: null, needsRefreshing: true });
  });

  it('does not report a real address that happens to match the placeholder', () => {
    // `needsRefreshing` is a fact about the sources, not a string comparison —
    // deriving it by comparing the title would flag this row.
    const text = stopTextOf({
      stop: stop({ label: NEEDS_REFRESHING }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text.needsRefreshing).toBe(false);
  });

  it('treats an empty label as no label', () => {
    const text = stopTextOf({
      stop: stop({ label: '', placeText: placeTextFrom(suggestion, NOW) }),
      resolvedAddress: null,
      now: NOW,
    });

    expect(text.title).toBe('Via Roma 12');
  });
});
