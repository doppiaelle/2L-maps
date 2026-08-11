import type { DraftRoute } from './draft';
import type { RouteProgress, StopProgressState } from './progress';
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
 * every input: whether an optimization produced the order, whether a route is
 * underway, whether it finished. A second stored copy would be a second source
 * of truth, and the two disagreeing is what makes a route show as "in progress"
 * on a phone that finished it yesterday.
 */
export function statusFor(inputs: {
  readonly isOptimized: boolean;
  readonly isUnderway: boolean;
  readonly isFinished: boolean;
}): RouteStatus {
  if (inputs.isFinished) return 'completed';
  if (inputs.isUnderway) return 'in_progress';
  return inputs.isOptimized ? 'optimized' : 'draft';
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
  readonly state: StopProgressState;
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
    readonly progress: RouteProgress | null;
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
      state: progressStateOf(context.progress, stop.id),
      leg_distance_m: null,
      leg_duration_s: null,
    })),
  };
}

function progressStateOf(progress: RouteProgress | null, stopId: string): StopProgressState {
  return progress?.states[stopId] ?? 'pending';
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
      isCompleted: row.state === 'completed',
    })),
    isOptimized,
    isDegraded: route.is_degraded,
  };
}

/** Progress as stored, so a route reopened on another device knows which stops
 *  are done rather than starting the day again. */
export function progressFromRows(route: RouteRow, stops: readonly StopRow[]): RouteProgress | null {
  if (route.status !== 'in_progress' && route.status !== 'completed') return null;

  const states: Record<string, StopProgressState> = {};
  for (const row of stops) {
    if (row.state !== 'pending') states[row.id] = row.state;
  }
  return { routeId: route.id, states };
}

// ─── History ─────────────────────────────────────────────────────────────────

/** One row of History. Deliberately not a `DraftRoute`: the list needs a name, a
 *  date and a count, and loading every stop of every route to show them would
 *  make opening History cost more than opening a route. */
export interface SavedRouteSummary {
  readonly routeId: string;
  readonly name: string | null;
  readonly status: RouteStatus;
  readonly stopCount: number;
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

/**
 * Which saved routes a plan keeps.
 *
 * Free keeps the last three; history beyond a handful is one of the things Pro
 * sells ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)). This
 * **partitions rather than filters**: the routes over the limit are still the
 * user's own work, and History shows them as locked rather than pretending they
 * were never there. A product that silently deletes a driver's records to sell
 * them back is a different product.
 */
export function partitionByAllowance(
  summaries: readonly SavedRouteSummary[],
  keep: number,
): {
  readonly visible: readonly SavedRouteSummary[];
  readonly locked: readonly SavedRouteSummary[];
} {
  // Already ordered newest-first by the query; the slice trusts that rather than
  // re-sorting, so one ordering rule lives in one place.
  return {
    visible: summaries.slice(0, Math.max(0, keep)),
    locked: summaries.slice(Math.max(0, keep)),
  };
}
