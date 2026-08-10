import type { LatLng } from '@/lib/geo/haversine';

/**
 * Turning coordinates into positions on a canvas.
 *
 * The repository has never had a projection: the map SDK owned that, and every
 * geographic function here works in degrees or metres
 * (`lib/map/clustering.ts`, `lib/geo/haversine.ts`). Drawing the route ourselves
 * ([ADR-0021](../../docs/adr/0021-drawn-route-preview.md)) needs one.
 *
 * **Equirectangular, scaled by `cos(latitude)`.** A degree of longitude is
 * shorter than a degree of latitude everywhere except the equator, and by 45° —
 * which is most of Italy — it is about 70% as long. Plotting raw degrees would
 * stretch every route east-to-west by nearly half: a square block of deliveries
 * would draw as a wide rectangle, and the shape a driver is being asked to
 * recognise would not be the shape of their day. Scaling by the cosine of the
 * middle latitude fixes that, and over the extent of one working day the error
 * left is far below a pixel.
 *
 * Web Mercator would be the textbook answer and is the wrong tool here: its
 * whole purpose is to keep angles true across a hemisphere, which costs a
 * latitude-dependent vertical stretch that is visible on a canvas 400 points
 * wide and buys nothing at this scale.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Projection {
  /** Place one coordinate on the canvas. */
  readonly project: (coordinate: LatLng) => Point;
  /** How much of the canvas one degree of latitude covers, after fitting.
   *  Exposed so a caller can size something in real distance if it ever needs
   *  to — a scale bar, a radius. */
  readonly scale: number;
}

/**
 * A projection that fits every coordinate inside the canvas, with room to spare.
 *
 * The padding is where the markers live: a stop drawn exactly on the edge of its
 * own bounding box would have half its pin off the canvas, and the first and
 * last stop of a route are always on that edge.
 *
 * **One scale for both axes.** Fitting width and height independently would fill
 * the canvas more completely and destroy the thing being drawn — a route that
 * runs mostly north would be squashed sideways until it looked like a route that
 * runs in every direction. The shape has to survive, so the tighter of the two
 * scales wins and the slack becomes margin.
 */
export function fitProjection(
  coordinates: readonly LatLng[],
  size: Size,
  padding: number,
): Projection {
  const usableWidth = Math.max(size.width - padding * 2, 1);
  const usableHeight = Math.max(size.height - padding * 2, 1);

  if (coordinates.length === 0) {
    return { project: () => ({ x: size.width / 2, y: size.height / 2 }), scale: 1 };
  }

  const latitudes = coordinates.map((c) => c.latitude);
  const longitudes = coordinates.map((c) => c.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const centreLatitude = (minLatitude + maxLatitude) / 2;
  // Never below a floor: at the poles the cosine reaches zero and every
  // longitude would collapse onto one column. Nobody delivers there, but a
  // divide-by-zero does not care where it happens.
  const longitudeScale = Math.max(Math.cos((centreLatitude * Math.PI) / 180), 0.01);

  const spanLatitude = maxLatitude - minLatitude;
  const spanLongitude = (maxLongitude - minLongitude) * longitudeScale;

  // A single stop, or several at one address, has no extent. Given a span of
  // zero the scale would be infinite; this puts it in the middle at an arbitrary
  // zoom instead, which is the only honest thing to draw.
  const scale =
    spanLatitude <= 0 && spanLongitude <= 0
      ? 1
      : Math.min(
          spanLongitude > 0 ? usableWidth / spanLongitude : Number.POSITIVE_INFINITY,
          spanLatitude > 0 ? usableHeight / spanLatitude : Number.POSITIVE_INFINITY,
        );

  // What the drawing actually occupies once one scale governs both axes, so the
  // slack can be split evenly and the route sits in the middle rather than in a
  // corner.
  const drawnWidth = spanLongitude * scale;
  const drawnHeight = spanLatitude * scale;
  const offsetX = padding + (usableWidth - drawnWidth) / 2;
  const offsetY = padding + (usableHeight - drawnHeight) / 2;

  return {
    scale,
    project: (coordinate) => ({
      x: offsetX + (coordinate.longitude - minLongitude) * longitudeScale * scale,
      // **Inverted.** Latitude grows northward and a canvas's y grows downward;
      // forgetting this draws every route upside down, which looks plausible
      // enough on a symmetric route to survive review.
      y: offsetY + (maxLatitude - coordinate.latitude) * scale,
    }),
  };
}

/**
 * An SVG path through a series of points.
 *
 * Straight segments, deliberately. The points are already the road's own shape
 * where there is one, so smoothing them would round off real corners — and where
 * there is not one, a curve would imply road routing that never happened
 * ([`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../../docs/14_GOOGLE_MAPS_INTEGRATION.md)
 * §T0). The T0 distinction is a correctness requirement, not a style choice, and
 * it is carried by the dash pattern and by drawing each connector separately
 * rather than by the curvature.
 */
export function pathThrough(points: readonly Point[]): string {
  if (points.length === 0) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

/** Two decimals is a hundredth of a point — far below anything a screen can
 *  show, and it keeps a 500-point path from carrying 6,000 characters of
 *  meaningless precision. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
