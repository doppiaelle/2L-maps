import { COORDINATE_MAX_AGE_DAYS, type CoordinateCache, type Stop } from '@/types';

import {
  ageInDays,
  allCoordinatesFresh,
  isCoordinateExpired,
  isCoordinateFresh,
  placeIdsNeedingRehydration,
} from './staleness';

/**
 * Coordinate expiry is non-negotiable coverage (CLAUDE.md §5), tested at 29, 30
 * and 31 days. Exceeding 30 consecutive days is a terms breach rather than a
 * stale cache (ADR-0007), so an off-by-one here is a compliance defect and not a
 * rounding preference.
 */

const NOW = new Date('2026-08-07T12:00:00.000Z');

const daysAgo = (days: number, hours = 0): string =>
  new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();

const coordinate = (refreshedAt: string): CoordinateCache => ({
  latitude: 45.4642,
  longitude: 9.19,
  formattedAddress: 'Piazza del Duomo, Milano',
  refreshedAt,
});

const stop = (placeId: string, coord: CoordinateCache | null): Stop => ({
  id: `stop-${placeId}`,
  placeId,
  label: null,
  placeText: null,
  note: null,
  position: 0,
  entryOrder: 0,
  coordinate: coord,
});

describe('the 30-day boundary', () => {
  it('the documented maximum is 30 days', () => {
    expect(COORDINATE_MAX_AGE_DAYS).toBe(30);
  });

  it('day 29 is fresh', () => {
    expect(isCoordinateFresh(coordinate(daysAgo(29)), NOW)).toBe(true);
  });

  it('day 30 is still fresh — the terms permit 30 consecutive days', () => {
    expect(isCoordinateFresh(coordinate(daysAgo(30)), NOW)).toBe(true);
  });

  it('day 31 is not fresh', () => {
    expect(isCoordinateFresh(coordinate(daysAgo(31)), NOW)).toBe(false);
  });

  it('30 days and 23 hours is still day 30, so still fresh', () => {
    // Whole days elapsed, floored. The terms count days, not instants.
    expect(ageInDays(daysAgo(30, 23), NOW)).toBe(30);
    expect(isCoordinateFresh(coordinate(daysAgo(30, 23)), NOW)).toBe(true);
  });

  it('exactly 31 days to the millisecond is expired', () => {
    expect(ageInDays(daysAgo(31), NOW)).toBe(31);
    expect(isCoordinateFresh(coordinate(daysAgo(31)), NOW)).toBe(false);
  });
});

describe('absent and malformed coordinates', () => {
  it('a null coordinate is never fresh', () => {
    // Coordinates are nullable by design, so this is the normal case after a
    // purge, not an error state (ADR-0007).
    expect(isCoordinateFresh(null, NOW)).toBe(false);
  });

  it('a null coordinate is not "expired" — it was never cached', () => {
    // The distinction matters: expired means re-hydrate, absent means fetch.
    expect(isCoordinateExpired(null, NOW)).toBe(false);
    expect(isCoordinateExpired(coordinate(daysAgo(31)), NOW)).toBe(true);
  });

  it('an unparseable timestamp fails closed', () => {
    expect(ageInDays('not a date', NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(isCoordinateFresh(coordinate('not a date'), NOW)).toBe(false);
  });

  it('a future timestamp is rejected rather than trusted', () => {
    // A device clock set forward would otherwise extend the window past what the
    // terms allow, and the extension would be invisible.
    const tomorrow = new Date(NOW.getTime() + 86_400_000).toISOString();
    expect(isCoordinateFresh(coordinate(tomorrow), NOW)).toBe(false);
  });
});

describe('re-hydration planning', () => {
  it('lists the place_ids of stale and absent stops only', () => {
    const stops = [
      stop('fresh-1', coordinate(daysAgo(1))),
      stop('stale-1', coordinate(daysAgo(31))),
      stop('absent-1', null),
      stop('fresh-2', coordinate(daysAgo(30))),
    ];
    expect(placeIdsNeedingRehydration(stops, NOW)).toEqual(['stale-1', 'absent-1']);
  });

  it('deduplicates a place_id repeated across stops', () => {
    // The same address can legitimately appear twice in a route — a depot
    // revisited mid-round. Fetching it twice bills twice.
    const stops = [stop('depot', null), stop('depot', coordinate(daysAgo(40)))];
    expect(placeIdsNeedingRehydration(stops, NOW)).toEqual(['depot']);
  });

  it('returns nothing when every coordinate is usable', () => {
    const stops = [stop('a', coordinate(daysAgo(0))), stop('b', coordinate(daysAgo(29)))];
    expect(placeIdsNeedingRehydration(stops, NOW)).toEqual([]);
    expect(allCoordinatesFresh(stops, NOW)).toBe(true);
  });

  it('one stale stop makes the whole route unusable until re-hydrated', () => {
    const stops = [stop('a', coordinate(daysAgo(1))), stop('b', coordinate(daysAgo(31)))];
    expect(allCoordinatesFresh(stops, NOW)).toBe(false);
  });

  it('an empty route trivially has no stale coordinates', () => {
    expect(allCoordinatesFresh([], NOW)).toBe(true);
    expect(placeIdsNeedingRehydration([], NOW)).toEqual([]);
  });
});
