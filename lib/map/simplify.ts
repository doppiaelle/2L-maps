import type { Point } from './projection';

/**
 * Dropping the points a screen cannot show.
 *
 * A Google polyline for Rome to Milan decodes to several thousand coordinates.
 * On a canvas 390 points wide, hundreds of them land inside the same pixel — so
 * the SVG path would carry tens of thousands of characters describing detail
 * that is, quite literally, invisible. On a mid-range Android that is parse time
 * and memory spent on nothing, against a frame budget of 16 ms
 * ([`docs/24_PERFORMANCE.md`](../../docs/24_PERFORMANCE.md)).
 *
 * **Ramer–Douglas–Peucker**, which is the right algorithm because of what it
 * keeps rather than what it removes: it preserves the points that carry the
 * shape — the corner where the route leaves the motorway — and discards the ones
 * along a straight, which is exactly the distinction between a route a driver
 * recognises and a smooth arc that could be anywhere.
 *
 * Run **after** projection, on screen points. Simplifying in degrees would use a
 * tolerance in degrees, which means a different amount of detail at different
 * latitudes and, worse, a different amount at different zooms of the same route.
 * A tolerance in points is a tolerance in what the eye can resolve.
 */

/**
 * How far a point may sit from the line between its neighbours before it is
 * worth drawing, in points.
 *
 * Under half a point at any sane pixel density, so nothing removed here is
 * something the screen could have shown.
 */
export const SIMPLIFY_TOLERANCE = 0.6;

/**
 * The most points Ramer–Douglas–Peucker is ever handed.
 *
 * **The algorithm is O(n²) in the worst case** — a path where every vertex is a
 * corner splits into two subproblems of size n−1 and 1, and does so all the way
 * down. A real road polyline is nowhere near that shape and runs in about
 * n log n, but "nowhere near" is not a guarantee, and the cost of being wrong is
 * a frozen interface on the screen the user just pressed Optimize on. A test
 * with fifty thousand alternating points is what found this, and it did not
 * finish.
 *
 * Above the cap the path is thinned by taking every *k*th point first, which is
 * O(n) and drops the input into the range where the shape-preserving pass is
 * cheap. Even spacing is the wrong tool on its own — it is exactly what throws
 * away the motorway exit — which is why it is a pre-filter and not the answer.
 *
 * **1,500 is chosen against the canvas, not against the data.** A preview about
 * 400 points wide cannot resolve more than a couple of vertices per point of
 * width, so anything beyond this was never going to be visible. It also bounds
 * the pathological case to something a phone can absorb in a frame or two: at
 * four thousand the same worst case took over three seconds on a laptop, which
 * on a mid-range Android is the interface simply stopping.
 */
export const MAX_SIMPLIFY_POINTS = 1_500;

export function simplify(
  points: readonly Point[],
  tolerance: number = SIMPLIFY_TOLERANCE,
): readonly Point[] {
  // Two points are already a line. Three is the smallest case with anything to
  // remove, and the loop below needs both ends to exist.
  if (points.length <= 2) return points;

  const bounded = points.length > MAX_SIMPLIFY_POINTS ? thin(points, MAX_SIMPLIFY_POINTS) : points;

  const keep = new Array<boolean>(bounded.length).fill(false);
  const first = 0;
  const last = bounded.length - 1;
  keep[first] = true;
  keep[last] = true;

  // Iterative rather than recursive: a polyline can be tens of thousands of
  // points long and the worst case for this algorithm is a recursion as deep as
  // the input. A blown stack on a long route is not a hypothetical.
  const pending: [number, number][] = [[first, last]];

  while (pending.length > 0) {
    const segment = pending.pop();
    if (segment === undefined) continue;
    const [start, end] = segment;
    if (end <= start + 1) continue;

    const from = bounded[start];
    const to = bounded[end];
    if (from === undefined || to === undefined) continue;

    let furthest = -1;
    let furthestDistance = tolerance;

    for (let index = start + 1; index < end; index += 1) {
      const point = bounded[index];
      if (point === undefined) continue;
      const distance = perpendicularDistance(point, from, to);
      if (distance > furthestDistance) {
        furthest = index;
        furthestDistance = distance;
      }
    }

    // Nothing in this stretch is far enough from the straight to be worth a
    // vertex, so the whole stretch becomes one.
    if (furthest === -1) continue;

    keep[furthest] = true;
    pending.push([start, furthest], [furthest, end]);
  }

  return bounded.filter((_, index) => keep[index] === true);
}

/**
 * Every *k*th point, both ends kept.
 *
 * A blunt instrument, used only to bring a pathological input into range before
 * the shape-preserving pass runs. Keeping the last point explicitly matters: a
 * stride that does not divide the length evenly would otherwise stop the route
 * short of where it ends.
 */
function thin(points: readonly Point[], limit: number): readonly Point[] {
  const stride = Math.ceil(points.length / limit);
  const thinned: Point[] = [];

  for (let index = 0; index < points.length; index += stride) {
    const point = points[index];
    if (point !== undefined) thinned.push(point);
  }

  const last = points[points.length - 1];
  const kept = thinned[thinned.length - 1];
  if (last !== undefined && kept !== last) thinned.push(last);

  return thinned;
}

/**
 * How far a point sits from the line through two others.
 *
 * The degenerate case matters: when the two ends coincide — a route that
 * returns to where it started, which is every round trip — there is no line to
 * measure against, and the distance to the point itself is the honest answer.
 */
function perpendicularDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);

  return (
    Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) / Math.sqrt(lengthSquared)
  );
}
