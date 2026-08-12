import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import { useSession } from '@/features/auth/session-provider';
import { useDraftRouteStore, useRouteProgressStore } from '@/features/stores';
import { queryKeys } from '@/lib/query/client';
import type { DraftRoute } from '@/lib/route/draft';
import {
  canTransition,
  completeSupersededRoute,
  statusFor,
  toRows,
  type RouteStatus,
} from '@/lib/route/persistence';
import { unreachableIn } from '@/lib/route/progress';
import type { SaveFailure } from '@/lib/supabase/routes-adapter';
import type { OptimizationResult } from '@/types';

/**
 * Keeping the server's copy of a route in step with the user's.
 *
 * **There is no Save button, because `route_status` is a lifecycle rather than a
 * set of flags** ([`docs/12_DATABASE.md`](../../docs/12_DATABASE.md)). A driver
 * who has to remember to press Save loses a day's work the first time they
 * don't, and asking them to name and file a route before they have driven it is
 * asking for administration in exchange for a feature.
 *
 * **It writes on meaningful events, not on every edit.** Typing a label is not
 * an event; optimizing, starting, marking a stop and finishing are. Two reasons,
 * and the second is the important one:
 *
 * 1. A write per keystroke is a request per keystroke.
 * 2. **The local store is already durable.** The draft is persisted eagerly and
 *    never evicted (`docs/24_PERFORMANCE.md`), so nothing is at risk between
 *    writes. What the server adds is History and the second device — neither of
 *    which needs to see a half-typed label.
 *
 * A draft that has never been optimized stays local on purpose. It is a sketch,
 * and a History full of two-stop sketches is a History nobody scrolls.
 *
 * **Progress is the exception and is written on every mark.** It is the one
 * piece of state this product cannot reconstruct, the app is backgrounded for
 * the whole drive, and the process can be killed at any point in it
 * (`docs/11_STATE_MANAGEMENT.md` §7).
 */

export interface RouteSync {
  /** The last write that failed, so a screen can say so rather than letting the
   *  route silently exist on one device only. Null while everything is in step. */
  readonly failure: SaveFailure | null;
  /** Force a write — used by the retry in the failure state. */
  sync: () => void;
}

interface RouteWriteSnapshot {
  readonly draft: DraftRoute;
  readonly result: OptimizationResult | null;
  readonly status: RouteStatus;
  readonly optimizedAt: string;
}

