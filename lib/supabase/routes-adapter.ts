import { z } from 'zod';

import {
  ROUTE_STATUSES,
  canTransition,
  fromRows,
  progressFromRows,
  toRows,
  type RouteStatus,
  type RouteWrite,
  type SavedRouteSummary,
} from '@/lib/route/persistence';
import { shortId, trace } from '@/lib/diagnostics/app-trace';
import type { DraftRoute } from '@/lib/route/draft';
import type { RouteProgress } from '@/lib/route/progress';

/**
 * Saved routes, over PostgREST.
 *
 * **This one does not go through an Edge Function, and that is not an exception
 * to [ADR-0006](../../docs/adr/0006-mandatory-backend-proxy.md).** The proxy
 * exists because a Google credential must never reach a client; our own database
 * is reached with the anon key, which grants nothing on its own, and every row is
 * gated by RLS. The contract has seven Edge Functions and none of them is about
 * routes ([`docs/33_API_CONTRACTS.md`](../../docs/33_API_CONTRACTS.md) §7) —
 * proxying `insert into routes` would add a hop, a deploy and a cold start to
 * make a policy decision the database already makes better.
 *
 * **`user_id` is set by the caller and enforced by the policy.** `routes_insert_own`
 * has `with check (user_id = auth.uid())`, so a client that writes somebody
 * else's id gets a policy violation rather than a row. Sending it is convenience;
 * the check is the security.
 *
 * **Every response is parsed.** A row from the network is `unknown` until a
 * schema says otherwise (`CLAUDE.md` §3) — including one from our own database,
 * which is exactly the sort of "we control both ends" reasoning that leaves a
 * client crashing on a column somebody renamed in a migration.
 */

// ─── The port ────────────────────────────────────────────────────────────────

/**
 * The slice of PostgREST this adapter uses, in table terms.
 *
 * Narrow on purpose: the SDK's query builder is a chainable, deeply generic
 * surface, and depending on it here would make every test need the real client.
 * The concrete binding lives in `client.ts`, which is the composition root and
 * is untested by design.
 */
export interface RoutesPort {
  /** Rows are `object` rather than `Record<string, unknown>`: the port does not
   *  care what the columns are, and requiring an index signature would force
   *  every typed row to be widened at the call site before it could be sent. */
  upsert: (
    table: string,
    rows: readonly object[],
  ) => Promise<{ error: { message: string } | null }>;
  select: (
    table: string,
    query: {
      readonly columns: string;
      readonly match?: Readonly<Record<string, string>>;
      readonly in?: { readonly column: string; readonly values: readonly string[] };
      readonly isNull?: string;
      readonly order?: { readonly column: string; readonly ascending: boolean };
      readonly limit?: number;
    },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  update: (
    table: string,
    values: Readonly<Record<string, unknown>>,
    match: Readonly<Record<string, string>>,
  ) => Promise<{ error: { message: string } | null }>;
  deleteRows: (
    table: string,
    match: Readonly<Record<string, string>>,
  ) => Promise<{ error: { message: string } | null }>;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const statusSchema = z.enum(ROUTE_STATUSES);
/**
 * The `stop_state` enum as the **database** has it, which is wider than what the
 * product still uses.
 *
 * `completed` and `skipped` were retired by
 * [ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md) and nothing
 * writes them any more, but every route driven before it still carries them.
 * Parsing them is what keeps those routes openable; `readStopState` is what
 * turns them into something this version has a branch for.
 */
const stopStateSchema = z.enum(['pending', 'completed', 'skipped', 'unreachable']);

const routeRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string().nullable(),
  status: statusSchema,
  is_round_trip: z.boolean(),
  origin_place_id: z.string().nullable(),
  origin_is_current_location: z.boolean(),
  optimized_at: z.string().nullable(),
  optimization_tier: z.string().nullable(),
  is_degraded: z.boolean(),
  total_distance_m: z.number().nullable(),
  total_duration_s: z.number().nullable(),
});

