import { ApiError } from '../errors.ts';
import type { RoutesFailure, RoutesRequest, RoutesWaypoint } from '../upstream/routes.ts';
import type { OptimizeRequest } from '../schemas.ts';
import type { UpstreamOutcome } from '../pipeline.ts';

/**
 * `/optimize`'s upstream step, kept out of the entrypoint so it is type-checked
 * and tested.
 *
 * The entrypoint files are excluded from `tsc` because they import Deno globals,
 * which means anything written there is unchecked by construction — a nonsense
 * property name sails straight through. So the rule is not "entrypoints should
 * be thin"; it is that an entrypoint may contain **no decisions at all**. Every
 * one of them lives here.
 *
 * The decision that matters is mapping Google's answer back onto our stops.
 * Google returns an array of *positions* into the intermediates we sent, and
 * turning those into stop ids is exactly where a route silently loses a stop.
 * The adapter has already refused anything that is not a permutation; this
 * module keeps the correspondence intact.
 */

export interface OptimizeResult {
  readonly status: 'complete';
  readonly tier: 'T1';
  readonly isDegraded: false;
  readonly orderedStopIds: readonly string[];
  /**
   * One per hop, in travelling order, each naming the stops it runs between.
   *
   * **The two ids were missing and the client required them**, so every
   * successful response was rejected as malformed and optimization failed
   * completely ([ADR-0023](../../../docs/adr/0023-legs-name-their-stops.md)).
   * They are nullable because a route can begin somewhere that is not a stop.
   */
  readonly legs: readonly {
    fromStopId: string | null;
    toStopId: string | null;
    distanceMeters: number;
    durationSeconds: number;
    polyline: string;
  }[];
  readonly totalDistanceMeters: number;
  readonly totalDurationSeconds: number;
  readonly unreachableStopIds: readonly string[];
}

export interface RoutesPort {
  optimizeOrder: (
    request: RoutesRequest,
  ) => Promise<{ ok: true; order: readonly number[] } | { ok: false; failure: RoutesFailure }>;
  detailFor: (request: RoutesRequest) => Promise<
    | {
        ok: true;
        detail: {
          totalDistanceMeters: number;
          totalDurationSeconds: number;
          legs: readonly { distanceMeters: number; durationSeconds: number; polyline: string }[];
        };
      }
    | { ok: false; failure: RoutesFailure }
  >;
}

/**
 * Shape the route, ask for the order, then ask for detail over that order.
 *
 * A round trip returns to the origin, so every stop is an intermediate. A
 * one-way route ends at the last stop, so that one is the destination and is not
 * reordered — the user chose where they finish.
 */
