import land from '@/assets/geo/land.json';

import { pathThrough } from './projection';
import { SCENERY_MAX_SPAN_METRES } from './scenery';

import type { LatLng } from '@/lib/geo/haversine';
import type { Point, Projection } from './projection';

/**
 * The shape of the ground, at the scale where there is nothing else to draw.
 *
 * **The wide view was empty and it should not have been.** Four stops spanning
 * Italy leave a canvas with a mint line and a few pins on a flat rectangle: no
 * coast, no sea, nothing that says *where*. The invented town cannot help — its
 * streets are a lie above sixty kilometres (`lib/map/scenery.ts`) — so the two
 * take turns: streets below that span, coastline above it, and never both.
 *
 * **The geometry is not Google's, and that is the point and the cost.** Natural
 * Earth's 1:110m land polygons are public domain, bundled, and never fetched, so
 * this adds no network call, no tile, and no licence to honour. What it does add
 * is Google-derived stops drawn on top of somebody else's geometry, which is the
 * hybrid [ADR-0012](../../docs/adr/0012-long-term-osm-exit-path.md) rejects by
 * name. The product owner chose it with the risk stated, and
 * [ADR-0028](../../docs/adr/0028-a-coastline-under-the-route.md) records both.
 *
 * **It draws outlines, not a map.** No borders, no roads, no names, no lakes:
 * one shape per landmass, at a resolution where Italy is a boot and nothing
 * smaller than a large island survives. Anything finer would start to look like
 * a map service, and would be claiming detail this has no way to have.
 */

/**
 * `[longitude, latitude]`, as the generated asset stores them — the same numbers
 * as an object pair at a third of the bytes.
 *
 * Typed as an array rather than a tuple because that is what a JSON import
 * genuinely is, and narrowing it would need an assertion this file has no
 * grounds for (`CLAUDE.md` §3). Every read below checks the pair instead, which
 * costs a comparison and is true.
 */
type Ring = readonly (readonly number[])[];

interface LandmassAsset {
  readonly tolerance: number;
  readonly rings: readonly Ring[];
}

const BUNDLED: LandmassAsset = land;

export interface Bounds {
  readonly minLatitude: number;
  readonly maxLatitude: number;
  readonly minLongitude: number;
  readonly maxLongitude: number;
}

export interface LandmassInputs {
  readonly projection: Projection;
  readonly size: { readonly width: number; readonly height: number };
  /** From `metresPerPoint`. Below the scenery's own ceiling this returns
   *  nothing: the town is drawn there instead, and two backgrounds at once is
   *  one too many. */
  readonly metresPerPoint: number;
  /** Injected so the rules are testable against a handful of rings rather than
   *  against the whole world. Defaults to the bundled asset. */
  readonly rings?: readonly Ring[];
}

/** One landmass, as an SVG path. */
export interface LandmassShape {
  readonly id: string;
  readonly d: string;
}

export function landmassFor({
  projection,
  size,
  metresPerPoint,
  rings = BUNDLED.rings,
}: LandmassInputs): readonly LandmassShape[] {
  if (size.width <= 0 || size.height <= 0) return [];

  // Below this the invented town has the canvas. Drawing both would put a
  // coastline under streets that are not on it.
  const diagonal = Math.hypot(size.width, size.height);
  if (diagonal * metresPerPoint <= SCENERY_MAX_SPAN_METRES) return [];

  const view = visibleBounds(projection, size);

  const shapes: LandmassShape[] = [];
  rings.forEach((ring, index) => {
    // Cheap rejection first. Most of the world is off screen for any route, and
    // projecting four and a half thousand points to discover that would be the
    // most expensive thing this canvas does (`CLAUDE.md` §6).
    if (!intersects(boundsOf(ring), view)) return;

    const projected: Point[] = [];
    for (const pair of ring) {
      const longitude = pair[0];
      const latitude = pair[1];
      if (longitude === undefined || latitude === undefined) continue;
      projected.push(projection.project({ latitude, longitude }));
    }

    // A ring needs three corners to enclose anything. Fewer renders as a stray
    // line across the sea rather than as land.
    if (projected.length < 3) return;

    // Closed explicitly: an SVG path left open renders as a stroke around a
    // coastline rather than as filled land.
    shapes.push({ id: `land-${String(index)}`, d: `${pathThrough(projected)} Z` });
  });

  return shapes;
}

/**
 * What part of the world the canvas is actually looking at.
 *
 * The canvas is always larger than the stops it fits — the projection keeps a
 * margin so no pin hangs off the edge — so this asks the projection rather than
 * the route. The corners are enough: the projection is affine, so no interior
 * point lies outside the box its corners describe.
 */
export function visibleBounds(
  projection: Projection,
  size: { readonly width: number; readonly height: number },
): Bounds {
  const corners: LatLng[] = [
    projection.unproject({ x: 0, y: 0 }),
    projection.unproject({ x: size.width, y: size.height }),
  ];

  const latitudes = corners.map((corner) => corner.latitude);
  const longitudes = corners.map((corner) => corner.longitude);

  return {
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
  };
}

function boundsOf(ring: Ring): Bounds {
  let minLatitude = Infinity;
  let maxLatitude = -Infinity;
  let minLongitude = Infinity;
  let maxLongitude = -Infinity;

  for (const pair of ring) {
    const longitude = pair[0];
    const latitude = pair[1];
    if (longitude === undefined || latitude === undefined) continue;

    if (latitude < minLatitude) minLatitude = latitude;
    if (latitude > maxLatitude) maxLatitude = latitude;
    if (longitude < minLongitude) minLongitude = longitude;
    if (longitude > maxLongitude) maxLongitude = longitude;
  }

  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}

/**
 * Whether two boxes overlap at all.
 *
 * Touching counts. A landmass whose edge is exactly the canvas edge is one whose
 * coast is on screen, and rejecting it would leave a sliver of sea where the
 * shore should be.
 */
function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.minLatitude <= b.maxLatitude &&
    a.maxLatitude >= b.minLatitude &&
    a.minLongitude <= b.maxLongitude &&
    a.maxLongitude >= b.minLongitude
  );
}

/** Re-exported so a test can state the tolerance the asset was built at without
 *  reaching into the JSON, and so a reviewer can see it changed. */
export const LANDMASS_TOLERANCE_DEGREES = BUNDLED.tolerance;

export type { Point };
