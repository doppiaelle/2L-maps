import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useServices } from '@/features/api/services-provider';
import { USAGE_QUOTA_QUERY_KEY } from '@/features/quota/use-usage-quota';
import { useDraftRouteStore, useUiStore } from '@/features/stores';
import type { RoutingFailure, RoutingOutcome } from '@/lib/providers/types';
import type { DraftRoute } from '@/lib/route/draft';

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

/** Derived from the draft, so an edit changes it and a retry does not. Two
 *  attempts on the same stops in the same order are the same work, and the
 *  server should charge for it once. */
export function idempotencyKeyFor(draft: DraftRoute): string {
  const stops = draft.stops.map((stop) => stop.placeId).join(',');
  return `${draft.routeId}:${draft.shape}:${draft.originPlaceId ?? 'here'}:${stops}`;
}

export function useOptimizeRoute(): OptimizeState {
  const services = useServices();
  const queryClient = useQueryClient();

  const draft = useDraftRouteStore((store) => store.draft);
  const applyResult = useDraftRouteStore((store) => store.applyResult);
  const setOptimizing = useUiStore((store) => store.setOptimizing);

  const mutation = useMutation<RoutingOutcome, Error, void>({
    mutationFn: async () => {
      if (services === null) {
        return { ok: false, failure: { kind: 'upstream-unavailable', canDegrade: false } };
      }

      return services.routing.optimize({
        routeId: draft.routeId,
        originPlaceId: draft.originPlaceId,
        originCoordinate: null,
        // The client id travels with the place id: two deliveries in the same
        // building are two stops, and sending place ids alone would collapse
        // them into one.
        stops: draft.stops.map((stop) => ({ id: stop.id, placeId: stop.placeId })),
        shape: draft.shape,
        departureTime: null,
        idempotencyKey: idempotencyKeyFor(draft),
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

      const result = outcome.result;
      applyResult(result.orderedStopIds, result.isDegraded);

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
