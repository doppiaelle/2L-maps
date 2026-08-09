import { ApiError } from '../errors';
import type { RoutesFailure, RoutesRequest } from '../upstream/routes';
import type { OptimizeRequest } from '../schemas';
import type { UpstreamOutcome } from '../pipeline';

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
  readonly legs: readonly { distanceMeters: number; durationSeconds: number; polyline: string }[];
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
  const originPlaceId = request.origin.placeId;
  if (originPlaceId === null) {
    // A current-location origin is resolved to a place client-side before it
    // gets here. Arriving without either is a client defect, not a user error.
    throw new ApiError('INVALID_REQUEST', 'Something went wrong on our side');
  }

  const stops = request.stops;
  const last = stops[stops.length - 1];
  if (last === undefined) {
    throw new ApiError('INVALID_REQUEST', 'Something went wrong on our side');
  }

  // The stops that may be reordered, paired with their client ids so the reply
  // can name them.
  const movable = request.isRoundTrip ? stops : stops.slice(0, -1);
  const destinationPlaceId = request.isRoundTrip ? originPlaceId : last.placeId;

  const base: RoutesRequest = {
    origin: { placeId: originPlaceId },
    destination: { placeId: destinationPlaceId },
    intermediates: movable.map((stop) => ({ placeId: stop.placeId })),
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
    intermediates: orderedStops.map((stop) => ({ placeId: stop.placeId })),
  });
  if (!detail.ok) throw toApiError(detail.failure);

  // A one-way route finishes at the stop the user put last, and it keeps that
  // position in the reply.
  const orderedStopIds = request.isRoundTrip
    ? orderedStops.map((stop) => stop.stopId)
    : [...orderedStops.map((stop) => stop.stopId), last.stopId];

  return {
    result: {
      status: 'complete',
      tier: 'T1',
      isDegraded: false,
      orderedStopIds,
      legs: detail.detail.legs,
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
      return new ApiError('INTERNAL', 'Something went wrong on our side');
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
