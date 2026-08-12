import { formatDistance, formatDuration } from '@/lib/format/units';

import { toCanvas } from './viewport';

import type { Point } from './projection';
import type { Viewport } from './viewport';

/**
 * Which hop the driver just tapped, and what it says.
 *
 * **The data was always there and nothing showed it.** Every optimization
 * returns a distance, a duration and a polyline *per leg* — the field mask
 * already buys them (`supabase/functions/_shared/upstream/routes.ts`) — and the
 * canvas drew them as one continuous line and threw the rest away. Showing a leg
 * costs no request and no field-mask change, which is the whole reason this is
 * what replaced the summary screen
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
 *
 * The rule lives here rather than in the canvas because "which line did that
 * finger mean" is a decision with a tolerance in it, and a decision with a
 * tolerance is a decision worth testing without a renderer.
 */

/**
 * How far from a leg a tap may land and still count, in points.
 *
 * The drawn line is 5 pt wide, which is far below the 44 pt minimum for a touch
 * target (`CLAUDE.md` §10 rule 2). Twenty-two points either side of the centre
 * gives the line a 44 pt corridor without the driver having to hit a stroke
 * thinner than the stylus nobody has.
 */
export const LEG_TOUCH_RADIUS = 22;

export interface LegHit {
  readonly index: number;
  readonly distance: number;
}

/**
 * The nearest leg to a point, or none within reach.
 *
 * Nearest rather than first: legs cross and double back — a route through a town
 * centre and out again passes the same junction twice — and answering with
 * whichever happened to be earlier in the array would select a leg the driver's
 * finger was nowhere near.
 */
export function legAt(
  point: Point,
  legPaths: readonly (readonly Point[])[],
  radius = LEG_TOUCH_RADIUS,
): number | null {
  let best: LegHit | null = null;

  legPaths.forEach((path, index) => {
    const distance = distanceToPolyline(point, path);
    if (distance === null || distance > radius) return;
    if (best === null || distance < best.distance) best = { index, distance };
  });

  return best === null ? null : (best as LegHit).index;
}

/**
 * The same question, asked from where the finger actually landed.
 *
 * The gesture reports a point on the **container**, which is not transformed;
 * the legs are in canvas coordinates, which are. Doing the inversion here rather
 * than in the component is what makes the direction testable — get it backwards
 * and the wrong hop is selected, which looks entirely plausible on screen and
 * would otherwise only be findable on a device with a zoomed map.
 */
export function legAtScreenPoint(
  screenPoint: Point,
  viewport: Viewport,
  legPaths: readonly (readonly Point[])[],
  radius = LEG_TOUCH_RADIUS,
): number | null {
  return legAt(toCanvas(screenPoint, viewport), legPaths, radius);
}

export interface LegSummary {
  /** `2.4 km · 8 min`. Both already formatted — this module never decides units,
   *  precision or locale, `lib/format/units.ts` does, once. */
  readonly value: string;
  /** What a screen reader says instead. "2.4 km" is read letter by letter by
   *  some of them, and "leg 3 of 11" is the part that gives it a place. */
  readonly spoken: string;
}

/**
 * What the overlay says about one hop.
 *
 * **Only what was measured.** Two numbers, both of them Google's own answer for
 * this segment. No share of the total, no comparison, no "fastest leg" — those
 * would be arithmetic presented as measurement, and this product has just
 * withdrawn one such number rather than estimate it (ADR-0027).
 */
export function legSummary(
  index: number,
  legs: readonly { readonly distanceMeters: number; readonly durationSeconds: number }[],
): LegSummary | null {
  const leg = legs[index];
  if (leg === undefined) return null;

  const distance = formatDistance(leg.distanceMeters, 'en-CA');
  const duration = formatDuration(leg.durationSeconds);

  return {
    value: `${distance} · ${duration}`,
    spoken: `Leg ${index + 1} of ${legs.length}, ${distance}, ${duration}`,
  };
}

/**
 * Distance from a point to a polyline, in the projected plane.
 *
 * Null for a path with nothing to measure against. A single-point path is not an
 * error — a leg whose geometry decoded to one vertex is a hop of a few metres,
 * and it is simply not selectable.
 */
export function distanceToPolyline(point: Point, path: readonly Point[]): number | null {
  if (path.length < 2) return null;

  let nearest = Infinity;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const from = path[i];
    const to = path[i + 1];
    if (from === undefined || to === undefined) continue;
    nearest = Math.min(nearest, distanceToSegment(point, from, to));
  }

  return Number.isFinite(nearest) ? nearest : null;
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a repeated vertex, which the joint-merging in
  // `buildRouteGeometry` mostly removes and Google can still send. Measuring to
  // the point itself is correct and avoids dividing by zero.
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);

  // Clamped, so a tap beyond either end measures to the end rather than to an
  // imaginary extension of the line.
  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  );

  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}
