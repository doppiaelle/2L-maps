import type { LatLng } from '@/lib/geo/haversine';
import type { RouteGeometry } from '@/lib/providers/types';
import { decodePolyline } from '@/lib/routing/polyline';
import type { OptimizationResult } from '@/types';

/**
 * Turning an optimization result into the thing the map draws.
 *
 * Two rules from [`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../../docs/14_GOOGLE_MAPS_INTEGRATION.md)
 * §8 are enforced here rather than inside the map component, because both are
 * correctness rules and a component is the wrong place to keep one.
 *
 * **Decoding happens once, at receipt.** Not per render. A 25-stop polyline is
 * long enough that decoding it on every frame is the most common cause of jank
 * in this class of app (docs/24_PERFORMANCE.md).
 *
 * **A T0 result is never drawn as a road-following line.** It has an order and no
 * road geometry, so it is drawn as straight connectors in a visually distinct
 * style. Drawing it smoothly would claim road routing that did not happen
 * ([`docs/15_ROUTE_OPTIMIZATION.md`](../../docs/15_ROUTE_OPTIMIZATION.md)) — a
 * lie about how the route was computed, not a style preference.
 */

/** Two consecutive stops, for a degraded route. Carries an id so React can key
 *  the segment on the pair rather than on its index in a list that reorders. */
export interface RouteSegment {
  readonly id: string;
  readonly from: LatLng;
  readonly to: LatLng;
}

/**
 * What to draw for the route, if anything.
 *
 * `none` carries its reason: `undecodable` is a defect worth logging, whereas
 * `no-route` and `too-few-stops` are ordinary states of a route not yet built.
 * A single `null` would collapse the three and the defect would never surface.
 */
export type DrawnRoute =
  | {
      readonly kind: 'road';
      readonly path: readonly LatLng[];
      /** The same line, kept per hop, so a tap can be answered with the distance
       *  and duration Google measured for that segment
       *  ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
       *  `legPaths[i]` belongs to `RouteGeometry.legs[i]`. */
      readonly legPaths: readonly (readonly LatLng[])[];
    }
  | { readonly kind: 'connectors'; readonly segments: readonly RouteSegment[] }
  | {
      readonly kind: 'none';
      readonly reason: 'no-route' | 'too-few-stops' | 'undecodable';
    };

/** A stop as the map needs it: where it is, or that we do not know. */
export interface PositionedStop {
  readonly stopId: string;
  readonly coordinate: LatLng | null;
}

/**
 * Build the memoisable geometry from a result.
 *
 * Called once, when the result arrives. The output is what a component holds; it
 * never holds the encoded string.
 */
export function buildRouteGeometry(result: OptimizationResult): RouteGeometry {
  if (result.isDegraded) {
    // A T0 result has no legs and no polyline — it is an ordering, nothing more.
    // Returning empty arrays rather than a partially shaped object keeps the
    // caller from having to ask which fields a degraded result populates.
    return { legs: [], decodedPolyline: [], legPaths: [], isDegraded: true };
  }

  // Decoded once, kept twice. The joined line is what gets drawn; the per-leg
  // paths are what a tap is answered from, and re-decoding for the second use
  // would double the most expensive thing this function does.
  const legPaths = result.legs.map((leg) => decodePolyline(leg.polyline));

  return {
    legs: result.legs,
    decodedPolyline: joinLegPaths(legPaths),
    legPaths,
    isDegraded: false,
  };
}

/**
 * Concatenate per-leg paths into one.
 *
 * Each leg ends where the next begins, so the joint coordinate arrives twice.
 * Duplicated vertices are invisible on a solid line and visible on a dashed one
 * — the dash phase restarts — so they are dropped here rather than left for the
 * renderer to survive.
 */
function joinLegPaths(paths: readonly (readonly LatLng[])[]): readonly LatLng[] {
  const joined: LatLng[] = [];

  for (const path of paths) {
    for (const point of path) {
      const previous = joined[joined.length - 1];
      if (previous !== undefined && isSamePoint(previous, point)) continue;
      joined.push(point);
    }
  }

  return joined;
}

/** Roughly 0.1 m at the equator, which is below the 1e-5 precision the encoding
 *  itself carries — so this only ever merges points that were meant to be one. */
const JOINT_EPSILON = 1e-6;

function isSamePoint(a: LatLng, b: LatLng): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < JOINT_EPSILON &&
    Math.abs(a.longitude - b.longitude) < JOINT_EPSILON
  );
}

/**
 * Decide what the map draws for this route.
 *
 * `orderedStops` is in visiting order and may contain stops whose coordinate has
 * expired (ADR-0007). Those are skipped for drawing — the connector runs between
 * the stops we can place — and the stop itself is still reported by the marker
 * plan, so nothing disappears without being named.
 */
export function planRoute(
  geometry: RouteGeometry | null,
  orderedStops: readonly PositionedStop[],
): DrawnRoute {
  if (geometry === null) return { kind: 'none', reason: 'no-route' };

  if (geometry.isDegraded) return connectorsThrough(orderedStops);

  // A road route whose geometry would not decode. The documented behaviour is
  // markers only, logged as a defect (docs/09_COMPONENT_LIBRARY.md §Errors) —
  // deliberately *not* a fall back to connectors, because connectors are how a
  // T0 result is shown and drawing them here would relabel a road route as a
  // degraded one.
  if (geometry.decodedPolyline.length < 2) return { kind: 'none', reason: 'undecodable' };

  return { kind: 'road', path: geometry.decodedPolyline, legPaths: geometry.legPaths };
}

/**
 * Straight segments between consecutive stops, in the order given.
 *
 * Two callers, and they mean different things by it. A **T0 result** draws these
 * because that is all it has — an ordering with no road geometry — and the
 * canvas renders them in the degraded style so nobody mistakes them for roads.
 * The **waiting face** draws them because the stops are all that exists yet, and
 * renders them faint and neutral, claiming nothing at all
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
 *
 * Shared rather than duplicated because the geometry is genuinely the same
 * question — which pairs of placeable stops are consecutive — and what differs
 * is only what the drawing asserts about them.
 *
 * Stops that cannot be placed are skipped rather than breaking the chain: the
 * line runs past them and the marker plan still reports them, so nothing
 * disappears without being named.
 */
export function connectorsThrough(orderedStops: readonly PositionedStop[]): DrawnRoute {
  const placed = orderedStops.filter(
    (stop): stop is PositionedStop & { coordinate: LatLng } => stop.coordinate !== null,
  );
  if (placed.length < 2) return { kind: 'none', reason: 'too-few-stops' };

  const segments: RouteSegment[] = [];
  for (let i = 0; i + 1 < placed.length; i += 1) {
    const from = placed[i];
    const to = placed[i + 1];
    if (from === undefined || to === undefined) continue;
    segments.push({
      id: `${from.stopId}→${to.stopId}`,
      from: from.coordinate,
      to: to.coordinate,
    });
  }
  return { kind: 'connectors', segments };
}

/**
 * Every coordinate the camera should fit.
 *
 * The route line, not only the stops: a road route can bulge well outside the
 * box its stops describe — a motorway ring around a city is the everyday case —
 * and fitting the stops alone crops it.
 */
export function coordinatesToFit(
  drawn: DrawnRoute,
  stops: readonly PositionedStop[],
): readonly LatLng[] {
  const fromStops = stops
    .map((stop) => stop.coordinate)
    .filter((coordinate): coordinate is LatLng => coordinate !== null);

  if (drawn.kind === 'road') return [...fromStops, ...drawn.path];
  return fromStops;
}
