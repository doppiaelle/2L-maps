import type { Point } from './projection';

/**
 * The town around the route, drawn by us.
 *
 * **These streets are not real, and nothing here pretends otherwise.** They are
 * a plausible grid generated from the route's own shape, so a driver reading the
 * preview sees a road network rather than a line floating in a void. The route,
 * the stops and their order are all true; the scenery is scenery.
 *
 * **Why it is invented rather than fetched**, which is the part worth knowing
 * before anyone is tempted to improve it: the stops and the route geometry are
 * Google-derived, and the Maps Platform terms forbid displaying that content on
 * a surface that is not a Google map — per API, and
 * [ADR-0012](../../docs/adr/0012-long-term-osm-exit-path.md) rejects the hybrid
 * by name: *"Google-derived coordinates cannot be plotted on an OSM map either.
 * You choose one house."* Drawing real OSM roads under a Google route would
 * widen an exposure `CLAUDE.md` §13 rule 5 says not to widen
 * ([ADR-0021](../../docs/adr/0021-drawn-route-preview.md)). Our own drawing adds
 * no third party, no licence, no attribution and no network call.
 *
 * **It is deterministic.** The same route draws the same town every time, on
 * every device, for ever — the seed comes from the route, not from a clock or a
 * random source. Scenery that reshuffled between renders would read as movement
 * and pull the eye away from the only thing on the canvas that means anything.
 *
 * **It decides nothing about the route.** Give it a projected path and a canvas;
 * it returns line segments and rectangles with an opacity each. It never sees a
 * coordinate, a stop or a place id.
 */

/** One stretch of road: two points and how strongly to draw it. */
export interface SceneryRoad {
  readonly id: string;
  readonly from: Point;
  readonly to: Point;
  /** True for the wider, more visible roads that echo the route's own bearing. */
  readonly isArterial: boolean;
  /** 0–1, falling off with distance from the route. */
  readonly opacity: number;
}

/** One block of buildings, as a rectangle. */
export interface SceneryBlock {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
}

export interface Scenery {
  readonly roads: readonly SceneryRoad[];
  readonly blocks: readonly SceneryBlock[];
}

/**
 * How far from the route the scenery survives, as a fraction of the canvas
 * diagonal.
 *
 * The fade is the point: it keeps the eye on the route and it is honest about
 * where our invention is least grounded. Beyond this, nothing is drawn at all —
 * a uniform grid to the canvas edge would read as a real map of a real place.
 */
export const FALLOFF = 0.42;

/**
 * Ceilings, chosen against the frame budget rather than by taste.
 *
 * `CLAUDE.md` §6 allows 16 ms per frame at twenty-five stops. Each road is one
 * SVG `<line>` and each block one `<rect>`; these counts keep the canvas around
 * two hundred nodes, which is the same order as the route path after
 * simplification. They are hard caps, not targets — a denser grid on a large
 * canvas is truncated rather than allowed to grow.
 */
export const MAX_ROADS = 130;
export const MAX_BLOCKS = 80;

/** Spacing between grid lines, in canvas units. Roughly a city block at the
 *  zoom a whole route occupies. */
const CELL = 78;

/** Every fourth line is an arterial — wider and more visible, the way a real
 *  town has a few through-roads among many minor ones. */
const ARTERIAL_EVERY = 4;

export interface SceneryInputs {
  /** The route, already projected into canvas space. Fewer than two points
   *  means there is no shape to orient a town around. */
  readonly path: readonly Point[];
  readonly size: { readonly width: number; readonly height: number };
  /** Anything stable and route-specific. The same seed must draw the same town. */
  readonly seed: string;
}

