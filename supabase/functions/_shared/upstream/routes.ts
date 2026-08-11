import { logGoogleRefusal, readGoogleError } from './google-error.ts';

/**
 * The Google Routes API adapter — tier T1.
 *
 * Two calls, not one, and the reason is a documented incompatibility rather than
 * a preference: `optimizeWaypointOrder` cannot be combined with
 * `TRAFFIC_AWARE_OPTIMAL` (docs/33_API_CONTRACTS.md §8). So phase one asks for
 * the order under `TRAFFIC_AWARE`, and phase two asks for accurate geometry and
 * timing over that fixed order under `TRAFFIC_AWARE_OPTIMAL`.
 *
 * **The field mask is the bill.** Google prices this call by which fields are
 * requested, so a mask is mandatory and every field in it is a deliberate
 * purchase. Phase one asks for exactly one field — the optimized order — because
 * anything else would pay Pro-tier prices for data phase two is about to fetch
 * properly. Widening either mask is a cost change and belongs in a review, not
 * in a convenience commit.
 *
 * `fetchImpl` is injected because this environment cannot reach Google
 * (docs/36_IMPLEMENTATION_PLAN.md), so the contract is verified against recorded
 * shapes rather than against the live service. That limit is real and is
 * recorded rather than papered over: these tests prove we send what we intend
 * and parse what we expect, not that Google agrees.
 */

/** Phase one buys the order and nothing else. */
export const FIELD_MASK_ORDER = 'routes.optimizedIntermediateWaypointIndex';

/** Phase two buys the geometry and timing the client actually renders. */
export const FIELD_MASK_DETAIL =
  'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline';

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * A point on a route, as either of the two things Google accepts.
 *
 * A discriminated union rather than one type with an optional `placeId`
 * (`CLAUDE.md` §3): a waypoint is one or the other, never both and never
 * neither, and an optional field would make "no place and no coordinate" a
 * representable state that every reader has to check for.
 *
 * The coordinate form exists for one caller — a route starting from where the
 * driver is standing. That origin has no `place_id` and never will: it is a
 * position, not a place, and reverse-geocoding it to invent one would spend a
 * billed lookup to produce a worse answer than the coordinate we already hold.
 */
export type RoutesWaypoint =
  | { readonly kind: 'place'; readonly placeId: string }
  | { readonly kind: 'coordinate'; readonly latitude: number; readonly longitude: number };

export interface RoutesRequest {
  readonly origin: RoutesWaypoint;
  readonly destination: RoutesWaypoint;
  readonly intermediates: readonly RoutesWaypoint[];
  readonly departureTime: string | null;
}

export interface RoutesLeg {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly polyline: string;
}

export interface RoutesResult {
  /** Positions of the intermediates in optimized order, as Google returned them. */
  readonly optimizedOrder: readonly number[];
  readonly totalDistanceMeters: number;
  readonly totalDurationSeconds: number;
  readonly legs: readonly RoutesLeg[];
}

export type RoutesFailure =
  | { readonly kind: 'unreachable'; readonly retryable: true }
  | { readonly kind: 'timeout'; readonly retryable: true }
  /** Google understood us and refused. Our defect — never retried, always alerted. */
  | {
      readonly kind: 'rejected';
      readonly retryable: false;
      readonly status: number;
      /** Google's own enum. `INVALID_ARGUMENT` is a request we built wrong;
       *  `PERMISSION_DENIED` is a key or an API that is not enabled. Same
       *  status code, opposite fixes. */
      readonly googleStatus?: string;
    }
  /** A 200 whose body does not match what the contract describes. */
  | { readonly kind: 'malformed'; readonly retryable: false }
  /** Every waypoint resolved but no route connects them — an island, a closed
   *  border. A real answer, not an error, and the caller reports it as such. */
  | { readonly kind: 'no-route'; readonly retryable: false };

export type RoutesOutcome =
  | { readonly ok: true; readonly result: RoutesResult }
  | { readonly ok: false; readonly failure: RoutesFailure };