const stopRowSchema = z.object({
  id: z.string(),
  route_id: z.string(),
  place_id: z.string(),
  label: z.string().nullable(),
  note: z.string().nullable(),
  entry_order: z.number().int(),
  optimized_order: z.number().int().nullable(),
  state: stopStateSchema,
  leg_distance_m: z.number().nullable(),
  leg_duration_s: z.number().nullable(),
});

const loadedRouteRowSchema = routeRowSchema.extend({ updated_at: z.string() });

/**
 * A History row, with just enough of its stops to say which day it was.
 *
 * **It used to be a count and nothing else** — `stops(count)` — on the reasoning
 * that loading every stop of every route would make opening History cost more
 * than opening a route. That was right about the cost and wrong about the row: a
 * date, a number and a distance are identical across a week of rounds, and a
 * driver looking for last Tuesday had to open routes until they found it.
 *
 * Three small columns per stop is a different proposition from the whole row,
 * and the address comes with them for free through the foreign key
 * `stops.place_id` already has to `places_cache` — **our own cache, read
 * directly, no upstream call and no unit of quota**, exactly as the address book
 * reads it (`favourites-adapter.ts`). `places_cache` is null after the
 * thirty-day purge, which is why the embed is optional all the way down
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 */
const summaryStopSchema = z.object({
  place_id: z.string(),
  entry_order: z.number().int(),
  optimized_order: z.number().int().nullable(),
  places_cache: z.object({ formatted_address: z.string().nullable() }).nullable(),
});

const summaryRowSchema = routeRowSchema.extend({
  updated_at: z.string(),
  stops: z.array(summaryStopSchema).optional(),
});

const SUMMARY_STOP_COLUMNS =
  'stops(place_id,entry_order,optimized_order,places_cache(formatted_address))';

const ROUTE_COLUMNS =
  'id,user_id,name,status,is_round_trip,origin_place_id,origin_is_current_location,optimized_at,optimization_tier,is_degraded,total_distance_m,total_duration_s';
const STOP_COLUMNS =
  'id,route_id,place_id,label,note,entry_order,optimized_order,state,leg_distance_m,leg_duration_s';

// ─── The facade ──────────────────────────────────────────────────────────────

/**
 * Why a save did not happen.
 *
 * Named rather than thrown, because each of these has a different thing to say
 * to a driver and a different next action (`CLAUDE.md` §0 rule 5). `unknown-place`
 * in particular is not a generic failure: it means the stop's `place_id` has no
 * row in the shared cache yet, which is recoverable by resolving it.
 */
export type SaveFailure =
  | { readonly kind: 'offline' }
  | { readonly kind: 'not-permitted' }
  | { readonly kind: 'unknown-place' }
  | { readonly kind: 'illegal-transition'; readonly from: RouteStatus; readonly to: RouteStatus }
  | { readonly kind: 'failed' };

export type SaveOutcome =
  { readonly ok: true } | { readonly ok: false; readonly failure: SaveFailure };

export interface LoadedRoute {
  readonly draft: DraftRoute;
  readonly status: RouteStatus;
  readonly progress: RouteProgress | null;
}

export interface RoutesProvider {
  /** Write the route and its stops as they currently stand. Idempotent: the same
   *  draft saved twice produces one route and no duplicate stops. */
  save: (write: RouteWrite) => Promise<SaveOutcome>;
  list: (limit: number) => Promise<readonly SavedRouteSummary[] | null>;
  load: (routeId: string) => Promise<LoadedRoute | null>;
  /** Move the lifecycle forward. Refuses an illegal transition rather than
   *  writing it. */
  advance: (routeId: string, from: RouteStatus, to: RouteStatus) => Promise<SaveOutcome>;
}

