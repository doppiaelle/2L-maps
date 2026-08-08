import type { Stop } from '@/types';

/**
 * Route progress — which stop the user is on, what they finished, what they
 * skipped.
 *
 * Pure functions, so the store above them holds state and decides nothing. This
 * is the most safety-critical state in the product: it is written **before**
 * every external handoff and never after
 * (docs/11_STATE_MANAGEMENT.md §7, docs/16_INTERNAL_NAVIGATION.md). The app is
 * backgrounded for the whole drive and can be killed at any moment, so a write
 * ordered after the launch is lost exactly when the user has invested most.
 */

export type StopProgressState = 'pending' | 'completed' | 'skipped' | 'unreachable';

export interface RouteProgress {
  readonly routeId: string;
  /** Keyed by stop id. A stop absent from this map is pending. */
  readonly states: Readonly<Record<string, StopProgressState>>;
}

export function emptyProgress(routeId: string): RouteProgress {
  return { routeId, states: {} };
}

export function stateOf(progress: RouteProgress, stopId: string): StopProgressState {
  return progress.states[stopId] ?? 'pending';
}

/**
 * Mark a stop.
 *
 * Returns a new progress rather than mutating, so a caller cannot hold a stale
 * reference that silently diverges from what was persisted.
 *
 * Marking is idempotent and re-markable in both directions: a user who taps Done
 * by mistake must be able to undo it, and a stop marked skipped that they then
 * visit must be markable complete. Neither is an error, and refusing either would
 * strand them mid-route with no way out.
 */
export function markStop(
  progress: RouteProgress,
  stopId: string,
  state: StopProgressState,
): RouteProgress {
  return { ...progress, states: { ...progress.states, [stopId]: state } };
}

/** A stop the user has dealt with, one way or another. */
function isSettled(state: StopProgressState): boolean {
  return state !== 'pending';
}

/**
 * The next stop to navigate to.
 *
 * Skipped stops are **not** revisited automatically: the user chose to pass them,
 * and silently routing back would override a decision they made deliberately.
 * They remain in the list, visible, and can be marked complete later — but they
 * do not claim the next-stop position (docs/15_ROUTE_OPTIMIZATION.md).
 *
 * Unreachable stops are likewise not offered: the engine could not route to them,
 * so sending the user there is sending them to a known failure.
 */
export function nextStop(progress: RouteProgress, orderedStops: readonly Stop[]): Stop | null {
  return orderedStops.find((stop) => stateOf(progress, stop.id) === 'pending') ?? null;
}

export interface ProgressSummary {
  readonly total: number;
  readonly completed: number;
  readonly skipped: number;
  readonly unreachable: number;
  readonly remaining: number;
  /** True when nothing is left pending — including a route where everything was
   *  skipped, which is finished even though nothing was delivered. */
  readonly isFinished: boolean;
}

export function summarise(progress: RouteProgress, orderedStops: readonly Stop[]): ProgressSummary {
  let completed = 0;
  let skipped = 0;
  let unreachable = 0;

  for (const stop of orderedStops) {
    const state = stateOf(progress, stop.id);
    if (state === 'completed') completed += 1;
    else if (state === 'skipped') skipped += 1;
    else if (state === 'unreachable') unreachable += 1;
  }

  const total = orderedStops.length;
  const remaining = total - completed - skipped - unreachable;

  return {
    total,
    completed,
    skipped,
    unreachable,
    remaining,
    // An empty route is not "finished" — there was nothing to finish, and
    // showing a completion summary for it would be nonsense.
    isFinished: total > 0 && remaining === 0,
  };
}

/**
 * Drop progress for stops that no longer exist.
 *
 * A stop removed while the route is in progress leaves an orphan entry whose
 * state would keep counting toward the totals and hold `isFinished` false
 * forever, stranding the user on a route they cannot complete.
 */
export function pruneToStops(
  progress: RouteProgress,
  orderedStops: readonly Stop[],
): RouteProgress {
  const live = new Set(orderedStops.map((stop) => stop.id));
  const states: Record<string, StopProgressState> = {};

  for (const [stopId, state] of Object.entries(progress.states)) {
    if (live.has(stopId)) states[stopId] = state;
  }

  return { ...progress, states };
}

/**
 * Which stops a mid-route re-optimization should consider.
 *
 * Completed stops are excluded — they are done. Skipped ones are included, at the
 * end, unless the user removed them: skipping meant "not now", not "never", and a
 * re-optimization is the natural moment to offer them again.
 */
export function stopsForReoptimization(
  progress: RouteProgress,
  orderedStops: readonly Stop[],
): readonly Stop[] {
  const pending = orderedStops.filter((stop) => stateOf(progress, stop.id) === 'pending');
  const skipped = orderedStops.filter((stop) => stateOf(progress, stop.id) === 'skipped');
  return [...pending, ...skipped];
}

/** Whether any stop has been settled. Used to decide whether abandoning the route
 *  needs confirming — discarding untouched work costs the user nothing. */
export function hasStarted(progress: RouteProgress): boolean {
  return Object.values(progress.states).some(isSettled);
}
