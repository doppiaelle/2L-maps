import { haversineMeters, type LatLng } from '@/lib/geo/haversine';
import { MARKER_CLUSTER_THRESHOLD } from '@/types';

/**
 * Deciding what the map draws, as a pure function.
 *
 * Above `MARKER_CLUSTER_THRESHOLD` markers, clustering is mandatory to hold
 * 60 fps ([`docs/24_PERFORMANCE.md`](../../docs/24_PERFORMANCE.md)). Putting that
 * decision here rather than inside the map component means it can be tested
 * without a renderer, and means the threshold cannot quietly become "whatever
 * the component happened to do".
 *
 * The grouping is a grid over the visible region rather than a distance-based
 * clustering pass. That is deliberate: a grid is O(n) with no sorting, runs in
 * well under a frame at 25 markers, and — more importantly — is *stable*. A
 * distance-based clusterer re-partitions as the camera moves, so markers appear
 * to jump between groups during a pan, which reads as the map being broken.
 */

export interface MarkerInput {
  readonly stopId: string;
  readonly position: number;
  /** Null once the 30-day coordinate cache has expired (ADR-0007). A stop
   *  without one cannot be drawn, and is reported rather than dropped. */
  readonly coordinate: LatLng | null;
  readonly state: 'pending' | 'completed' | 'skipped' | 'unreachable';
}

export interface DrawnMarker {
  readonly kind: 'marker';
  readonly stopId: string;
  readonly position: number;
  readonly coordinate: LatLng;
  readonly state: MarkerInput['state'];
}

export interface DrawnCluster {
  readonly kind: 'cluster';
  /** Stable across camera moves at the same zoom, so React can keep the node. */
  readonly id: string;
  readonly coordinate: LatLng;
  readonly count: number;
  readonly stopIds: readonly string[];
  /** True when any stop inside is unreachable, so the cluster can carry the
   *  warning rather than hiding it until the user zooms in. */
  readonly hasUnreachable: boolean;
}

export type DrawnPin = DrawnMarker | DrawnCluster;

export interface MapPlan {
  readonly pins: readonly DrawnPin[];
  /** Stops that cannot be drawn at all. Named so the screen can say which ones,
   *  rather than the user counting pins and finding one short. */
  readonly undrawableStopIds: readonly string[];
  readonly isClustered: boolean;
}

export interface Viewport {
  readonly northEast: LatLng;
  readonly southWest: LatLng;
}

/**
 * How many grid cells across the viewport is divided.
 *
 * Six is chosen so that at the cluster threshold the grid is coarse enough to
 * actually merge things — a grid finer than the marker count clusters nothing
 * and costs a pass for no benefit.
 */
export const GRID_DIVISIONS = 6;

export interface PlanOptions {
  /** Never hidden inside a cluster (docs/14_GOOGLE_MAPS_INTEGRATION.md §7). The
   *  user selected it; a map that answers by folding it away has not answered. */
  readonly selectedStopId?: string | null;
  readonly threshold?: number;
}

export function planMarkers(
  markers: readonly MarkerInput[],
  viewport: Viewport,
  options: PlanOptions = {},
): MapPlan {
  const { selectedStopId = null, threshold = MARKER_CLUSTER_THRESHOLD } = options;

  const drawable: DrawnMarker[] = [];
  const undrawableStopIds: string[] = [];

  for (const marker of markers) {
    if (marker.coordinate === null) {
      undrawableStopIds.push(marker.stopId);
      continue;
    }
    drawable.push({
      kind: 'marker',
      stopId: marker.stopId,
      position: marker.position,
      coordinate: marker.coordinate,
      state: marker.state,
    });
  }

  // At or below the threshold, every stop is its own pin. The ordinal is what
  // the user reads while driving, and a cluster hides it.
  if (drawable.length <= threshold) {
    return { pins: drawable, undrawableStopIds, isClustered: false };
  }

  // The selected stop is drawn individually, whatever the count. It is held out
  // of the grid entirely rather than pulled back out afterwards, so it also
  // cannot be the marker that keeps a cell above one and forces a cluster to
  // exist around it. It is appended last, which is also its raised z-index: the
  // map SDK draws in array order, so last is on top.
  const selected = drawable.find((m) => m.stopId === selectedStopId);
  const clusterable = selected === undefined ? drawable : drawable.filter((m) => m !== selected);

  const pins = cluster(clusterable, viewport);
  return {
    pins: selected === undefined ? pins : [...pins, selected],
    undrawableStopIds,
    isClustered: true,
  };
}

