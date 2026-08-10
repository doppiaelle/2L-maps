import { MAX_SIMPLIFY_POINTS, SIMPLIFY_TOLERANCE, simplify } from './simplify';
import type { Point } from './projection';

/**
 * What survives a polyline being thinned.
 *
 * The risk is not that too much is removed — it is that the *wrong* points are.
 * A simplifier that keeps every fourth vertex draws a route that is smooth and
 * subtly wrong; the corner where the route leaves the motorway is exactly the
 * one a driver uses to recognise their day, and it is exactly the one an
 * evenly-spaced sample throws away.
 */

const line = (count: number): Point[] =>
  Array.from({ length: count }, (_, index) => ({ x: index, y: 0 }));

describe('what it keeps', () => {
  it('keeps both ends, always', () => {
    const points = line(100);
    const result = simplify(points);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('keeps a corner', () => {
    // The point of the whole algorithm. This is the motorway exit.
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(simplify(points)).toHaveLength(3);
  });

  it('reduces a straight run to its two ends', () => {
    expect(simplify(line(500))).toHaveLength(2);
  });

  it('keeps a deviation just above the tolerance', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: SIMPLIFY_TOLERANCE * 2 },
      { x: 100, y: 0 },
    ];
    expect(simplify(points)).toHaveLength(3);
  });

  it('drops a deviation below it, which no screen could show', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: SIMPLIFY_TOLERANCE / 2 },
      { x: 100, y: 0 },
    ];
    expect(simplify(points)).toHaveLength(2);
  });

  it('keeps the order it was given', () => {
    // A route drawn out of order is not a shorter route, it is a different one.
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 60 },
      { x: 20, y: 0 },
      { x: 30, y: 60 },
      { x: 40, y: 0 },
    ];
    const result = simplify(points);
    expect(result.map((point) => point.x)).toEqual(
      [...result.map((p) => p.x)].sort((a, b) => a - b),
    );
  });
});

describe('the shapes that break a naive implementation', () => {
  it('handles a route that returns to where it started', () => {
    // Both ends coincide, so there is no line to measure a distance against.
    // Every round trip is this shape.
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 0 },
    ];
    expect(simplify(points).length).toBeGreaterThanOrEqual(3);
  });

  it('leaves two points alone', () => {
    const points = line(2);
    expect(simplify(points)).toEqual(points);
  });

  it('leaves one point alone', () => {
    expect(simplify([{ x: 5, y: 5 }])).toHaveLength(1);
  });

  it('survives an empty path', () => {
    expect(simplify([])).toEqual([]);
  });

  it('finishes on the shape that is quadratic for this algorithm', () => {
    // Every vertex a corner, which splits into subproblems of size n-1 and 1 all
    // the way down. This test did not finish before the input was capped — and
    // the cost of that in production is a frozen screen at the exact moment the
    // user pressed Optimize.
    const zigzag: Point[] = Array.from({ length: 50_000 }, (_, index) => ({
      x: index,
      y: index % 2 === 0 ? 0 : 100,
    }));

    const started = Date.now();
    const result = simplify(zigzag);
    // Generous on purpose: this asserts "a phone can absorb it", not a
    // benchmark. Uncapped it did not finish at all; at a cap of four thousand it
    // took over three seconds.
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.length).toBeGreaterThan(1);
  });

  it('keeps both ends after thinning an oversized path', () => {
    // A stride that does not divide the length evenly would otherwise stop the
    // route short of where it actually ends.
    const long: Point[] = Array.from({ length: MAX_SIMPLIFY_POINTS * 3 + 7 }, (_, index) => ({
      x: index,
      y: index % 2 === 0 ? 0 : 100,
    }));

    const result = simplify(long);
    expect(result[0]).toEqual(long[0]);
    expect(result[result.length - 1]).toEqual(long[long.length - 1]);
  });
});

describe('what it is for', () => {
  it('cuts a dense straight-ish path to a fraction of its size', () => {
    // The real shape: thousands of points along a motorway, wobbling by less
    // than the eye can resolve.
    const motorway: Point[] = Array.from({ length: 4_000 }, (_, index) => ({
      x: index / 10,
      y: Math.sin(index / 50) * 0.2,
    }));

    expect(simplify(motorway).length).toBeLessThan(motorway.length / 20);
  });
});
