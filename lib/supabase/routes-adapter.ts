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

const summaryRowSchema = routeRowSchema.extend({
  updated_at: z.string(),
  // PostgREST returns an aggregate relationship as an array of one object.
  stops: z.array(z.object({ count: z.number().int() })).optional(),
});

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
      const routeResult = await port.upsert('routes', [write.route]);
      if (routeResult.error !== null) return { ok: false, failure: classify(routeResult.error) };

      // The route first, then its stops: `stops.route_id` references `routes`,
      // so the other order fails the foreign key on a route that is about to
      // exist. Two statements rather than one transaction because PostgREST has
      // no transaction across requests — which is survivable here, since the
      // next save replays both and the upsert makes the replay free.
      const removal = await port.deleteRows('stops', { route_id: write.route.id });
      if (removal.error !== null) return { ok: false, failure: classify(removal.error) };

      if (write.stops.length > 0) {
        const stopsResult = await port.upsert('stops', write.stops);
        if (stopsResult.error !== null) return { ok: false, failure: classify(stopsResult.error) };
      }

      return { ok: true };
    },

    list: async (limit) => {
      const { data, error } = await port.select('routes', {
        columns: `${ROUTE_COLUMNS},updated_at,stops(count)`,
        // Soft-deleted routes are gone from the user's point of view. The row
        // survives so a delete performed offline stays reconcilable
        // (docs/12_DATABASE.md).
        isNull: 'deleted_at',
        order: { column: 'updated_at', ascending: false },
        limit,
      });
      if (error !== null) return null;

      const parsed = z.array(summaryRowSchema).safeParse(data);
      // A shape we did not expect is not an empty history. Null says "we could
      // not read this", which the screen shows as an error with a retry rather
      // than as "you have never saved a route".
      if (!parsed.success) return null;

      return parsed.data.map((row): SavedRouteSummary => ({
        routeId: row.id,
        name: row.name,
        status: row.status,
        stopCount: row.stops?.[0]?.count ?? 0,
        isDegraded: row.is_degraded,
        distanceMeters: row.total_distance_m,
        durationSeconds: row.total_duration_s,
        updatedAt: row.updated_at,
      }));
    },

    load: async (routeId) => {
      const routeResponse = await port.select('routes', {
        columns: ROUTE_COLUMNS,
        match: { id: routeId },
        isNull: 'deleted_at',
      });
      if (routeResponse.error !== null) return null;

      const routes = z.array(routeRowSchema).safeParse(routeResponse.data);
      const route = routes.success ? routes.data[0] : undefined;
      // A deep link to somebody else's route, or to one that was deleted, lands
      // here. RLS already returned nothing; this is what turns nothing into a
      // state the screen can show.
      if (route === undefined) return null;

      const stopsResponse = await port.select('stops', {
        columns: STOP_COLUMNS,
        match: { route_id: routeId },
      });
      if (stopsResponse.error !== null) return null;

      const stops = z.array(stopRowSchema).safeParse(stopsResponse.data);
      if (!stops.success) return null;

      return {
        draft: fromRows(route, stops.data),
        status: route.status,
        progress: progressFromRows(route, stops.data),
      };
    },

    advance: async (routeId, from, to) => {
      // Refused here rather than written and regretted. The database has no
      // constraint for this — an enum column accepts any of its values — so the
      // state machine is only real if something enforces it.
      if (!canTransition(from, to)) {
        return { ok: false, failure: { kind: 'illegal-transition', from, to } };
      }

      const values: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
      // Set once, when the route finishes, so "how long did Tuesday take" has an
      // answer that does not move every time the row is touched.
      if (to === 'completed') values['completed_at'] = new Date().toISOString();

      const { error } = await port.update('routes', values, { id: routeId });
      return error === null ? { ok: true } : { ok: false, failure: classify(error) };
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

  if (message.includes('row-level security') || message.includes('policy')) {
    return { kind: 'not-permitted' };
  }

  return { kind: 'failed' };
}

/** Re-exported so callers build a write without importing two modules to do it. */
export { toRows };