export interface RoutesAdapterOptions {
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
  /** Shorter than the function's own deadline, so we always return something
   *  rather than being killed by the platform mid-call. */
  readonly timeoutMs?: number;
}

export const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

export function createRoutesAdapter(options: RoutesAdapterOptions) {
  const { apiKey, fetchImpl } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;

  const call = async (
    body: unknown,
    fieldMask: string,
    /** Coordinates this request carried. A latitude and longitude locate a
     *  person, and Google's message can quote the request back. */
    redact: readonly string[] = [],
  ): Promise<CallOutcome> => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(ROUTES_ENDPOINT, {
        method: 'POST',
        signal: timeout.signal,
        headers: {
          'content-type': 'application/json',
          // The key is a header, never a query parameter: a URL reaches access
          // logs and error messages, and this key bills us (CLAUDE.md §9).
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      });
    } catch {
      return {
        ok: false,
        failure: timeout.signal.aborted
          ? { kind: 'timeout', retryable: true }
          : { kind: 'unreachable', retryable: true },
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // A 4xx here is our request being wrong, and we built it — retrying burns
      // quota and hides the bug (docs/33_API_CONTRACTS.md §9).
      //
      // **Which is why the body is read.** "Our request is wrong" is not a
      // diagnosis, and optimization has now failed for three different reasons
      // that all looked like this one. Google names the offending field; the
      // coordinates in it are stripped first (`google-error.ts`).
      const body: unknown = await response.json().catch(() => null);
      const error = readGoogleError(body, redact);
      logGoogleRefusal(ROUTES_ENDPOINT, response.status, error);

      return {
        ok: false,
        failure:
          response.status >= 500
            ? { kind: 'unreachable', retryable: true }
            : {
                kind: 'rejected',
                retryable: false,
                status: response.status,
                ...(error === null ? {} : { googleStatus: error.status }),
              },
      };
    }

    const payload: unknown = await response.json().catch(() => null);
    return { ok: true, payload };
  };

  return {
    /** Phase one: what order should these stops be visited in. */
    optimizeOrder: async (request: RoutesRequest): Promise<OrderOutcome> => {
      const outcome = await call(
        {
          ...toWaypoints(request),
          travelMode: 'DRIVE',
          // NOT `TRAFFIC_AWARE_OPTIMAL` — incompatible with
          // `optimizeWaypointOrder`, and combining them is a 400.
          routingPreference: 'TRAFFIC_AWARE',
          optimizeWaypointOrder: true,
          ...(request.departureTime === null ? {} : { departureTime: request.departureTime }),
        },
        FIELD_MASK_ORDER,
        coordinatesIn(request),
      );

      if (!outcome.ok) return outcome;

      const order = readOptimizedOrder(outcome.payload, request.intermediates.length);
      if (order === null) {
        return { ok: false, failure: { kind: 'no-route', retryable: false } };
      }
      return { ok: true, order };
    },

    /** Phase two: accurate distance, duration and geometry over a fixed order. */
    detailFor: async (request: RoutesRequest): Promise<DetailOutcome> => {
      const outcome = await call(
        {
          ...toWaypoints(request),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
          // Deliberately absent. The order is already decided; asking again
          // would both cost more and risk a different answer.
          ...(request.departureTime === null ? {} : { departureTime: request.departureTime }),
        },
        FIELD_MASK_DETAIL,
        coordinatesIn(request),
      );

      if (!outcome.ok) return outcome;

      const detail = readDetail(outcome.payload);
      if (detail === null) {
        return { ok: false, failure: { kind: 'no-route', retryable: false } };
      }
      return { ok: true, detail };
    },
  };
}

type CallOutcome =
  | { readonly ok: true; readonly payload: unknown }
  | { readonly ok: false; readonly failure: RoutesFailure };

type OrderOutcome =
  | { readonly ok: true; readonly order: readonly number[] }
  | { readonly ok: false; readonly failure: RoutesFailure };

type DetailOutcome =
  | { readonly ok: true; readonly detail: Omit<RoutesResult, 'optimizedOrder'> }
  | { readonly ok: false; readonly failure: RoutesFailure };