function cluster(markers: readonly DrawnMarker[], viewport: Viewport): readonly DrawnPin[] {
  const latSpan = viewport.northEast.latitude - viewport.southWest.latitude;
  const lngSpan = viewport.northEast.longitude - viewport.southWest.longitude;

  // A degenerate viewport — zero span, which happens on the first frame before
  // the camera has settled — would divide by zero. Every marker into one cell
  // is the honest answer for "we do not know where the camera is yet".
  if (latSpan <= 0 || lngSpan <= 0) {
    return [buildCluster(markers, '0:0')];
  }

  const cells = new Map<string, DrawnMarker[]>();
  for (const marker of markers) {
    const row = Math.min(
      GRID_DIVISIONS - 1,
      Math.max(
        0,
        Math.floor(
          ((marker.coordinate.latitude - viewport.southWest.latitude) / latSpan) * GRID_DIVISIONS,
        ),
      ),
    );
    const column = Math.min(
      GRID_DIVISIONS - 1,
      Math.max(
        0,
        Math.floor(
          ((marker.coordinate.longitude - viewport.southWest.longitude) / lngSpan) * GRID_DIVISIONS,
        ),
      ),
    );

    const key = `${row}:${column}`;
    const existing = cells.get(key);
    if (existing === undefined) cells.set(key, [marker]);
    else existing.push(marker);
  }

  const pins: DrawnPin[] = [];
  for (const [key, group] of cells) {
    // A cell holding one marker stays a marker. Rendering a "1" badge is worse
    // than the pin it replaces: it costs the ordinal and gains nothing.
    const single = group[0];
    if (group.length === 1 && single !== undefined) {
      pins.push(single);
      continue;
    }
    pins.push(buildCluster(group, key));
  }

  // Sorted so the render order is stable across camera moves — React keys stay
  // matched and the map does not re-mount pins that did not change.
  return pins.sort((a, b) => idOf(a).localeCompare(idOf(b)));
}

function buildCluster(group: readonly DrawnMarker[], key: string): DrawnCluster {
  return {
    kind: 'cluster',
    id: `cluster:${key}`,
    coordinate: centroid(group.map((m) => m.coordinate)),
    count: group.length,
    stopIds: group.map((m) => m.stopId),
    // Carried up, so a problem is visible at the zoom level the user is at
    // rather than only after they zoom in looking for it.
    hasUnreachable: group.some((m) => m.state === 'unreachable'),
  };
}

const idOf = (pin: DrawnPin): string => (pin.kind === 'cluster' ? pin.id : pin.stopId);

/**
 * The arithmetic mean, which is right for a city-scale cluster and wrong near
 * the antimeridian.
 *
 * Named rather than hidden: this product's routes are one driver's working day,
 * so a cluster spanning ±180° would mean a route from Alaska to Siberia. If that
 * ever becomes real the fix is spherical averaging, not a wider comment.
 */
function centroid(points: readonly LatLng[]): LatLng {
  const total = points.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
}

/**
 * The bounds that fit a set of stops, with the sheet accounted for.
 *
 * The sheet covers the lower part of the screen, so a naive fit centres the
 * route behind it and the user sees the top third of their own day. The padding
 * is applied as extra span at the south edge, which is where the sheet is.
 */
export function boundsFor(coordinates: readonly LatLng[], sheetFraction = 0.4): Viewport | null {
  if (coordinates.length === 0) return null;

  const lats = coordinates.map((c) => c.latitude);
  const lngs = coordinates.map((c) => c.longitude);

  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);

  // A single stop has zero span, and a zero-span viewport is not a viewport.
  // Roughly 500 m either way puts one pin in context rather than filling the
  // screen with a building.
  const latSpan = Math.max(north - south, 0.009);
  const lngSpan = Math.max(east - west, 0.009);

  return {
    northEast: { latitude: north + latSpan * 0.1, longitude: east + lngSpan * 0.1 },
    southWest: {
      latitude: south - latSpan * (0.1 + sheetFraction),
      longitude: west - lngSpan * 0.1,
    },
  };
}

/**
 * Centre and span, which is how a map SDK expresses where the camera is.
 *
 * Converted at the boundary rather than carried around, so nothing above the
 * facade has to remember that a delta is the *whole* span and not half of it —
 * the mistake that halves every viewport and clusters everything into one pin.
 */
export interface CameraRegion {
  readonly latitude: number;
  readonly longitude: number;
  readonly latitudeDelta: number;
  readonly longitudeDelta: number;
}

export function regionToViewport(region: CameraRegion): Viewport {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return {
    northEast: { latitude: region.latitude + halfLat, longitude: region.longitude + halfLng },
    southWest: { latitude: region.latitude - halfLat, longitude: region.longitude - halfLng },
  };
}

export function viewportToRegion(viewport: Viewport): CameraRegion {
  return {
    latitude: (viewport.northEast.latitude + viewport.southWest.latitude) / 2,
    longitude: (viewport.northEast.longitude + viewport.southWest.longitude) / 2,
    latitudeDelta: viewport.northEast.latitude - viewport.southWest.latitude,
    longitudeDelta: viewport.northEast.longitude - viewport.southWest.longitude,
  };
}

/** Whether two stops are close enough that their pins would overlap at this
 *  zoom. Used to decide whether a label can be shown beside a pin. */
export function overlapsAtScale(a: LatLng, b: LatLng, metresPerPixel: number): boolean {
  const PIN_DIAMETER_PX = 32;
  return haversineMeters(a, b) < PIN_DIAMETER_PX * metresPerPixel;
}