export function sceneryFor({ path, size, seed }: SceneryInputs): Scenery {
  if (size.width <= 0 || size.height <= 0 || path.length < 2) {
    return { roads: [], blocks: [] };
  }

  const random = seededRandom(seed);
  const angle = dominantBearing(path);
  const diagonal = Math.hypot(size.width, size.height);
  const falloff = diagonal * FALLOFF;

  // The grid is built in a frame rotated onto the route's own direction, so the
  // streets run with and across it the way a town grows along its main road.
  // Everything is generated in that frame and rotated back at the end.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const centre = { x: size.width / 2, y: size.height / 2 };

  const toCanvas = (u: number, v: number): Point => ({
    x: centre.x + u * cos - v * sin,
    y: centre.y + u * sin + v * cos,
  });

  // Wide enough that the rotated grid still covers the corners of the canvas.
  const reach = diagonal / 2 + CELL;
  const lines = Math.floor(reach / CELL);

  const roads: SceneryRoad[] = [];
  const blocks: SceneryBlock[] = [];

  for (let i = -lines; i <= lines && roads.length < MAX_ROADS; i += 1) {
    // Jittered so the grid reads as a town rather than as graph paper. Bounded
    // to a third of a cell: more and streets cross each other at silly angles.
    const offsetAlong = (random() - 0.5) * CELL * 0.34;
    const offsetAcross = (random() - 0.5) * CELL * 0.34;
    const isArterial = Math.abs(i) % ARTERIAL_EVERY === 0;

    // One line with the route, one across it.
    const along = i * CELL + offsetAlong;
    const across = i * CELL + offsetAcross;

    pushRoad(roads, `a${i}`, toCanvas(-reach, along), toCanvas(reach, along), isArterial);
    pushRoad(roads, `c${i}`, toCanvas(across, -reach), toCanvas(across, reach), isArterial);
  }

  // Blocks sit inside the cells, inset so the road grid stays legible between
  // them. Generated on the same jittered lattice so they line up with it.
  const blockLines = Math.min(lines, 8);
  for (let i = -blockLines; i < blockLines && blocks.length < MAX_BLOCKS; i += 1) {
    for (let j = -blockLines; j < blockLines && blocks.length < MAX_BLOCKS; j += 1) {
      // Two cells in five stay empty — a square, a car park, a gap. A fully
      // built lattice reads as a circuit board.
      if (random() < 0.4) continue;

      const inset = CELL * 0.22;
      const u = i * CELL + inset;
      const v = j * CELL + inset;
      const w = CELL - inset * 2;
      const centreOfBlock = toCanvas(u + w / 2, v + w / 2);

      if (!isOnCanvas(centreOfBlock, size)) continue;

      const opacity = fade(distanceToPath(centreOfBlock, path), falloff);
      if (opacity <= 0.02) continue;

      // Axis-aligned on purpose: a rotated rect needs a transform per node, and
      // at this scale a block's own orientation reads as noise rather than as
      // information. The grid carries the bearing; the blocks carry the texture.
      const half = w / 2;
      blocks.push({
        id: `b${i}:${j}`,
        x: centreOfBlock.x - half,
        y: centreOfBlock.y - half,
        width: w,
        height: w,
        opacity,
      });
    }
  }

  return { roads, blocks };

  function pushRoad(
    into: SceneryRoad[],
    id: string,
    from: Point,
    to: Point,
    isArterial: boolean,
  ): void {
    if (into.length >= MAX_ROADS) return;

    // Measured at the midpoint rather than per-endpoint: a road is one SVG node
    // with one opacity, and fading its two halves differently is not something
    // a single `<line>` can express.
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const opacity = fade(distanceToPath(middle, path), falloff);
    if (opacity <= 0.02) return;

    into.push({ id, from, to, isArterial, opacity });
  }
}

/**
 * The direction the route mostly runs in.
 *
 * The straight line from first point to last, not an average of the segments: a
 * route that doubles back would average towards zero and produce a grid at odds
 * with everything on screen. Falls back to level when the two ends coincide,
 * which a round trip does exactly.
 */
export function dominantBearing(path: readonly Point[]): number {
  const first = path[0];
  const last = path[path.length - 1];
  if (first === undefined || last === undefined) return 0;

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (dx === 0 && dy === 0) return 0;

  return Math.atan2(dy, dx);
}

/** Shortest distance from a point to the polyline, in canvas units. */
export function distanceToPath(point: Point, path: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (a === undefined || b === undefined) continue;
    best = Math.min(best, distanceToSegment(point, a, b));
  }

  return best;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Linear falloff, clamped. Squared would vanish too abruptly and leave the
 *  route sitting in a hole; linear reads as haze. */
function fade(distance: number, falloff: number): number {
  if (falloff <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distance / falloff));
}

function isOnCanvas(point: Point, size: { width: number; height: number }): boolean {
  // A margin of one cell, so a block straddling the edge is still drawn and
  // clipped by the SVG rather than disappearing whole.
  return (
    point.x > -CELL &&
    point.x < size.width + CELL &&
    point.y > -CELL &&
    point.y < size.height + CELL
  );
}

/**
 * A deterministic generator seeded from a string.
 *
 * Mulberry32 over an FNV-1a hash of the seed: small, fast, and — the only
 * property that matters here — identical everywhere. `Math.random()` would make
 * the town flicker on every render, which reads as movement on a canvas whose
 * whole job is to hold still.
 */
export function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  let state = hash === 0 ? 0x9e3779b9 : hash;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
