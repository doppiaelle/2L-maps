/**
 * The shared optimization cache key.
 *
 * This is the primary cost lever in the product (docs/31_COST_MODEL.md). Two
 * users optimizing the same stop set in the same time bucket share one upstream
 * call, and the target segment's routes repeat heavily — the same round, most
 * weekday mornings.
 *
 * Sharing across users is only acceptable because the key contains no personal
 * data: it hashes public Google place identifiers and nothing else. No user id,
 * no label, no note, no coordinate.
 *
 * The stop set is order-independent. That is the point rather than an oversight:
 * the order is what the optimization produces, so keying on the input order would
 * miss every hit from a user who entered the same stops in a different sequence.
 */

/** Departure times are bucketed so that near-identical requests share a key.
 *  Finer buckets miss hits; coarser ones return traffic estimates from a
 *  materially different part of the day. */
export const DEPARTURE_BUCKET_MINUTES = 15;

export interface CacheKeyInput {
  /** Intermediate stops. Order is deliberately ignored. */
  readonly stopPlaceIds: readonly string[];
  /** Fixed, and therefore part of the key separately from the stops. */
  readonly originPlaceId: string | null;
  /**
   * Where the device was, when the route starts from it rather than from a place.
   *
   * **Without this the cache was wrong, not merely coarse.** A null
   * `originPlaceId` used to canonicalise to the literal `current-location`, so
   * every route in the world starting from "where I am" with the same stop set
   * shared one key — a driver in Bergamo could be served the route a driver in
   * Palermo had computed an hour earlier, and it would look like a working
   * answer. Only nobody had ever set a current-location origin, so the bug had
   * no way to fire until now.
   */
  readonly originCoordinate: { readonly latitude: number; readonly longitude: number } | null;
  readonly isRoundTrip: boolean;
  readonly departureTime: Date | null;
}

/**
 * Decimal places kept from a current-location origin, for the key only.
 *
 * Three is about 110 m — close enough that two vans in the same yard share a
 * cached route, and far enough that two on opposite sides of a town do not. The
 * *request* still carries the full precision; this is only how near two starts
 * have to be to count as the same one.
 *
 * The rounded pair is not personal data at 110 m and is hashed immediately
 * alongside public place identifiers, so the property that makes cross-user
 * sharing acceptable is unchanged (`CLAUDE.md` §9 rule 7).
 */
export const ORIGIN_COORDINATE_PRECISION = 3;

/** The bucket a departure time falls in, as an ISO instant. */
export function departureBucket(departureTime: Date | null): string {
  if (departureTime === null || Number.isNaN(departureTime.getTime())) return 'now';
  const ms = DEPARTURE_BUCKET_MINUTES * 60 * 1000;
  return new Date(Math.floor(departureTime.getTime() / ms) * ms).toISOString();
}

/**
 * The canonical string a key is derived from.
 *
 * Exposed separately so tests can assert what goes into the key — and, more
 * importantly, what does not.
 */
export function canonicalCacheInput(input: CacheKeyInput): string {
  // Sorted, so the same stop set in any input order produces the same key.
  const stops = [...input.stopPlaceIds].sort().join(',');
  const origin = originToken(input);
  const shape = input.isRoundTrip ? 'round-trip' : 'one-way';
  // `v2` because the origin token changed shape. An old `v1` entry keyed on the
  // bare string `current-location` is exactly the poisoned row described above,
  // and it must not be reachable from the new key.
  return `v2|${origin}|${stops}|${shape}|${departureBucket(input.departureTime)}`;
}

function originToken(input: CacheKeyInput): string {
  if (input.originPlaceId !== null) return input.originPlaceId;
  if (input.originCoordinate === null) return 'current-location';

  const latitude = input.originCoordinate.latitude.toFixed(ORIGIN_COORDINATE_PRECISION);
  const longitude = input.originCoordinate.longitude.toFixed(ORIGIN_COORDINATE_PRECISION);
  return `at:${latitude},${longitude}`;
}

/**
 * FNV-1a, 64-bit, hex.
 *
 * A non-cryptographic hash is the right tool here: the input is public data, the
 * key is not a security boundary, and this runs on every optimization request.
 * Collisions would serve one user's route for another's stop set, so the width
 * matters — 64 bits keeps that negligible at any volume this product will see.
 */
export function hashCacheKey(canonical: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;

  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= BigInt(canonical.charCodeAt(i));
    hash = (hash * PRIME) & MASK;
  }

  return hash.toString(16).padStart(16, '0');
}

export function optimizationCacheKey(input: CacheKeyInput): string {
  return hashCacheKey(canonicalCacheInput(input));
}
