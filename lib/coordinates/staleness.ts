import { COORDINATE_MAX_AGE_DAYS, type CoordinateCache, type Stop } from '@/types';

/**
 * Coordinate expiry.
 *
 * Google's terms allow `place_id` to be stored indefinitely but latitude and
 * longitude for at most 30 consecutive days (ADR-0007). Exceeding that is a
 * terms breach, not a stale cache — which is why this module treats the boundary
 * as hard and why every coordinate in the system is nullable.
 *
 * The clock is always injected. A device with a wrong clock must not be able to
 * extend the window, and a test must be able to sit exactly on day 30 without
 * waiting a month (CLAUDE.md §5: mock the clock, never the function under test).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days elapsed between two instants. Fractional days round down, so a
 *  coordinate refreshed 30.9 days ago is 30 days old, not 31. */
export function ageInDays(refreshedAt: string, now: Date): number {
  const refreshed = Date.parse(refreshedAt);
  if (Number.isNaN(refreshed)) {
    // An unparseable timestamp is treated as maximally old. Failing closed is the
    // only safe direction: the alternative is serving a coordinate we cannot date.
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor((now.getTime() - refreshed) / MS_PER_DAY);
}

/**
 * Whether a cached coordinate may still be used.
 *
 * Day 30 is still usable; day 31 is not. The boundary is inclusive because the
 * terms permit 30 consecutive days of storage, and the tests sit on 29, 30 and 31
 * precisely so an off-by-one here cannot ship.
 *
 * A coordinate dated in the future is rejected: it means a clock problem
 * somewhere, and trusting it would extend the window past what the terms allow.
 */
export function isCoordinateFresh(coordinate: CoordinateCache | null, now: Date): boolean {
  if (coordinate === null) return false;
  const age = ageInDays(coordinate.refreshedAt, now);
  if (age < 0) return false;
  return age <= COORDINATE_MAX_AGE_DAYS;
}

/** A coordinate that exists but may no longer be used. This is the case that
 *  needs re-hydration from `place_id`, as distinct from one never fetched. */
export function isCoordinateExpired(coordinate: CoordinateCache | null, now: Date): boolean {
  return coordinate !== null && !isCoordinateFresh(coordinate, now);
}

/**
 * The `place_id`s whose coordinates must be re-hydrated before the route can be
 * used, deduplicated.
 *
 * Callers batch this into a single request rather than fetching per stop:
 * twenty-five sequential Place Details calls take seconds and cost twenty-five
 * times as much (docs/24_PERFORMANCE.md).
 */
export function placeIdsNeedingRehydration(stops: readonly Stop[], now: Date): readonly string[] {
  const needed = new Set<string>();
  for (const stop of stops) {
    if (!isCoordinateFresh(stop.coordinate, now)) {
      needed.add(stop.placeId);
    }
  }
  return [...needed];
}

/** Whether every stop carries a usable coordinate. Optimization and handoff both
 *  require this, and both must re-hydrate rather than guess when it is false. */
export function allCoordinatesFresh(stops: readonly Stop[], now: Date): boolean {
  return stops.every((stop) => isCoordinateFresh(stop.coordinate, now));
}
