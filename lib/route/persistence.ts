import { stopStateOf } from './progress';

import type { DraftRoute } from './draft';
import type { RouteProgress } from './progress';
import type { RouteShape, Stop } from '@/types';

/**
 * Turning a draft into rows, and back.
 *
 * **There is no Save button, and that is a decision the schema already made.**
 * `route_status` is an enum with an order — `draft → optimized → in_progress →
 * completed → archived` ([`docs/12_DATABASE.md`](../../docs/12_DATABASE.md)) —
 * which describes a lifecycle rather than a set of flags. A route saves itself
 * as the user works, because a driver who has to remember to press Save is a
 * driver who loses a day's work the first time they don't.
 *
 * So the question this module answers is not "should we write?" but "what does
 * this transition mean?". The transitions are a state machine and illegal ones
 * are refused rather than tolerated: a route that goes from `completed` back to
 * `draft` is a bug somewhere upstream, and silently allowing it would let a
 * finished day be reopened and re-billed.
 *
 * Everything here is pure. The adapter in `lib/supabase/routes-adapter.ts` does
 * the talking; this decides what to say.
 */

export const ROUTE_STATUSES = [
  'draft',
  'optimized',
  'in_progress',
  'completed',
  'archived',
] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/**
 * Which transitions exist.
 *
 * Forward only, with two exceptions that are not exceptions at all:
 *
 * - **`optimized` back to `draft`** is what a structural edit does. Adding a
 *   stop after an optimization genuinely invalidates the result, and the draft
 *   already clears `isOptimized` for the same reason (`lib/route/draft.ts`).
 * - **Anything reachable can be archived.** Archiving is the user's way out of a
 *   route in any state, including one they abandoned mid-drive.
 */
const TRANSITIONS: Readonly<Record<RouteStatus, readonly RouteStatus[]>> = {
  draft: ['optimized', 'archived'],
  optimized: ['draft', 'in_progress', 'archived'],
  // Not to `optimized`: a mid-route re-optimization keeps the route underway.
  // Sending it backwards would make an in-progress day look like a plan.
  in_progress: ['completed', 'archived'],
  // Terminal except for archiving. A finished day is not re-openable — undoing
  // a completion is marking a stop, not resurrecting a route.
  completed: ['archived'],
  archived: [],
};