export function useRouteSync(): RouteSync {
  const services = useServices();
  const { session } = useSession();
  const queryClient = useQueryClient();

  const draft = useDraftRouteStore((store) => store.draft);
  const result = useDraftRouteStore((store) => store.result);
  const progress = useRouteProgressStore((store) => store.progress);

  const [failure, setFailure] = useState<SaveFailure | null>(null);
  // What the server last accepted. The transition guard needs a *from*, and
  // deriving it from the current draft would compare a status to itself.
  const lastWrittenStatus = useRef<RouteStatus | null>(null);
  const activeRouteId = useRef(draft.routeId);
  // Which write is in flight, so two status changes in quick succession do not
  // produce overlapping upserts that land out of order.
  const inFlight = useRef<Promise<void> | null>(null);
  /** The route this hook was last looking at, so the moment it becomes a
   *  different one is observable. That moment is the only thing left that can
   *  close a day. */
  const previousRoute = useRef<{ routeId: string; status: RouteStatus } | null>(null);

  const routeId = draft.routeId;
  if (activeRouteId.current !== routeId) {
    activeRouteId.current = routeId;
    lastWrittenStatus.current = null;
  }

  const progressForCurrentRoute = progress?.routeId === draft.routeId ? progress : null;
  const status = statusFor({
    isOptimized: draft.isOptimized,
    isUnderway: progressForCurrentRoute !== null,
  });

  const latestSnapshot = useRef<RouteWriteSnapshot>({
    draft,
    result,
    status,
    optimizedAt: new Date().toISOString(),
  });
  latestSnapshot.current = {
    draft,
    result,
    status,
    optimizedAt:
      latestSnapshot.current.status === status
        ? latestSnapshot.current.optimizedAt
        : new Date().toISOString(),
  };

  const writeSnapshot = useCallback(
    async (snapshot: RouteWriteSnapshot): Promise<void> => {
      const userId = session?.userId;
      if (services === null || userId === undefined) return;

      const from = lastWrittenStatus.current;
      // A transition the lifecycle forbids is a defect upstream, and writing it
      // would let a completed day be reopened. Refused here rather than sent.
      if (from !== null && !canTransition(from, snapshot.status)) return;

      const outcome = await services.routes.save(
        toRows(snapshot.draft, userId, {
          status: snapshot.status,
          unreachableStopIds: unreachableIn(snapshot.result),
          totals:
            snapshot.result === null
              ? null
              : {
                  tier: snapshot.result.tier,
                  distanceMeters: snapshot.result.totalDistanceMeters,
                  durationSeconds: snapshot.result.isDegraded
                    ? null
                    : snapshot.result.totalDurationSeconds,
                  optimizedAt: snapshot.optimizedAt,
                },
        }),
      );

      if (outcome.ok) {
        setFailure(null);
        lastWrittenStatus.current = snapshot.status;
        // History is now stale. Invalidating rather than writing into the cache
        // by hand: the list carries a stop count and an updated timestamp that
        // only the server knows.
        void queryClient.invalidateQueries({ queryKey: queryKeys.savedRoutes() });
        return;
      }

      /**
       * Named in a log line, because "it can't be failing" has to be checkable.
       *
       * The **kind only** — no address, no place id, no route id. Which of the
       * five it is decides whether this is a connection, an unresolved place, a
       * policy refusal or our own state machine, and those have entirely different
       * fixes (`CLAUDE.md` §9 rule 7).
       */
      console.warn(`[route-sync] save failed, kind=${outcome.failure.kind}`);
      setFailure(outcome.failure);
    },
    [services, session?.userId, queryClient],
  );

  const sync = useCallback(() => {
    const snapshot = latestSnapshot.current;
    // Serialised. Two upserts of the same route racing would be harmless for the
    // route row and wrong for the stops, where the second delete can land after
    // the first insert.
    const previous = inFlight.current ?? Promise.resolve();
    const run = () => writeSnapshot(snapshot);
    inFlight.current = previous.then(run, run);
  }, [writeSnapshot]);

  /**
   * The trigger.
   *
   * `status` is the only dependency, deliberately. An edit that does not change
   * it is a sketch being sketched, and the local store already holds it.
   *
   * There used to be a second dependency — a serialised copy of every stop's
   * mark — because the driver produced a write per stop all day. They do not any
   * more ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)): a
   * whole route now produces two writes, one when it is optimized and one when
   * it is handed over.
   */
  useEffect(() => {
    // A pure draft stays local until something happens to it worth recording.
    if (status === 'draft' && lastWrittenStatus.current === null) return;
    sync();
  }, [status, sync]);

  /**
   * Starting the next route is what finishes the last one.
   *
   * Nothing inside a route can finish it any more — there is no Done button and
   * no final stop to mark ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
   * So the driver reaching for the next day is the signal, and it is a good one:
   * nobody plans tomorrow's round while still driving today's.
   *
   * Only a route that was actually **handed over** is closed. One that was
   * optimized and then abandoned was never driven, and marking it completed
   * would put a day in History that never happened.
   */
  useEffect(() => {
    const previous = previousRoute.current;
    const hasChangedRoute = previous !== null && previous.routeId !== routeId;
    const superseded = completeSupersededRoute(hasChangedRoute ? previous : null);

    previousRoute.current = { routeId, status };
    if (hasChangedRoute) {
      lastWrittenStatus.current = null;
      setFailure(null);
    }

    if (superseded === null || services === null) return;

    void services.routes
      .advance(superseded.routeId, superseded.from, superseded.to)
      .then((outcome) => {
        // A refused transition is not a user-facing failure: the previous route
        // is already in a terminal state, which is where this was taking it.
        if (outcome.ok) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.savedRoutes() });
        }
      });
  }, [routeId, status, services, queryClient]);

  return { failure, sync };
}
