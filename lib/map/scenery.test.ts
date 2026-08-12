import {
  distanceToPath,
  dominantBearing,
  FALLOFF,
  MAX_BLOCKS,
  MAX_ROADS,
  SCENERY_MAX_SPAN_METRES,
  sceneryFor,
  seededRandom,
} from './scenery';
import type { Point } from './projection';

/**
 * The invented town.
 *
 * Two properties carry this file. **It must be identical every time** — scenery
 * that reshuffles between renders reads as movement on a canvas whose only job
 * is to hold still, and the route is the one thing on it that means anything.
 * And **it must stay inside the frame budget** — every road is an SVG node, and
 * a grid that grows with the canvas would blow the sixteen milliseconds
 * `CLAUDE.md` §6 allows at twenty-five stops.
 *
 * What it deliberately does *not* test is realism. These streets are invented
 * and the code says so; asserting they resemble a real place would be asserting
 * something untrue.
 */

const canvas = { width: 390, height: 640 };

const diagonalPath: readonly Point[] = [
  { x: 60, y: 560 },
  { x: 180, y: 380 },
  { x: 330, y: 90 },
];

describe('the same route draws the same town', () => {
  it('is identical across calls with the same seed', () => {
    const a = sceneryFor({ path: diagonalPath, size: canvas, seed: 'route-7' });
    const b = sceneryFor({ path: diagonalPath, size: canvas, seed: 'route-7' });

    expect(a).toEqual(b);
  });

  it('draws a different town for a different route', () => {
    // Otherwise every route in the app looks like the same place.
    const a = sceneryFor({ path: diagonalPath, size: canvas, seed: 'route-7' });
    const b = sceneryFor({ path: diagonalPath, size: canvas, seed: 'route-8' });

    expect(a).not.toEqual(b);
  });

  it('never consults a clock or a random source', () => {
    // The generator is seeded, so two runs separated in time agree. A
    // `Math.random()` anywhere in here would fail this.
    const before = sceneryFor({ path: diagonalPath, size: canvas, seed: 's' });
    jest.spyOn(Date, 'now').mockReturnValue(9_999_999_999);
    const after = sceneryFor({ path: diagonalPath, size: canvas, seed: 's' });
    jest.restoreAllMocks();

    expect(after).toEqual(before);
  });

  it('produces a repeatable sequence from a seed', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('produces values inside the unit interval', () => {
    const next = seededRandom('bounds');
    for (let i = 0; i < 500; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('the frame budget', () => {
  it('caps the node count however large the canvas', () => {
    // A grid that grew with the canvas would put thousands of SVG nodes on a
    // tablet and miss 60fps by an order of magnitude.
    const scenery = sceneryFor({
      path: [
        { x: 0, y: 0 },
        { x: 4000, y: 3000 },
      ],
      size: { width: 4000, height: 3000 },
      seed: 'huge',
    });

    expect(scenery.roads.length).toBeLessThanOrEqual(MAX_ROADS);
    expect(scenery.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });

  it('completes a full-size canvas quickly', () => {
    const started = Date.now();
    for (let i = 0; i < 50; i += 1) {
      sceneryFor({ path: diagonalPath, size: canvas, seed: `r${i}` });
    }
    // Fifty towns well inside a second. The real budget is one per route, so
    // this is generous by design — it catches an accidental O(n²) rather than
    // policing milliseconds.
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('it fades away from the route', () => {
  it('draws nothing at full strength far from the line', () => {
    const scenery = sceneryFor({ path: diagonalPath, size: canvas, seed: 'fade' });
    const falloff = Math.hypot(canvas.width, canvas.height) * FALLOFF;

    for (const road of scenery.roads) {
      const middle = {
        x: (road.from.x + road.to.x) / 2,
        y: (road.from.y + road.to.y) / 2,
      };
      const distance = distanceToPath(middle, diagonalPath);
      // The nearer of two roads is never the fainter one.
      expect(road.opacity).toBeLessThanOrEqual(1);
      if (distance > falloff) {
        throw new Error('a road beyond the falloff should not have been emitted');
      }
    }
  });

  it('is strongest on the route and weakest at the edge of its reach', () => {
    const scenery = sceneryFor({ path: diagonalPath, size: canvas, seed: 'fade' });
    const withDistance = scenery.roads.map((road) => ({
      opacity: road.opacity,
      distance: distanceToPath(
        { x: (road.from.x + road.to.x) / 2, y: (road.from.y + road.to.y) / 2 },
        diagonalPath,
      ),
    }));

    const nearest = withDistance.reduce((a, b) => (a.distance < b.distance ? a : b));
    const farthest = withDistance.reduce((a, b) => (a.distance > b.distance ? a : b));

    expect(nearest.opacity).toBeGreaterThan(farthest.opacity);
  });

  it('emits nothing invisible', () => {
    // A node drawn at zero opacity costs exactly as much as a visible one.
    const scenery = sceneryFor({ path: diagonalPath, size: canvas, seed: 'fade' });
    for (const road of scenery.roads) expect(road.opacity).toBeGreaterThan(0.02);
    for (const block of scenery.blocks) expect(block.opacity).toBeGreaterThan(0.02);
  });
});

describe('the grid follows the route', () => {
  it('takes its bearing from where the route starts and ends', () => {
    expect(
      dominantBearing([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBeCloseTo(0);

    expect(
      dominantBearing([
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBeCloseTo(Math.PI / 2);
  });

  it('ignores a detour rather than averaging it away', () => {
    // A route that doubles back would average towards zero and produce a grid
    // at odds with everything on screen.
    const bearing = dominantBearing([
      { x: 0, y: 0 },
      { x: 50, y: 200 },
      { x: 0, y: 400 },
      { x: 100, y: 0 },
    ]);
    expect(bearing).toBeCloseTo(Math.atan2(0, 100));
  });

  it('is level for a round trip, which ends where it began', () => {
    expect(
      dominantBearing([
        { x: 5, y: 5 },
        { x: 90, y: 40 },
        { x: 5, y: 5 },
      ]),
    ).toBe(0);
  });

  it('draws both arterials and minor roads', () => {
    // A grid of one weight is graph paper; a real town has a few through-roads
    // among many small ones.
    const scenery = sceneryFor({ path: diagonalPath, size: canvas, seed: 'weights' });
    expect(scenery.roads.some((r) => r.isArterial)).toBe(true);
    expect(scenery.roads.some((r) => !r.isArterial)).toBe(true);
  });

  it('builds urban contents inside route-conditioned blocks', () => {
    const scenery = sceneryFor({ path: diagonalPath, size: canvas, seed: 'urban-graph' });
    expect(scenery.blocks.length).toBeGreaterThan(0);
    expect(scenery.areas.some((area) => area.kind === 'building')).toBe(true);

    for (const area of scenery.areas) {
      const block = scenery.blocks.find((candidate) => candidate.id === area.blockId);
      expect(block).toBeDefined();
      if (block === undefined) continue;
      expect(area.x).toBeGreaterThanOrEqual(block.x);
      expect(area.y).toBeGreaterThanOrEqual(block.y);
      expect(area.x + area.width).toBeLessThanOrEqual(block.x + block.width);
      expect(area.y + area.height).toBeLessThanOrEqual(block.y + block.height);
    }
  });

  it('connects cross streets to both route-following corridors', () => {
    const scenery = sceneryFor({ path: diagonalPath, size: canvas, seed: 'connections' });
    const cross = scenery.roads.filter((road) => road.id.startsWith('cross-'));
    expect(cross.length).toBeGreaterThan(1);
    for (const road of cross)
      expect(Math.hypot(road.to.x - road.from.x, road.to.y - road.from.y)).toBeGreaterThan(
        CROSS_STREET_MIN_LENGTH,
      );
  });
});

const CROSS_STREET_MIN_LENGTH = 150;

describe('when there is nothing to draw around', () => {
  it('returns an empty town for a zero-sized canvas', () => {
    expect(sceneryFor({ path: diagonalPath, size: { width: 0, height: 0 }, seed: 's' })).toEqual({
      roads: [],
      blocks: [],
      areas: [],
    });
  });

  it('returns an empty town for a path with fewer than two points', () => {
    expect(sceneryFor({ path: [{ x: 1, y: 1 }], size: canvas, seed: 's' })).toEqual({
      roads: [],
      blocks: [],
      areas: [],
    });
    expect(sceneryFor({ path: [], size: canvas, seed: 's' })).toEqual({
      roads: [],
      blocks: [],
      areas: [],
    });
  });
});

describe('distance to the route', () => {
  it('measures to the nearest point on a segment, not to its ends', () => {
    const path: readonly Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(distanceToPath({ x: 50, y: 30 }, path)).toBeCloseTo(30);
  });

  it('clamps to an endpoint when the foot falls outside the segment', () => {
    const path: readonly Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(distanceToPath({ x: -30, y: 40 }, path)).toBeCloseTo(50);
  });

  it('survives a degenerate segment', () => {
    const path: readonly Point[] = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(distanceToPath({ x: 13, y: 14 }, path)).toBeCloseTo(5);
  });
});

describe('it only draws streets where streets are believable', () => {
  const diagonal = Math.hypot(canvas.width, canvas.height);
  const spanOf = (metres: number) => metres / diagonal;

  it('draws a town on a round a van could actually work in a day', () => {
    // Thirty kilometres across: a seventy-eight-point cell is a plausible block,
    // and this is the case the product is for.
    const scenery = sceneryFor({
      path: diagonalPath,
      size: canvas,
      seed: 'town',
      metresPerPoint: spanOf(30_000),
    });

    expect(scenery.roads.length).toBeGreaterThan(0);
  });

  it('draws nothing across a country', () => {
    // The reported defect. A fixed pixel grid makes each "block" about a hundred
    // kilometres on a Rome-to-Milan canvas, which is why it read as an empty
    // background with a few squares scattered over Italy.
    const scenery = sceneryFor({
      path: diagonalPath,
      size: canvas,
      seed: 'country',
      metresPerPoint: spanOf(900_000),
    });

    expect(scenery).toEqual({ roads: [], blocks: [], areas: [] });
  });

  it('stops abruptly rather than fading into a quieter lie', () => {
    // A fainter town at the wrong scale is the same false claim in a quieter
    // voice. Either the detail is believable or it is not drawn.
    const justInside = sceneryFor({
      path: diagonalPath,
      size: canvas,
      seed: 's',
      metresPerPoint: spanOf(SCENERY_MAX_SPAN_METRES - 1),
    });
    const justOutside = sceneryFor({
      path: diagonalPath,
      size: canvas,
      seed: 's',
      metresPerPoint: spanOf(SCENERY_MAX_SPAN_METRES + 1),
    });

    expect(justInside.roads.length).toBeGreaterThan(0);
    expect(justOutside.roads).toHaveLength(0);
  });
});