export function canTransition(from: RouteStatus, to: RouteStatus): boolean {
  // Re-asserting the state you are already in is not a transition and not an
  // error: two writes racing to record the same optimization is ordinary.
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/**
 * What the route's status should be, given everything currently true about it.
 *
 * Derived rather than stored on the client, because the client already holds
 * every input. A second stored copy would be a second source of truth, and the
 * two disagreeing is what makes a route show as "in progress" on a phone that
 * finished it yesterday.
 *
 * **`completed` is not derivable and is deliberately absent from here.** It used
 * to mean "every stop was marked", and there is nobody left in the app to mark
 * one ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)). What we
 * honestly know is that a route was handed to a navigation app, which is
 * `in_progress`; a route stops being the current one when the driver starts the
 * next, and that is the transition `completeSupersededRoute` performs.
 */
export function statusFor(inputs: {
  readonly isOptimized: boolean;
  readonly isUnderway: boolean;
}): RouteStatus {
  if (inputs.isUnderway) return 'in_progress';
  return inputs.isOptimized ? 'optimized' : 'draft';
}

/**
 * The transition that closes the day, and what triggers it.
 *
 * Nothing inside a route can finish it any more, so the next route does: opening
 * or starting a new one is the driver saying, with their hands rather than with
 * a button, that the last one is behind them. Only a route that was actually
 * handed over is closed this way — an `optimized` route the user simply
 * abandoned was never driven and stays what it was.
 *
 * Returns null when there is nothing to close, so the caller has no condition of
 * its own to get wrong.
 */
export function completeSupersededRoute(
  previous: {
    readonly routeId: string;
    readonly status: RouteStatus;
  } | null,
): { readonly routeId: string; readonly from: RouteStatus; readonly to: RouteStatus } | null {
  if (previous === null || previous.status !== 'in_progress') return null;
  return { routeId: previous.routeId, from: 'in_progress', to: 'completed' };
}

// ─── Rows ────────────────────────────────────────────────────────────────────

/** A `routes` row, in the database's vocabulary. The only place in the client
 *  where snake_case appears, because it is the wire format and not ours. */
export interface RouteRow {
  readonly id: string;
  readonly user_id: string;
  readonly name: string | null;
  readonly status: RouteStatus;
  readonly is_round_trip: boolean;
  readonly origin_place_id: string | null;
  readonly origin_is_current_location: boolean;
  readonly optimized_at: string | null;
  readonly optimization_tier: string | null;
  readonly is_degraded: boolean;
  readonly total_distance_m: number | null;
  readonly total_duration_s: number | null;
}

export interface StopRow {
  readonly id: string;
  readonly route_id: string;
  readonly place_id: string;
  readonly label: string | null;
  readonly note: string | null;
  readonly entry_order: number;
  readonly optimized_order: number | null;
  /**
   * The `stop_state` enum, as the database has it — **not** `StopProgressState`.
   *
   * The two were the same type until ADR-0027 retired `completed` and `skipped`
   * from the product. The column still accepts all four and rows written before
   * then still hold them, so this stays as wide as the wire — narrowing it here
   * would make the compiler certify something only a migration could make true,
   * and the first old route anyone opened would fail to parse.
   *
   * Nothing reads it back. What a stop's state *means* now comes from the
   * optimization result, which is where `unreachable` originates; the column is
   * written so the server's copy is complete and so a future reader has it.
   */
  readonly state: string;
  readonly leg_distance_m: number | null;
  readonly leg_duration_s: number | null;
}

export interface RouteWrite {
  readonly route: RouteRow;
  readonly stops: readonly StopRow[];
}

/**
 * A draft as rows.
 *
 * **No coordinate crosses this boundary.** `stops` has no coordinate columns and
 * never did: the durable key is `place_id`, and latitude, longitude and the
 * formatted address live in `places_cache` under a thirty-day purge
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * Writing a coordinate onto a stop would put a perishable value in a table with
 * no expiry mechanism, which is a terms breach rather than a denormalisation.
 *
 * `optimized_order` is null until an optimization produced the order. That is
 * the difference between a list the user typed and a list an engine returned,
 * and it is what "already the fastest order" is measured against.
 */
export function toRows(
  draft: DraftRoute,
  userId: string,
  context: {
    readonly status: RouteStatus;
    /** Named by the optimizer, not by the driver. Omitted before there is a
     *  result, which is when nothing can be known to be unreachable. */
    readonly unreachableStopIds?: readonly string[];
    readonly totals: {
      readonly tier: string | null;
      readonly distanceMeters: number | null;
      readonly durationSeconds: number | null;
      readonly optimizedAt: string | null;
    } | null;
    readonly name?: string | null;
  },
): RouteWrite {
  return {
    route: {
      id: draft.routeId,
      user_id: userId,
      name: context.name ?? null,
      status: context.status,
      is_round_trip: draft.shape === 'round-trip',
      origin_place_id: draft.originPlaceId,
      origin_is_current_location: draft.originIsCurrentLocation,
      optimized_at: context.totals?.optimizedAt ?? null,
      optimization_tier: context.totals?.tier ?? null,
      // Stored rather than derived, so a T0 result stays labelled in history for
      // ever. A degraded result that stops looking degraded once it is saved is
      // the one way this product could mislead a user about what it promised.
      is_degraded: draft.isDegraded,
      total_distance_m: context.totals?.distanceMeters ?? null,
      total_duration_s: context.totals?.durationSeconds ?? null,
    },
    stops: draft.stops.map((stop) => ({
      id: stop.id,
      route_id: draft.routeId,
      place_id: stop.placeId,
      // User content: durable, never purged, and the reason a stop is still
      // recognisable after its coordinates are gone.
      label: stop.label,
      note: stop.note,
      entry_order: stop.entryOrder,
      optimized_order: draft.isOptimized ? stop.position : null,
      // Only ever `pending` or `unreachable` now. The column's enum still
      // carries `completed` and `skipped` for rows written before ADR-0027;
      // nothing writes them again, and `readStopState` narrows them on the way
      // back in.
      state: stopStateOf(stop.id, context.unreachableStopIds ?? []),
      leg_distance_m: null,
      leg_duration_s: null,
    })),
  };
}

/**
 * Rows as a draft.
 *
 * Stops arrive with `coordinate: null` without exception, because the rows carry
 * none. The resolution happens above, through `useResolvedPlaces`, which is the
 * one place that knows how to buy a coordinate and how to notice that it could
 * not. Fabricating one here — even a plausible one — would produce a coordinate
 * with no refresh date, which is the single case the expiry rule cannot handle.
 */
export function fromRows(route: RouteRow, stops: readonly StopRow[]): DraftRoute {
  const isOptimized = stops.length > 0 && stops.every((row) => row.optimized_order !== null);

  const ordered = [...stops].sort((a, b) => {
    // The optimized order when there is one, the entry order otherwise. Sorting
    // by a nullable column with no fallback puts a route back in an order
    // nobody chose.
    const left = a.optimized_order ?? a.entry_order;
    const right = b.optimized_order ?? b.entry_order;
    return left - right;
  });

  return {
    routeId: route.id,
    originPlaceId: route.origin_place_id,
    originIsCurrentLocation: route.origin_is_current_location,
    shape: route.is_round_trip ? 'round-trip' : ('one-way' as RouteShape),
    routeStart: route.origin_is_current_location ? 'current-location' : 'first-stop',
    routeEnd: route.is_round_trip
      ? route.origin_is_current_location
        ? 'current-location'
        : 'return-to-start'
      : 'last-stop',
    stops: ordered.map((row, index): Stop => ({
      id: row.id,
      placeId: row.place_id,
      label: row.label,
      note: row.note,
      position: index,
      entryOrder: row.entry_order,
      // No suggestion text either: the server stores place ids and coordinates,
      // never Google's autocomplete lines. A reopened route recovers its
      // addresses through `/place-details` exactly as before.
      placeText: null,
      coordinate: null,
    })),
    isOptimized,
    isDegraded: route.is_degraded,
  };
}

/**
 * Whether this route was handed to a navigation app, and when.
 *
 * A route reopened on a second device has to land in the same state as the one
 * that set off, or the driver sees a plan where there is a day in progress. The
 * timestamp is `updated_at` rather than a column of its own: the write that
 * moved the route to `in_progress` *is* the handoff (`use-route-sync.ts`), so
 * the two instants are the same one, and a migration to store it twice would be
 * a schema change to record something already recorded.
 */
export function progressFromRows(route: RouteRow, updatedAt: string): RouteProgress | null {
  if (route.status !== 'in_progress') return null;
  return { routeId: route.id, startedAt: updatedAt };
}

// ─── History ─────────────────────────────────────────────────────────────────

/**
 * A stop as History needs it: where it sits in the route, and what it is called
 * if we still know.
 *
 * **The address is on loan.** It comes from `places_cache`, which the purge job
 * nulls at thirty days ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)),
 * so `null` is the ordinary state of an old route rather than a failure. The
 * `place_id` beside it is durable and is what would buy the text back.
 */
export interface SavedRouteStop {
  readonly placeId: string;
  readonly entryOrder: number;
  readonly optimizedOrder: number | null;
  readonly address: string | null;
}

/**
 * One row of History.
 *
 * Deliberately not a `DraftRoute`. It used to carry only a count, on the
 * reasoning that loading every stop of every route would make opening History
 * cost more than opening a route — which was right about the cost and wrong
 * about the row: a name, a date and a number told the driver nothing about
 * *which* day it was.
 *
 * It now carries the stops, but only three columns of each, and the address
 * arrives on the same query through the foreign key `stops.place_id` already has
 * to `places_cache`. **No upstream call and no quota**: this is our own cache,
 * read directly, exactly as the address book reads it
 * (`lib/supabase/favourites-adapter.ts`).
 */
export interface SavedRouteSummary {
  readonly routeId: string;
  readonly name: string | null;
  readonly status: RouteStatus;
  readonly stopCount: number;
  readonly isRoundTrip: boolean;
  readonly stops: readonly SavedRouteStop[];
  readonly isDegraded: boolean;
  readonly distanceMeters: number | null;
  readonly durationSeconds: number | null;
  readonly updatedAt: string;
}

/**
 * A name for a route that has none.
 *
 * Almost every route has none: naming a day's deliveries is work the user gets
 * nothing for. So History shows what the route *was* rather than an empty row —
 * the date it was worked and how many stops it had, which is exactly how a
 * driver looks for last Tuesday's round.
 */
export function displayName(summary: SavedRouteSummary, locale = 'en-GB'): string {
  if (summary.name !== null && summary.name.trim() !== '') return summary.name;

  const when = new Date(summary.updatedAt);
  const date = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const stops = `${summary.stopCount} ${summary.stopCount === 1 ? 'stop' : 'stops'}`;
  return date === null ? stops : `${date} · ${stops}`;
}
