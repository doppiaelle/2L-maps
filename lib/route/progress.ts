import type { OptimizationResult } from '@/types';

/**
 * A route that has been handed over.
 *
 * **This module used to track which stops the driver had finished.** It held a
 * map of marks, a next-stop cursor, a completion summary and a re-optimization
 * filter — the machinery behind two buttons, Done and Skip, that the driver
 * pressed once per stop on returning to the app.
 *
 * They are gone, and so is the machinery ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
 * The product does not navigate ([ADR-0004](../../docs/adr/0004-external-navigation-handoff.md)):
 * it hands the day to Google Maps or Waze, which drives the whole multi-stop
 * route itself. The driver never comes back between stops, so nobody was there
 * to press either button, and a screen asking "did you deliver that one?" of
 * someone who left an hour ago is a question with no answer.
 *
 * What remains is the one fact this product can still honestly assert: **that a
 * route was handed over, and when.** Not that it was finished — we cannot know
 * that, and `route_status` moving to `completed` is what starting the *next*
 * route means (`lib/route/persistence.ts`).
 *
 * The ordering rule that governed this module still governs it: progress is
 * written **before** the handoff and never after
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §7). The app
 * is backgrounded for the whole drive and can be killed at any moment, so a
 * write ordered after the launch is lost exactly when the user has invested
 * most. There is simply far less to write now.
 */

/**
 * What a stop looks like on the list and on the map.
 *
 * Two states, and the interesting one does not come from the user at all:
 * `unreachable` is the optimizer reporting that no road connects a stop to the
 * rest of the route, and it arrives on `OptimizationResult.unreachableStopIds`.
 * It stays a *state* rather than a boolean because a marker and a row both style
 * themselves from it, and because the database column it maps to is an enum.
 *
 * The enum in the database still carries `completed` and `skipped`, because rows
 * written before ADR-0027 still hold them and dropping the column would be a
 * breaking change to a stored shape for no gain. `StopRow.state` is therefore
 * deliberately wider than this type (`lib/route/persistence.ts`).
 */
export type StopProgressState = 'pending' | 'unreachable';

export interface RouteProgress {
  readonly routeId: string;
  /** When the route was handed to a navigation app, as an ISO instant. The
   *  product's only evidence that the day was actually driven. */
  readonly startedAt: string;
}

/** A route just handed over. `at` is injected rather than read from a clock here,
 *  so the store above stays the only thing that knows what time it is. */
export function startedRoute(routeId: string, at: Date): RouteProgress {
  return { routeId, startedAt: at.toISOString() };
}

/**
 * Which stops the map and the list should mark as unreachable.
 *
 * A tiny function for a rule that used to be spread across a progress map, a
 * store selector and two components: **the optimizer decides this, nothing
 * else.** A stop is unreachable because no road connects it, not because of
 * anything the user did.
 */
export function stopStateOf(
  stopId: string,
  unreachableStopIds: readonly string[],
): StopProgressState {
  return unreachableStopIds.includes(stopId) ? 'unreachable' : 'pending';
}

/**
 * The unreachable stops a result names, if it is the kind of result that can.
 *
 * **A T0 result never names any, and that is not an omission.** The local solver
 * orders stops by straight-line distance and knows nothing about roads
 * ([ADR-0003](../../docs/adr/0003-tiered-optimization-cascade.md)), so it has no
 * basis for saying a stop cannot be driven to. Reporting none is the honest
 * answer; inventing the field on that branch of the union would let a degraded
 * result make a claim it has no way to support.
 */
export function unreachableIn(result: OptimizationResult | null): readonly string[] {
  if (result === null || result.isDegraded) return [];
  return result.unreachableStopIds;
}
