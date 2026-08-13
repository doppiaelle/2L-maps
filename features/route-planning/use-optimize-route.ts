import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useServices } from '@/features/api/services-provider';
import { useLocation } from '@/features/location/location-provider';
import { USAGE_QUOTA_QUERY_KEY } from '@/features/quota/use-usage-quota';
import { useDraftRouteStore, useUiStore } from '@/features/stores';
import type { RoutingFailure, RoutingOutcome } from '@/lib/providers/types';
import { idempotencyKeyFor } from '@/lib/route/idempotency';
import { stopsForEndpointChoice } from '@/lib/route/route-ends';

/**
 * Optimizing the current draft.
 *
 * **The order on screen is never touched until a result arrives**, and never at
 * all if one does not ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 * There is no optimistic reorder here on purpose: a route that rearranged itself
 * and then failed would leave the driver holding an order nobody chose, and
 * "undo the optimistic update" is exactly the code path that goes wrong under a
 * timeout.
 *
 * **The idempotency key is per attempt, not per retry.** A retry after a timeout
 * must reach the same key or it is a second billed call for the same work
 * ([`docs/33_API_CONTRACTS.md`](../../docs/33_API_CONTRACTS.md)); a *new*
 * attempt after an edit must not, or the server would answer with the previous
 * route's result.
 *
 * The quota is invalidated on success rather than decremented locally. The
 * server counts, and a client that keeps its own tally will eventually disagree
 * with the number the user is actually being held to
 * ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md)).
 */

export interface OptimizeState {
  optimize: () => void;
  readonly isOptimizing: boolean;
  /** The last failure, kept until the next attempt so the screen can explain
   *  rather than merely stop showing a spinner. */
  readonly failure: RoutingFailure | null;
  clearFailure: () => void;
}

export function useOptimizeRoute(): OptimizeState {
  const services = useServices();
  const queryClient = useQueryClient();

  const draft = useDraftRouteStore((store) => store.draft);
  const applyResult = useDraftRouteStore((store) => store.applyResult);
  const setOptimizing = useUiStore((store) => store.setOptimizing);
  const location = useLocation();

  // Only for a draft that actually starts from the device, and only from a fix
  // `locationStateOf` has already judged fresh and accurate enough to route
  // from. A stale one would optimize the journey from a street the van left
  // four minutes ago and report the result as exact.
  const origin =
    draft.originIsCurrentLocation && location.state.kind === 'ready'
      ? location.state.location.coordinate
      : null;
  const requestStops = stopsForEndpointChoice(draft.stops, {
    start: draft.routeStart,
    end: draft.routeEnd,
  });

  const mutation = useMutation<RoutingOutcome, Error, void>({
    mutationFn: async () => {
      if (services === null) {
        return { ok: false, failure: { kind: 'upstream-unavailable', canDegrade: false } };
      }

      return services.routing.optimize({
        routeId: draft.routeId,
        originPlaceId: draft.originPlaceId,
        // Sent when the route starts from the device, and only then. This was
        // hard-coded null, so a draft whose origin was the current location
        // reached the server with neither a place nor a position and was
        // refused as a client defect — which it was.
        originCoordinate: origin,
        // The client id travels with the place id: two deliveries in the same
        // building are two stops, and sending place ids alone would collapse
        // them into one.
        stops: requestStops.map((stop) => ({ id: stop.id, placeId: stop.placeId })),
        shape: draft.shape,
        departureTime: null,
        // Endpoint semantics and the live origin belong to the work identity.
        // Without them a first-stop route and a current-location route over the
        // same stops can receive one another's cached optimization.
        idempotencyKey: idempotencyKeyFor({ ...draft, stops: requestStops }, origin),
      });
    },

    onMutate: () => {
      // Drives the control's progress state, never a blocking overlay — the map
      // stays usable while the request is in flight.
      setOptimizing(true);
    },

    onSettled: () => {
      setOptimizing(false);
    },

    onSuccess: (outcome) => {
      if (outcome.ok !== true) return;

      // The whole result, not just the order: the geometry is what the map
      // draws, and it is held in memory rather than persisted (ADR-0007).
      applyResult(outcome.result);

      // The server counts; we re-read rather than decrement. A local tally
      // eventually disagrees with the number the user is held to.
      void queryClient.invalidateQueries({ queryKey: USAGE_QUOTA_QUERY_KEY });
    },
  });

  const optimize = useCallback(() => {
    mutation.mutate();
  }, [mutation]);

  const clearFailure = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  const outcome = mutation.data;
  const failure =
    outcome !== undefined && outcome.ok === false
      ? outcome.failure
      : mutation.isError
        ? // A thrown error is our defect, not a condition the user caused, and
          // it is reported as an upstream failure rather than surfaced raw.
          ({ kind: 'upstream-unavailable', canDegrade: false } as const)
        : null;

  return { optimize, isOptimizing: mutation.isPending, failure, clearFailure };
}
