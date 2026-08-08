import { tourLengthMeters, type LatLng } from '@/lib/geo/haversine';

import { LOCAL_SOLVER_BUDGET_MS, solveLocally } from './local-solver';

/**
 * The T0 heuristic is the only optimization that runs with no network, so it is
 * the one that must not throw, must not lose a stop, and must not move the
 * origin — the user starts where they are.
 *
 * These tests assert properties rather than exact orders. A heuristic has no
 * single correct answer, and pinning one would test the implementation instead of
 * the requirement.
 */

/** A ring of points around Milan, at a radius where haversine stays well-behaved. */
const ring = (count: number, radiusDegrees = 0.05): LatLng[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return {
      latitude: 45.4642 + radiusDegrees * Math.sin(angle),
      longitude: 9.19 + radiusDegrees * Math.cos(angle),
    };
  });

const reorder = (points: readonly LatLng[], order: readonly number[]): LatLng[] =>
  order.map((i) => {
    const p = points[i];
    if (p === undefined) throw new Error(`order referenced missing index ${i}`);
    return p;
  });

describe('invariants that must hold for every input', () => {
  it('visits every stop exactly once', () => {
    const points = ring(8);
    const { order } = solveLocally({ points, isRoundTrip: false });
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('never moves the origin from first position', () => {
    // The user starts where they are. An order beginning anywhere else would send
    // them to a stop they are not at.
    for (const roundTrip of [false, true]) {
      for (let n = 3; n <= 8; n += 1) {
        const { order } = solveLocally({ points: ring(n), isRoundTrip: roundTrip });
        expect(order[0]).toBe(0);
      }
    }
  });

  it('handles the degenerate sizes without throwing', () => {
    expect(solveLocally({ points: [], isRoundTrip: false }).order).toEqual([]);
    expect(solveLocally({ points: ring(1), isRoundTrip: false }).order).toEqual([0]);
    expect(solveLocally({ points: ring(2), isRoundTrip: false }).order).toEqual([0, 1]);
  });

  it('handles duplicate coordinates without losing a stop', () => {
    // The same address twice is legitimate — a depot revisited mid-round.
    const duplicated: LatLng[] = [
      { latitude: 45.4642, longitude: 9.19 },
      { latitude: 45.5, longitude: 9.2 },
      { latitude: 45.4642, longitude: 9.19 },
      { latitude: 45.48, longitude: 9.21 },
    ];
    const { order } = solveLocally({ points: duplicated, isRoundTrip: false });
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('handles all-identical coordinates', () => {
    const same: LatLng[] = Array.from({ length: 5 }, () => ({ latitude: 45.4642, longitude: 9.19 }));
    const result = solveLocally({ points: same, isRoundTrip: true });
    expect([...result.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(result.totalDistanceMeters).toBeCloseTo(0, 6);
  });
});

describe('the result is actually an improvement', () => {
  it('never returns a tour longer than the order it was given', () => {
    // A heuristic that can make things worse is worse than no heuristic: the user
    // asked for an optimization and would receive a downgrade.
    for (let n = 3; n <= 8; n += 1) {
      const points = ring(n);
      // Shuffle deterministically so the input order is a poor one.
      const scrambled = [points[0], ...points.slice(1).reverse()].filter(
        (p): p is LatLng => p !== undefined,
      );
      for (const roundTrip of [false, true]) {
        const before = tourLengthMeters(scrambled, roundTrip);
        const { order, totalDistanceMeters } = solveLocally({
          points: scrambled,
          isRoundTrip: roundTrip,
        });
        expect(totalDistanceMeters).toBeLessThanOrEqual(before + 1e-6);
        expect(tourLengthMeters(reorder(scrambled, order), roundTrip)).toBeCloseTo(
          totalDistanceMeters,
          3,
        );
      }
    }
  });

  it('untangles a deliberately crossed tour', () => {
    // Four corners of a square given in a crossing order. The optimal closed tour
    // is the perimeter; any crossing order is strictly longer.
    const square: LatLng[] = [
      { latitude: 45.0, longitude: 9.0 },
      { latitude: 45.1, longitude: 9.1 },
      { latitude: 45.1, longitude: 9.0 },
      { latitude: 45.0, longitude: 9.1 },
    ];
    const before = tourLengthMeters(square, true);
    const { totalDistanceMeters } = solveLocally({ points: square, isRoundTrip: true });
    expect(totalDistanceMeters).toBeLessThan(before);
  });

  it('relocates a stop dropped in the wrong neighbourhood — the Or-opt case', () => {
    // 2-opt can only reverse a span, so a single misplaced stop survives it. This
    // is the failure a user notices first, which is why Or-opt is in the loop.
    const cluster: LatLng[] = [
      { latitude: 45.0, longitude: 9.0 },
      { latitude: 45.001, longitude: 9.001 },
      { latitude: 46.0, longitude: 10.0 }, // far away, wedged into the cluster
      { latitude: 45.002, longitude: 9.002 },
      { latitude: 45.003, longitude: 9.003 },
    ];
    const before = tourLengthMeters(cluster, false);
    const { order, totalDistanceMeters } = solveLocally({ points: cluster, isRoundTrip: false });
    expect(totalDistanceMeters).toBeLessThan(before);
    // The far stop should no longer sit in the middle of the cluster.
    expect(order.indexOf(2)).toBeGreaterThan(2);
  });

  it('round trip and one way can legitimately differ', () => {
    // Which order wins genuinely depends on whether the return leg counts, which
    // is why toggling it invalidates the cached result.
    const points = ring(6);
    const open = solveLocally({ points, isRoundTrip: false });
    const closed = solveLocally({ points, isRoundTrip: true });
    expect(closed.totalDistanceMeters).toBeGreaterThan(open.totalDistanceMeters);
  });
});

describe('the time budget', () => {
  it('is the documented 200 ms', () => {
    expect(LOCAL_SOLVER_BUDGET_MS).toBe(200);
  });

  it('stops improving when the budget expires and says so', () => {
    // A clock that has already blown the budget on first read. The result must
    // still be a valid complete tour — degraded further, never broken.
    let ticks = 0;
    const now = () => {
      ticks += 1;
      return ticks === 1 ? 0 : 10_000;
    };
    const points = ring(8);
    const result = solveLocally({ points, isRoundTrip: false, now, budgetMs: 1 });

    expect(result.hitBudget).toBe(true);
    expect([...result.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.order[0]).toBe(0);
  });

  it('reports converging within budget when it does', () => {
    const result = solveLocally({ points: ring(6), isRoundTrip: false, now: () => 0 });
    expect(result.hitBudget).toBe(false);
  });
});
