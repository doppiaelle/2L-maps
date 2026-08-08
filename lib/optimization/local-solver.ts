import { haversineMeters, tourLengthMeters, type LatLng } from '@/lib/geo/haversine';

/**
 * The T0 local heuristic.
 *
 * Nearest neighbour builds an initial tour, then 2-opt and Or-opt improve it
 * until no move helps or the time budget expires
 * (docs/15_ROUTE_OPTIMIZATION.md §T0).
 *
 * What this is for: the network is gone, or every upstream attempt failed, and
 * the user has at most eight stops. What it is not: a substitute for T1. It runs
 * on straight-line distance and knows nothing about roads, one-way systems, turn
 * restrictions or traffic, so its output is always labelled degraded and never
 * presented as equivalent (ADR-0003).
 *
 * The origin is fixed — the user starts where they are — so index 0 never moves.
 * Every move below preserves that.
 */

/** Improvement smaller than this is treated as noise rather than progress, so
 *  floating-point jitter cannot keep the loop alive to the budget. */
const EPSILON_METERS = 1e-6;

/** docs/15_ROUTE_OPTIMIZATION.md §T0 — improvement stops here even if moves remain. */
export const LOCAL_SOLVER_BUDGET_MS = 200;

export interface LocalSolverInput {
  /** Points in the user's order. Index 0 is the origin and stays first. */
  readonly points: readonly LatLng[];
  /** True when the tour returns to the origin, which changes which order wins. */
  readonly isRoundTrip: boolean;
  /** Injected so tests are deterministic and the budget is observable
   *  (CLAUDE.md §5: mock the clock, never the function under test). */
  readonly now?: () => number;
  readonly budgetMs?: number;
}

export interface LocalSolverResult {
  /** Indices into the input `points`, in visiting order. Always starts with 0. */
  readonly order: readonly number[];
  readonly totalDistanceMeters: number;
  /** True when the budget stopped improvement before it converged. The result is
   *  still usable — it is simply not the best this heuristic could have found. */
  readonly hitBudget: boolean;
}

/** Distance matrix. Symmetric, so only half is computed and both halves are read. */
function buildMatrix(points: readonly LatLng[]): number[][] {
  const n = points.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = points[i];
      const b = points[j];
      if (a === undefined || b === undefined) continue;
      const d = haversineMeters(a, b);
      const rowI = matrix[i];
      const rowJ = matrix[j];
      if (rowI !== undefined) rowI[j] = d;
      if (rowJ !== undefined) rowJ[i] = d;
    }
  }
  return matrix;
}

const at = (matrix: readonly number[][], i: number, j: number): number => matrix[i]?.[j] ?? 0;

/** Tour length over indices, using the precomputed matrix. */
function lengthOf(order: readonly number[], matrix: readonly number[][], closed: boolean): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i += 1) {
    total += at(matrix, order[i] ?? 0, order[i + 1] ?? 0);
  }
  if (closed && order.length > 1) {
    total += at(matrix, order[order.length - 1] ?? 0, order[0] ?? 0);
  }
  return total;
}

/** Nearest neighbour from the fixed origin. Fast, and a poor tour on its own —
 *  it strands the last stop far from everything, which is what 2-opt fixes. */
function nearestNeighbour(matrix: readonly number[][], n: number): number[] {
  const order = [0];
  const visited = new Set([0]);

  let current = 0;
  while (order.length < n) {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let candidate = 1; candidate < n; candidate += 1) {
      if (visited.has(candidate)) continue;
      const d = at(matrix, current, candidate);
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
    if (best === -1) break;
    order.push(best);
    visited.add(best);
    current = best;
  }

  return order;
}

/**
 * 2-opt: reverse a segment when doing so shortens the tour.
 *
 * This is what removes the crossings nearest neighbour leaves behind — on a
 * planar tour, any crossing pair of edges can always be shortened by reversing
 * the segment between them.
 */