export function createRoutesProvider(port: RoutesPort): RoutesProvider {
  return {
    save: async (write) => {
      trace({
        level: 'info',
        area: 'routes',
        event: 'save_start',
        data: {
          routeId: shortId(write.route.id),
          status: write.route.status,
          stopCount: write.stops.length,
          isRoundTrip: write.route.is_round_trip,
          originIsCurrentLocation: write.route.origin_is_current_location,
          hasTotals: write.route.total_distance_m !== null,
        },
      });
      const routeResult = await port.upsert('routes', [write.route]);
      if (routeResult.error !== null) {
        const failure = classify(routeResult.error);
        trace({
          level: 'error',
          area: 'routes',
          event: 'save_route_upsert_failed',
          data: {
            routeId: shortId(write.route.id),
            kind: failure.kind,
            message: routeResult.error.message,
          },
        });
        return { ok: false, failure };
      }

      // The route first, then its stops: `stops.route_id` references `routes`,
      // so the other order fails the foreign key on a route that is about to
      // exist. Two statements rather than one transaction because PostgREST has
      // no transaction across requests — which is survivable here, since the
      // next save replays both and the upsert makes the replay free.
      const removal = await port.deleteRows('stops', { route_id: write.route.id });
      if (removal.error !== null) {
        const failure = classify(removal.error);
        trace({
          level: 'error',
          area: 'routes',
          event: 'save_stops_delete_failed',
          data: {
            routeId: shortId(write.route.id),
            kind: failure.kind,
            message: removal.error.message,
          },
        });
        return { ok: false, failure };
      }

      if (write.stops.length > 0) {
        const stopsResult = await port.upsert('stops', write.stops);
        if (stopsResult.error !== null) {
          const failure = classify(stopsResult.error);
          trace({
            level: 'error',
            area: 'routes',
            event: 'save_stops_upsert_failed',
            data: {
              routeId: shortId(write.route.id),
              kind: failure.kind,
              message: stopsResult.error.message,
            },
          });
          return { ok: false, failure };
        }
      }

      trace({
        level: 'info',
        area: 'routes',
        event: 'save_ok',
        data: { routeId: shortId(write.route.id), status: write.route.status },
      });
      return { ok: true };
    },

    list: async (limit) => {
      trace({ level: 'debug', area: 'routes', event: 'list_start', data: { limit } });
      const { data, error } = await port.select('routes', {
        columns: `${ROUTE_COLUMNS},updated_at,${SUMMARY_STOP_COLUMNS}`,
        // Soft-deleted routes are gone from the user's point of view. The row
        // survives so a delete performed offline stays reconcilable
        // (docs/12_DATABASE.md).
        isNull: 'deleted_at',
        order: { column: 'updated_at', ascending: false },
        limit,
      });
      if (error !== null) {
        trace({
          level: 'error',
          area: 'routes',
          event: 'list_failed',
          data: { message: error.message },
        });
        return null;
      }

      const parsed = z.array(summaryRowSchema).safeParse(data);
      // A shape we did not expect is not an empty history. Null says "we could
      // not read this", which the screen shows as an error with a retry rather
      // than as "you have never saved a route".
      if (!parsed.success) {
        trace({
          level: 'error',
          area: 'routes',
          event: 'list_malformed',
          data: { issues: parsed.error.issues.length },
        });
        return null;
      }

      trace({
        level: 'debug',
        area: 'routes',
        event: 'list_ok',
        data: { count: parsed.data.length },
      });
      return parsed.data.map((row): SavedRouteSummary => {
        const stops = row.stops ?? [];
        return {
          routeId: row.id,
          name: row.name,
          status: row.status,
          stopCount: stops.length,
          isRoundTrip: row.is_round_trip,
          stops: stops.map((stop) => ({
            placeId: stop.place_id,
            entryOrder: stop.entry_order,
            optimizedOrder: stop.optimized_order,
            // Null once the purge has taken it, which is the ordinary state of
            // an old route rather than a failure.
            address: stop.places_cache?.formatted_address ?? null,
          })),
          isDegraded: row.is_degraded,
          distanceMeters: row.total_distance_m,
          durationSeconds: row.total_duration_s,
          updatedAt: row.updated_at,
        };
      });
    },

    load: async (routeId) => {
      trace({
        level: 'debug',
        area: 'routes',
        event: 'load_start',
        data: { routeId: shortId(routeId) },
      });
      const routeResponse = await port.select('routes', {
        // `updated_at` comes along because it is when the route last changed
        // status, and the change that matters is the one to `in_progress` — the
        // handoff. That instant is the route's start time (`progressFromRows`).
        columns: `${ROUTE_COLUMNS},updated_at`,
        match: { id: routeId },
        isNull: 'deleted_at',
      });
      if (routeResponse.error !== null) {
        trace({
          level: 'error',
          area: 'routes',
          event: 'load_route_failed',
          data: { routeId: shortId(routeId), message: routeResponse.error.message },
        });
        return null;
      }

      const routes = z.array(loadedRouteRowSchema).safeParse(routeResponse.data);
      const route = routes.success ? routes.data[0] : undefined;
      // A deep link to somebody else's route, or to one that was deleted, lands
      // here. RLS already returned nothing; this is what turns nothing into a
      // state the screen can show.
      if (route === undefined) {
        trace({
          level: routes.success ? 'warn' : 'error',
          area: 'routes',
          event: routes.success ? 'load_not_found' : 'load_route_malformed',
          data: { routeId: shortId(routeId) },
        });
        return null;
      }

      const stopsResponse = await port.select('stops', {
        columns: STOP_COLUMNS,
        match: { route_id: routeId },
      });
      if (stopsResponse.error !== null) {
        trace({
          level: 'error',
          area: 'routes',
          event: 'load_stops_failed',
          data: { routeId: shortId(routeId), message: stopsResponse.error.message },
        });
        return null;
      }

      const stops = z.array(stopRowSchema).safeParse(stopsResponse.data);
      if (!stops.success) {
        trace({
          level: 'error',
          area: 'routes',
          event: 'load_stops_malformed',
          data: { routeId: shortId(routeId), issues: stops.error.issues.length },
        });
        return null;
      }

      trace({
        level: 'debug',
        area: 'routes',
        event: 'load_ok',
        data: { routeId: shortId(routeId), stopCount: stops.data.length },
      });
      return {
        draft: fromRows(route, stops.data),
        status: route.status,
        progress: progressFromRows(route, route.updated_at),
      };
    },

    advance: async (routeId, from, to) => {
      // Refused here rather than written and regretted. The database has no
      // constraint for this — an enum column accepts any of its values — so the
      // state machine is only real if something enforces it.
      if (!canTransition(from, to)) {
        trace({
          level: 'warn',
          area: 'routes',
          event: 'advance_illegal_transition',
          data: { routeId: shortId(routeId), from, to },
        });
        return { ok: false, failure: { kind: 'illegal-transition', from, to } };
      }

      const values: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
      // Set once, when the route finishes, so "how long did Tuesday take" has an
      // answer that does not move every time the row is touched.
      if (to === 'completed') values['completed_at'] = new Date().toISOString();

      const { error } = await port.update('routes', values, { id: routeId });
      if (error === null) {
        trace({
          level: 'info',
          area: 'routes',
          event: 'advance_ok',
          data: { routeId: shortId(routeId), from, to },
        });
        return { ok: true };
      }
      const failure = classify(error);
      trace({
        level: 'error',
        area: 'routes',
        event: 'advance_failed',
        data: { routeId: shortId(routeId), from, to, kind: failure.kind, message: error.message },
      });
      return { ok: false, failure };
    },
  };
}

/**
 * What a Postgres error means to a driver.
 *
 * The codes are matched on the message because PostgREST reports them there and
 * in a `code` field the port deliberately does not expose — the point of this
 * function is that the taxonomy is ours, not Postgres's, and widening the port
 * to carry SQLSTATE would invite the rest of the app to switch on it.
 */
function classify(error: { message: string }): SaveFailure {
  const message = error.message.toLowerCase();

  // No radio. Distinguished because it is the one failure where the user's next
  // action is "nothing, it will sync" rather than "try again".
  if (message.includes('network') || message.includes('fetch')) return { kind: 'offline' };

  // A stop whose place has never been resolved server-side. Recoverable: opening
  // the route resolves it, and the next save succeeds.
  if (message.includes('foreign key') || message.includes('violates foreign key')) {
    return { kind: 'unknown-place' };
  }

  if (
    message.includes('row-level security') ||
    message.includes('policy') ||
    message.includes('permission denied') ||
    message.includes('42501')
  ) {
    return { kind: 'not-permitted' };
  }

  return { kind: 'failed' };
}

/** Re-exported so callers build a write without importing two modules to do it. */
export { toRows };
