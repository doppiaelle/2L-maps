import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Linking, useColorScheme, useWindowDimensions } from 'react-native';

import { useHandoff } from '@/features/handoff/use-handoff';
import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { useLaunchDestination } from '@/features/navigation/use-launch-destination';
import { useResolvedPlaces } from '@/features/places/use-resolved-places';
import { useOptimizeAvailability, useUsageQuota } from '@/features/quota/use-usage-quota';
import { PlanView } from '@/features/route-planning/PlanView';
import { useOptimizeRoute } from '@/features/route-planning/use-optimize-route';
import { useOpenRoute } from '@/features/routes/use-open-route';
import { useRouteSync } from '@/features/routes/use-route-sync';
import { useDraftRouteStore, useRouteProgressStore, useUiStore } from '@/features/stores';
import { readMapIds } from '@/lib/config/map-ids';
import { formatDistance, formatDuration } from '@/lib/format/units';
import { buildPlanRows, placeIdsToResolve, straightLineMeters } from '@/lib/route/plan-rows';
import { buildRouteGeometry } from '@/lib/map/route-geometry';
import { actionIntentOf, planStateOf } from '@/lib/route/plan-state';
import { summarise } from '@/lib/route/progress';
import { wasAlreadyOptimal } from '@/lib/route/draft';

/**
 * Plan — the primary screen.
 *
 * **Composition only** (`CLAUDE.md` §1). Every decision visible on this file's
 * surface is imported: `buildPlanRows` performs the join, `planStateOf` says
 * which of the eleven states this is, `actionIntentOf` says what the control
 * offers, `optimizeAvailability` says on what terms. What is left is reading and
 * handing over.
 *
 * **It is never navigated to.** It is the root of the signed-in group and
 * everything else is a modal over it, which is what makes three taps to an
 * optimized route reachable at all (`CLAUDE.md` §7 rule 1).
 */
