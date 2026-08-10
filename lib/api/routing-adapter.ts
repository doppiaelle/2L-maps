import { z } from 'zod';

import { canOfferLocalFallback } from '@/lib/optimization/tier-selection';
import type {
  RoutingFailure,
  RoutingOutcome,
  RoutingProvider,
  RoutingRequest,
} from '@/lib/providers/types';
import type { Leg, OptimizationResult } from '@/types';

import type { ApiClient, ApiFailure } from './client';

/**
 * The concrete `RoutingProvider`, over our own Edge Functions.
 *
 * Its real job is the translation in `toRoutingFailure`. The client speaks the
 * transport's taxonomy; the product speaks in outcomes a screen can act on, and
 * the gap between them is where a user ends up looking at the wrong message —
 * told to retry when they need to subscribe, or offered a degraded result on a
 * route too long to degrade honestly.
 *
 * `canDegrade` is computed here rather than left to the caller. Every screen that
 * handles a routing failure would otherwise have to re-derive the stop-count rule,
 * and each copy is a place it can drift from ADR-0003.
 */

/**
 * One leg, as the server sends it.
 *
 * **The two ids are nullable, and requiring them was a total outage.** This
 * schema asked for `fromStopId` and `toStopId` as plain strings; the server had
 * never sent either. Zod refused every 200 the endpoint ever produced, the
 * client reported `MALFORMED_RESPONSE`, and the screen said "Could not optimize"
 * — while upstream had succeeded and the pipeline had already spent a unit of
 * the user's monthly allowance. Optimization failed one hundred per cent of the
 * time and left no error anywhere to find.
 *
 * The ids exist now, and they are nullable for the reason `Leg` documents: a
 * route can start somewhere that is not one of its stops
 * ([ADR-0023](../../docs/adr/0023-legs-name-their-stops.md)).
 */
const legSchema = z.object({
  fromStopId: z.string().nullable(),
  toStopId: z.string().nullable(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  polyline: z.string(),
});

/** The response contract of `/optimize` (docs/33_API_CONTRACTS.md). Deliberately
 *  a union: a degraded result cannot promise a duration, and a shared shape with
 *  an optional one would lose exactly that distinction. */
const optimizeResponseSchema = z.union([
  z.object({
    status: z.literal('complete'),
    tier: z.literal('T0'),
    isDegraded: z.literal(true),
    orderedStopIds: z.array(z.string()),
    totalDistanceMeters: z.number(),
  }),
  z.object({
    status: z.literal('complete'),
    tier: z.union([z.literal('T1'), z.literal('T2'), z.literal('T3')]),
    isDegraded: z.literal(false),
    orderedStopIds: z.array(z.string()),
    legs: z.array(legSchema),
    totalDistanceMeters: z.number(),
    totalDurationSeconds: z.number(),
    unreachableStopIds: z.array(z.string()),
  }),
  z.object({
    status: z.literal('pending'),
    jobId: z.string(),
  }),
]);

type OptimizeResponse = z.infer<typeof optimizeResponseSchema>;

export interface RoutingAdapterOptions {
  readonly client: ApiClient;
}

export function createRoutingProvider(options: RoutingAdapterOptions): RoutingProvider {
  const { client } = options;

  const call = async (
    path: string,
    body: unknown,
    stopCount: number,
    signal?: AbortSignal,
  ): Promise<RoutingOutcome> => {
    const result = await client.post(path, body, optimizeResponseSchema, signal);

    if (!result.ok) {
      return { ok: false, failure: toRoutingFailure(result.failure, stopCount) };
    }
    return toOutcome(result.data);
  };

  return {
    optimize: (request: RoutingRequest) =>
      call(
        '/optimize',
        {
          routeId: request.routeId,
          origin: {
            placeId: request.originPlaceId,
            isCurrentLocation: request.originPlaceId === null,
            latitude: request.originCoordinate?.latitude ?? null,
            longitude: request.originCoordinate?.longitude ?? null,
          },
          // Each stop carries the client's own id, because the reply names the
          // order with those ids. Sending only place ids would collapse two
          // stops at the same address into one, and two deliveries in the same
          // building is an ordinary Tuesday (docs/33_API_CONTRACTS.md).
          stops: request.stops.map((stop) => ({ stopId: stop.id, placeId: stop.placeId })),
          isRoundTrip: request.shape === 'round-trip',
          departureTime: request.departureTime?.toISOString() ?? null,
          idempotencyKey: request.idempotencyKey,
        },
        request.stops.length,
      ),

    awaitJob: (jobId: string, signal?: AbortSignal) =>
      // Stop count is unknown here, so degradation is not offered: suggesting a
      // local fallback for a route we cannot size would be a guess, and T0 above
      // its ceiling is worse than no result at all.
      call('/optimize/job', { jobId }, Number.POSITIVE_INFINITY, signal),
  };
}

function toOutcome(response: OptimizeResponse): RoutingOutcome {
  if (response.status === 'pending') {
    return { ok: 'pending', jobId: response.jobId };
  }

  if (response.isDegraded) {
    const result: OptimizationResult = {
      tier: 'T0',
      isDegraded: true,
      orderedStopIds: response.orderedStopIds,
      totalDistanceMeters: response.totalDistanceMeters,
    };
    return { ok: true, result };
  }

  const legs: readonly Leg[] = response.legs;
  return {
    ok: true,
    result: {
      tier: response.tier,
      isDegraded: false,
      orderedStopIds: response.orderedStopIds,
      legs,
      totalDistanceMeters: response.totalDistanceMeters,
      totalDurationSeconds: response.totalDurationSeconds,
      unreachableStopIds: response.unreachableStopIds,
    },
  };
}

/**
 * Translate a transport failure into something a screen can act on.
 *
 * The mapping is the point. `NO_ENTITLEMENT` must reach a paywall and not a retry
 * button; `RATE_LIMITED` and `QUOTA_EXHAUSTED` share an HTTP status and need
 * opposite messages — wait thirty seconds, or wait until next month.
 */
function toRoutingFailure(failure: ApiFailure, stopCount: number): RoutingFailure {
  const canDegrade = canOfferLocalFallback(stopCount, false);

  switch (failure.code) {
    case 'NO_ENTITLEMENT':
      return { kind: 'no-entitlement' };

    case 'QUOTA_EXHAUSTED':
      return {
        kind: 'quota-exhausted',
        resetsAt:
          typeof failure.details['resetsAt'] === 'string' ? failure.details['resetsAt'] : '',
      };

    case 'RATE_LIMITED':
      return {
        kind: 'rate-limited',
        retryAfterSeconds:
          typeof failure.details['retryAfterSeconds'] === 'number'
            ? failure.details['retryAfterSeconds']
            : 30,
      };

    case 'INVALID_REQUEST':
      // The server rejected the shape. The only cause a user can act on is the
      // stop count, so that is what is reported; anything else is our defect and
      // alerts rather than being explained to them.
      return {
        kind: 'invalid-route',
        reason: stopCount > 0 && !canDegrade ? 'too-many-stops' : 'too-few-stops',
      };

    case 'NETWORK_UNAVAILABLE':
      return { kind: 'offline', canDegrade };

    case 'UPSTREAM_TIMEOUT':
    case 'UPSTREAM_UNAVAILABLE':
    case 'MALFORMED_RESPONSE':
    case 'INTERNAL':
    case 'UNAUTHENTICATED':
    case 'MISSING_SESSION_TOKEN':
    case 'PARTIAL_RESULT':
    default:
      return { kind: 'upstream-unavailable', canDegrade };
  }
}