export async function optimizeUpstream(
  request: OptimizeRequest,
  routes: RoutesPort,
): Promise<UpstreamOutcome<OptimizeResult>> {
  const stops = request.stops;
  const last = stops[stops.length - 1];
  const first = stops[0];
  if (last === undefined || first === undefined) {
    throw new ApiError('INVALID_REQUEST', 'Something went wrong on our side');
  }

  /**
   * Where the route starts: a saved place, the device, or the first stop.
   *
   * All three of these were previously one line that threw. The rule it stated
   * — "a current-location origin is resolved to a place client-side before it
   * gets here" — was a rule nothing implemented and nothing could: a position on
   * a road has no `place_id`, and reverse-geocoding one would spend a billed
   * lookup to turn a precise coordinate into a nearby approximation. Google's
   * Routes API takes a coordinate waypoint directly, so it is sent as one.
   *
   * **The third case is why optimization could fail for a route that looked
   * perfectly ordinary.** An empty draft is created with
   * `originIsCurrentLocation: true` and no place, so a user who added stops and
   * pressed Optimize without ever choosing a starting point sent an origin that
   * was neither — and got "something went wrong on our side" for a request that
   * was entirely reasonable. Starting from the first stop is what the user meant
   * by not choosing: order the places I gave you, beginning with the one I gave
   * you first. It is also the documented fallback when location is denied
   * (docs/18_PERMISSIONS.md §4) — nothing is blocked.
   */
  const origin = originWaypoint(request.origin, first);
  // Consumed as the origin rather than as a waypoint, so it must not also be
  // offered for reordering — a stop sent twice comes back twice.
  const isOriginTheFirstStop = request.origin.placeId === null && !hasCoordinate(request.origin);

  // The stops that may be reordered, paired with their client ids so the reply
  // can name them.
  const routable = isOriginTheFirstStop ? stops.slice(1) : stops;
  const movable = request.isRoundTrip ? routable : routable.slice(0, -1);
  // A round trip ends where it started, which is now a waypoint rather than an
  // id — including when where it started is a coordinate.
  const destination: RoutesWaypoint = request.isRoundTrip
    ? origin
    : { kind: 'place', placeId: last.placeId };

  const base: RoutesRequest = {
    origin,
    destination,
    intermediates: movable.map((stop) => ({ kind: 'place' as const, placeId: stop.placeId })),
    departureTime: request.departureTime ?? null,
  };

  const ordered = await routes.optimizeOrder(base);
  if (!ordered.ok) throw toApiError(ordered.failure);

  // The order is positions into `movable`. Both mappings below use it, and they
  // must agree — the ids we report and the waypoints we price have to describe
  // the same journey.
  const orderedStops = ordered.order.map((index) => movable[index]).filter(isPresent);
  if (orderedStops.length !== movable.length) {
    // The adapter validates the permutation, so reaching here means the two
    // checks disagree. Failing loudly beats returning a shorter route that
    // looks complete.
    // `INTERNAL` rather than a malformed-response code: from the client's side
    // this is our server failing, and the taxonomy it reads has no separate
    // entry for "our two internal checks disagreed" (docs/33_API_CONTRACTS.md §6).
    throw new ApiError('INTERNAL', 'Something went wrong on our side');
  }

  const detail = await routes.detailFor({
    ...base,
    intermediates: orderedStops.map((stop) => ({ kind: 'place' as const, placeId: stop.placeId })),
  });
  if (!detail.ok) throw toApiError(detail.failure);

  // A one-way route finishes at the stop the user put last, and it keeps that
  // position in the reply. A route that started from its own first stop keeps
  // that one at the front: it is a stop the user is visiting, not merely a
  // co-ordinate the journey began at, and dropping it from the reply would
  // silently shorten the route by one.
  const orderedStopIds = [
    ...(isOriginTheFirstStop ? [first.stopId] : []),
    ...orderedStops.map((stop) => stop.stopId),
    ...(request.isRoundTrip ? [] : [last.stopId]),
  ];

  /**
   * The journey as a sequence of waypoints, so each leg can name its ends.
   *
   * Not the same list as `orderedStopIds`: the origin appears here whether or
   * not it is a stop, and a round trip ends back at it. Google returns one leg
   * per hop in this order, so `legs[i]` runs from `waypoints[i]` to
   * `waypoints[i + 1]`.
   */
  const originStopId = isOriginTheFirstStop ? first.stopId : null;
  const waypoints: (string | null)[] = [
    originStopId,
    ...orderedStops.map((stop) => stop.stopId),
    request.isRoundTrip ? originStopId : last.stopId,
  ];

  return {
    result: {
      status: 'complete',
      tier: 'T1',
      isDegraded: false,
      orderedStopIds,
      legs: attributeLegs(detail.detail.legs, waypoints),
      totalDistanceMeters: detail.detail.totalDistanceMeters,
      totalDurationSeconds: detail.detail.totalDurationSeconds,
      unreachableStopIds: [],
    },
    tier: 'T1',
    // One request regardless of stop count: T1 bills per call, which is the
    // whole reason the cascade stays here until 25 stops (ADR-0003).
    units: 1,
  };
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Say which stops each leg runs between.
 *
 * `legs[i]` joins `waypoints[i]` to `waypoints[i + 1]`, so a journey of *n*
 * waypoints has *n − 1* legs. When it does not — a shape of response nothing in
 * the contract describes — **every attribution is dropped rather than shifted**.
 * A leg misaligned by one would put the Rome–Milan distance on the hop from the
 * depot to the first delivery, and it would look entirely plausible on screen.
 * Nulls are recoverable; a confident wrong answer is not (`CLAUDE.md` §0 rule 5).
 *
 * The legs themselves are always returned: the ordering is what the user asked
 * for, and withholding a correct route because we could not label its segments
 * would trade a real answer for a cosmetic one.
 */
function attributeLegs(
  legs: readonly { distanceMeters: number; durationSeconds: number; polyline: string }[],
  waypoints: readonly (string | null)[],
): OptimizeResult['legs'] {
  const isAligned = legs.length === waypoints.length - 1;

  return legs.map((leg, index) => ({
    ...leg,
    fromStopId: isAligned ? (waypoints[index] ?? null) : null,
    toStopId: isAligned ? (waypoints[index + 1] ?? null) : null,
  }));
}

/**
 * The origin the client asked for, as a waypoint.
 *
 * A `place_id` wins where there is one: it is the durable key and it survives a
 * route being reopened next week ([ADR-0007](../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * A device coordinate comes next, used exactly as sent. The first stop is the
 * last resort, and it is a resort rather than an error — see the caller.
 */
function originWaypoint(
  origin: OptimizeRequest['origin'],
  firstStop: { readonly placeId: string },
): RoutesWaypoint {
  if (origin.placeId !== null) return { kind: 'place', placeId: origin.placeId };

  if (hasCoordinate(origin)) {
    return { kind: 'coordinate', latitude: origin.latitude, longitude: origin.longitude };
  }

  return { kind: 'place', placeId: firstStop.placeId };
}

/**
 * Whether the origin carries a usable position.
 *
 * Both halves or neither. A request with a latitude and no longitude is a client
 * defect, and treating it as "half a position" would route from the equator.
 */
function hasCoordinate(
  origin: OptimizeRequest['origin'],
): origin is OptimizeRequest['origin'] & { latitude: number; longitude: number } {
  return typeof origin.latitude === 'number' && typeof origin.longitude === 'number';
}

/**
 * Translate an upstream failure into the taxonomy, and set the degradation hint.
 *
 * `T0_AVAILABLE` is what lets the client offer the local solver instead of a
 * dead end. It is absent from `no-route` on purpose: no ordering algorithm
 * connects places that are not connected, so offering one would waste the user's
 * time on a second failure.
 */
function toApiError(failure: RoutesFailure): ApiError {
  switch (failure.kind) {
    case 'no-route':
      return new ApiError('INVALID_REQUEST', 'No route connects these stops');
    case 'timeout':
      return new ApiError('UPSTREAM_TIMEOUT', 'That took too long', {
        degradationHint: 'T0_AVAILABLE',
      });
    case 'rejected':
      // Google understood us and refused: our request was wrong, and we built
      // it. Reported as ours and alerted on, never retried.
      //
      // **The status is carried through.** It was being discarded, so a revoked
      // key (403), a Routes API that was never enabled on the project (403) and
      // a malformed waypoint (400) all logged as a bare `INTERNAL` with an empty
      // `details` — which is the exact opposite of what the logging work was
      // for. The number is Google's HTTP status and nothing else: no body, no
      // key, no address.
      return new ApiError('INTERNAL', 'Something went wrong on our side', {
        details: { upstreamStatus: failure.status },
      });
    case 'malformed':
      // Google answered 200 in a shape the contract does not describe. Ours to
      // fix, so it alerts rather than asking the user to try again.
      return new ApiError('INTERNAL', 'Something went wrong on our side');
    case 'unreachable':
    default:
      return new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the routing service', {
        degradationHint: 'T0_AVAILABLE',
      });
  }
}