export default function PlanScreen(): React.JSX.Element {
  const { height } = useWindowDimensions();
  const scheme = useColorScheme();

  const pending = usePendingDeepLinkContext();
  const draft = useDraftRouteStore((store) => store.draft);
  const result = useDraftRouteStore((store) => store.result);
  const progress = useRouteProgressStore((store) => store.progress);
  const mark = useRouteProgressStore((store) => store.mark);
  const nextStop = useRouteProgressStore((store) => store.next);
  const detent = useUiStore((store) => store.detent);
  const setDetent = useUiStore((store) => store.setDetent);
  const selectedStopId = useUiStore((store) => store.selectedStopId);
  const selectStop = useUiStore((store) => store.selectStop);
  const clearSelection = useUiStore((store) => store.clearSelection);

  const destination = useLaunchDestination({
    isStoreHydrated: true,
    hasRouteInProgress: progress !== null,
    pendingDeepLink: pending.target,
  });

  // Writes on meaningful events — optimized, started, each stop marked,
  // finished — and never on a keystroke. The local store already holds the
  // draft; what this adds is History and the second device.
  useRouteSync();

  const { open: openRoute } = useOpenRoute();

  useEffect(() => {
    // Cleared once honoured. Leaving it set would re-open the same route on
    // every render, including after the user navigated away deliberately.
    if (destination.kind !== 'plan' || destination.mode !== 'opened-route') return;

    const routeId = destination.routeId;
    pending.clear();
    // `decideLaunch` resolved the link to a route id and nothing read it, so a
    // `twolmaps://route/{id}` link landed the user on whatever draft they
    // happened to have — which looks exactly like the link having been ignored.
    if (routeId !== null) void openRoute(routeId);
  }, [destination, pending, openRoute]);

  // One `now` for the whole render, so a stop cannot be judged fresh in the list
  // and expired on the map because the clock moved between two calls.
  const now = new Date();

  const places = useResolvedPlaces(placeIdsToResolve(draft.stops, now));
  const { rows, markers } = buildPlanRows({
    stops: draft.stops,
    resolved: places.byPlaceId,
    progress,
    now,
  });

  const quota = useUsageQuota();
  const availability = useOptimizeAvailability(draft.stops.length, quota);
  const { optimize, isOptimizing, failure } = useOptimizeRoute();

  const handoff = useHandoff({
    stops: draft.stops,
    resolved: places.byPlaceId,
    // `openURL` rejects when nothing can handle the URL; that is a refusal, not
    // a crash, and the handoff reports it as one.
    open: (url) =>
      Linking.openURL(url).then(
        () => true,
        () => false,
      ),
  });

  const summary = progress === null ? null : summarise(progress, draft.stops);
  const completed = summary?.completed ?? 0;

  /**
   * Mark the stop the driver is actually at.
   *
   * `next` is the authority on which one that is — the order on screen and the
   * order still to visit are not the same list once anything has been skipped,
   * and asking the store rather than reading `stops[completed]` is what keeps
   * those two from drifting.
   */
  const advance = (state: 'completed' | 'skipped') => {
    const current = nextStop(draft.stops);
    if (current === null) return;

    mark(current.id, state);

    // This mark was the last one outstanding, so the route is finished. The
    // summary is a terminal moment and is presented full, rather than as
    // another sheet over a map the driver is done with (docs/10 §6).
    if ((summary?.remaining ?? draft.stops.length) <= 1) router.push('/summary');
  };

  // Decoded once, here, and memoised — never per render. A 25-stop polyline is
  // long enough that decoding it every frame is the most common cause of map
  // jank in this class of app (docs/24_PERFORMANCE.md).
  const geometry = useMemo(() => (result === null ? null : buildRouteGeometry(result)), [result]);

  // Real figures once a result exists; a straight-line total before that,
  // labelled as an estimate by `<RouteSummaryHeader>`. A number is more useful
  // than a blank — but a straight-line *time* would be a road estimate we did
  // not make, so a draft gets no duration at all.
  const metres =
    result !== null && !result.isDegraded
      ? result.totalDistanceMeters
      : straightLineMeters(markers);
  const distance =
    metres === null
      ? null
      : {
          value: formatDistance(metres, 'metric'),
          spoken:
            result !== null && !result.isDegraded
              ? formatDistance(metres, 'metric')
              : `${formatDistance(metres, 'metric')} in a straight line`,
        };

  const duration =
    result !== null && !result.isDegraded
      ? {
          value: formatDuration(result.totalDurationSeconds),
          spoken: formatDuration(result.totalDurationSeconds),
        }
      : null;

  const state = planStateOf({
    isLoading: places.isLoading && draft.stops.length > 0,
    stopCount: draft.stops.length,
    completedCount: completed,
    isRouteUnderway: progress !== null,
    isOptimizing,
    hasResult: draft.isOptimized,
    isDegraded: draft.isDegraded,
    wasAlreadyOptimal: wasAlreadyOptimal(draft),
    lastFailure: failure === null ? null : failure.kind === 'offline' ? 'offline' : 'upstream',
  });

  return (
    <PlanView
      state={state}
      intent={actionIntentOf(state, availability)}
      stops={rows}
      markers={markers}
      route={geometry}
      distance={distance}
      duration={duration}
      detent={detent}
      onDetentChange={setDetent}
      selectedStopId={selectedStopId}
      onSelectStop={selectStop}
      onClearSelection={clearSelection}
      onPrimaryAction={() => {
        // The control's own state already says which of the two this is; the
        // screen only has to route the tap. `planStateOf` decided that, and
        // re-deriving it here would be the same rule in two places.
        // Mid-route the same control means Done, and the state machine already
        // said so — re-deriving it here would be one rule in two places.
        if (state.kind === 'in-progress') {
          advance('completed');
          return;
        }

        if (state.kind !== 'optimized') {
          optimize();
          return;
        }

        void handoff.start().then((outcome) => {
          // A first handoff with no provider chosen presents the picker rather
          // than guessing — sending a twelve-stop day to the wrong app is a bad
          // introduction to the one feature the product is for.
          if (outcome.kind === 'needs-provider') router.push('/provider');
        });
      }}
      onAddStop={() => {
        router.push('/add-stop');
      }}
      onSkipStop={() => {
        advance('skipped');
      }}
      theme={scheme === 'dark' ? 'dark' : 'light'}
      mapIds={readMapIds()}
      mapStatus="ready"
      screenHeight={height}
      testID="plan-screen"
    />
  );
}