function toWaypoints(request: RoutesRequest) {
  return {
    origin: toWaypoint(request.origin),
    destination: toWaypoint(request.destination),
    intermediates: request.intermediates.map(toWaypoint),
  };
}

/** Google's two waypoint shapes, from ours. Its `location.latLng` nesting is the
 *  one place the upstream's vocabulary is allowed to appear. */
/**
 * Every coordinate this request carries, as the strings a message would quote.
 *
 * Place ids are omitted deliberately: an id is a public identifier that names a
 * building and not a person ([ADR-0007](../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)),
 * and it is the single most useful thing to have in a log when Google refuses
 * one. A coordinate is the opposite on both counts.
 */
function coordinatesIn(request: RoutesRequest): readonly string[] {
  return [request.origin, request.destination, ...request.intermediates].flatMap((waypoint) =>
    waypoint.kind === 'coordinate' ? [String(waypoint.latitude), String(waypoint.longitude)] : [],
  );
}

function toWaypoint(waypoint: RoutesWaypoint) {
  if (waypoint.kind === 'place') return { placeId: waypoint.placeId };
  return {
    location: { latLng: { latitude: waypoint.latitude, longitude: waypoint.longitude } },
  };
}

/**
 * Read the optimized order, and refuse anything that is not a permutation.
 *
 * This check is the difference between a reordered route and a silently dropped
 * stop. A response missing an index, or repeating one, would produce a route
 * that looks complete and is not — the failure mode this product cannot have
 * (`CLAUDE.md` §0 rule 5).
 */
function readOptimizedOrder(payload: unknown, expected: number): readonly number[] | null {
  // **Before the payload is read at all.** With nothing to reorder there is no
  // order to find, and phase one asks for a field mask of exactly one field —
  // `optimizedIntermediateWaypointIndex` — which Google has nothing to populate.
  // The answer can legitimately be `{}` or `{"routes":[]}`, and `firstRoute`
  // returns null for both. Checking the payload first turned the shortest
  // possible route, two stops with a direct hop between them, into `no-route`
  // and then into "Could not optimize" on screen.
  if (expected === 0) return [];

  const route = firstRoute(payload);
  if (route === null) return null;

  const raw = route['optimizedIntermediateWaypointIndex'];
  if (!Array.isArray(raw) || raw.length !== expected) return null;

  const order: number[] = [];
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    if (value < 0 || value >= expected || seen.has(value)) return null;
    seen.add(value);
    order.push(value);
  }
  return order;
}

function readDetail(payload: unknown): Omit<RoutesResult, 'optimizedOrder'> | null {
  const route = firstRoute(payload);
  if (route === null) return null;

  const totalDistanceMeters = readNumber(route['distanceMeters']);
  const totalDurationSeconds = readDuration(route['duration']);
  if (totalDistanceMeters === null || totalDurationSeconds === null) return null;

  const rawLegs = route['legs'];
  if (!Array.isArray(rawLegs)) return null;

  const legs: RoutesLeg[] = [];
  for (const rawLeg of rawLegs) {
    if (typeof rawLeg !== 'object' || rawLeg === null) return null;
    const leg = rawLeg as Record<string, unknown>;

    const distanceMeters = readNumber(leg['distanceMeters']);
    const durationSeconds = readDuration(leg['duration']);
    const polyline = readPolyline(leg['polyline']);
    if (distanceMeters === null || durationSeconds === null || polyline === null) return null;

    legs.push({ distanceMeters, durationSeconds, polyline });
  }

  return { totalDistanceMeters, totalDurationSeconds, legs };
}

function firstRoute(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const routes = (payload as Record<string, unknown>)['routes'];
  // An empty `routes` array is Google's way of saying every waypoint resolved
  // and nothing connects them. A real answer, and the caller says so.
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const first = routes[0];
  return typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Google returns durations as protobuf strings — `"1234s"`, not `1234`. */
function readDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (match === null) return null;
  const seconds = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

function readPolyline(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const encoded = (value as Record<string, unknown>)['encodedPolyline'];
  return typeof encoded === 'string' ? encoded : null;
}