function twoOptPass(
  order: number[],
  matrix: readonly number[][],
  closed: boolean,
  deadline: number,
  now: () => number,
): { improved: boolean; hitBudget: boolean } {
  let improved = false;
  const n = order.length;
  // The origin is fixed, so i starts at 1. The final index is only movable when
  // the tour is closed; on an open tour the last stop is a free endpoint and
  // reversing into it changes nothing that helps.
  const lastMovable = closed ? n - 1 : n - 2;

  for (let i = 1; i <= lastMovable; i += 1) {
    for (let j = i + 1; j <= lastMovable; j += 1) {
      if (now() > deadline) return { improved, hitBudget: true };

      const before = lengthOf(order, matrix, closed);
      const candidate = [
        ...order.slice(0, i),
        ...order.slice(i, j + 1).reverse(),
        ...order.slice(j + 1),
      ];
      const after = lengthOf(candidate, matrix, closed);

      if (before - after > EPSILON_METERS) {
        order.splice(0, order.length, ...candidate);
        improved = true;
      }
    }
  }

  return { improved, hitBudget: false };
}

/**
 * Or-opt: move a run of one to three consecutive stops elsewhere in the tour.
 *
 * 2-opt cannot relocate a stop, only reverse a span. A stop dropped in the wrong
 * neighbourhood stays there under 2-opt alone, which is the visible failure the
 * user would notice first.
 */
function orOptPass(
  order: number[],
  matrix: readonly number[][],
  closed: boolean,
  deadline: number,
  now: () => number,
): { improved: boolean; hitBudget: boolean } {
  let improved = false;
  const n = order.length;

  for (let segmentLength = 1; segmentLength <= 3; segmentLength += 1) {
    for (let start = 1; start + segmentLength <= n; start += 1) {
      for (let insertAt = 1; insertAt <= n - segmentLength; insertAt += 1) {
        if (now() > deadline) return { improved, hitBudget: true };
        if (insertAt >= start && insertAt <= start + segmentLength - 1) continue;

        const before = lengthOf(order, matrix, closed);
        const segment = order.slice(start, start + segmentLength);
        const rest = [...order.slice(0, start), ...order.slice(start + segmentLength)];
        const candidate = [...rest.slice(0, insertAt), ...segment, ...rest.slice(insertAt)];
        if (candidate[0] !== 0) continue; // never displace the fixed origin

        const after = lengthOf(candidate, matrix, closed);
        if (before - after > EPSILON_METERS) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return { improved, hitBudget: false };
}

/**
 * Order the stops.
 *
 * Returns indices rather than reordered points so the caller keeps the mapping
 * back to its own stops — the domain deals in `Stop`, and this module has no
 * business knowing what one is.
 */
export function solveLocally(input: LocalSolverInput): LocalSolverResult {
  const { points, isRoundTrip } = input;
  const now = input.now ?? (() => Date.now());
  const budgetMs = input.budgetMs ?? LOCAL_SOLVER_BUDGET_MS;

  if (points.length === 0) {
    return { order: [], totalDistanceMeters: 0, hitBudget: false };
  }
  if (points.length <= 2) {
    // Nothing to reorder: the origin is fixed and there is at most one other stop.
    const order = points.map((_, index) => index);
    return {
      order,
      totalDistanceMeters: tourLengthMeters(points, isRoundTrip),
      hitBudget: false,
    };
  }

  const matrix = buildMatrix(points);
  const order = nearestNeighbour(matrix, points.length);

  const deadline = now() + budgetMs;
  let hitBudget = false;

  // Alternate the two neighbourhoods until neither finds a move. Or-opt often
  // unlocks a 2-opt move and the reverse, so a single pass of each leaves
  // improvement on the table.
  for (;;) {
    const two = twoOptPass(order, matrix, isRoundTrip, deadline, now);
    if (two.hitBudget) {
      hitBudget = true;
      break;
    }
    const or = orOptPass(order, matrix, isRoundTrip, deadline, now);
    if (or.hitBudget) {
      hitBudget = true;
      break;
    }
    if (!two.improved && !or.improved) break;
  }

  return {
    order,
    totalDistanceMeters: lengthOf(order, matrix, isRoundTrip),
    hitBudget,
  };
}
