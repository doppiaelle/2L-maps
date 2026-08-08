/**
 * Great-circle distance.
 *
 * This is the metric the T0 local heuristic runs on, and its limitation is the
 * reason T0 exists only up to 8 stops: it ignores the road network, one-way
 * systems, turn restrictions and traffic entirely. In a city centre a
 * straight-line-optimal order can be materially worse than the user's own guess
 * (docs/15_ROUTE_OPTIMIZATION.md §T0).
 *
 * It is used for ordering only, never for a distance shown to the user. A
 * straight-line figure presented as a driving distance would be wrong by a
 * factor that varies with the city.
 */

/** Mean Earth radius in metres, IUGG. */
const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface LatLng {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Great-circle distance between two points, in metres.
 *
 * Uses the haversine form, which stays numerically stable for the small
 * separations this product deals with — the law-of-cosines form loses precision
 * below roughly a kilometre, and stops in the same neighbourhood are the normal
 * case here.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLng = Math.sin(dLng / 2);

  const h = sinHalfDLat * sinHalfDLat + Math.cos(latA) * Math.cos(latB) * sinHalfDLng * sinHalfDLng;

  // Math.min guards against h drifting a hair above 1 through rounding, which
  // would make Math.sqrt(1 - h) return NaN for two identical points.
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Total length of a tour visiting `points` in the given order.
 *
 * `closed` adds the return leg to the first point, which is what a round trip
 * needs: comparing an open tour against a closed one would systematically favour
 * orders that end far from the origin (docs/15_ROUTE_OPTIMIZATION.md §Behaviour).
 */
export function tourLengthMeters(points: readonly LatLng[], closed: boolean): number {
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (from === undefined || to === undefined) continue;
    total += haversineMeters(from, to);
  }

  if (closed) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first !== undefined && last !== undefined) {
      total += haversineMeters(last, first);
    }
  }

  return total;
}
