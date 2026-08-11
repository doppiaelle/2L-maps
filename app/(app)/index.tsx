import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, View, useColorScheme } from 'react-native';

import { useHandoff } from '@/features/handoff/use-handoff';
import { useMonetisation } from '@/features/monetisation/monetisation-provider';
import { useDrainOnReconnect } from '@/features/network/use-drain-on-reconnect';
import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { useLaunchDestination } from '@/features/navigation/use-launch-destination';
import { useResolvedPlaces } from '@/features/places/use-resolved-places';
import { useOptimizeAvailability, useUsageQuota } from '@/features/quota/use-usage-quota';
import { PlanView } from '@/features/route-planning/PlanView';
import { useOptimizeRoute } from '@/features/route-planning/use-optimize-route';
import { useOpenRoute } from '@/features/routes/use-open-route';
import { useRouteSync } from '@/features/routes/use-route-sync';
import { useDraftRouteStore, useRouteProgressStore, useUiStore } from '@/features/stores';
import { AdSlot } from '@/components/primitives/AdSlot';
import { RouteCanvas } from '@/components/map/RouteCanvas';
import { Dock, DOCK_OUTER_HEIGHT } from '@/components/navigation/Dock';
import { useIsBackgrounded } from '@/features/ui/use-is-backgrounded';
import { SectionPanel } from '@/components/navigation/SectionPanel';
import { HistorySection } from '@/features/routes/HistorySection';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { dockItems, toggleSection } from '@/lib/ui/dock';
import { NoticeToast } from '@/components/feedback/NoticeToast';
import { UndoToast } from '@/components/feedback/UndoToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours, space } from '@/lib/design/tokens';
import { addressNoticeOf } from '@/lib/places/notice';
import { formatDistance, formatDuration } from '@/lib/format/units';
import { buildPlanRows, placeIdsToResolve, straightLineMeters } from '@/lib/route/plan-rows';
import { buildRouteGeometry, planRoute } from '@/lib/map/route-geometry';
import { routeViewAfter, showsMap } from '@/lib/route/route-view';
import type { RouteView } from '@/lib/route/route-view';
import { handoffNoticeOf } from '@/lib/handoff/outcome-notice';
import { newRouteId } from '@/lib/route/route-id';
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
  const scheme = useColorScheme();

  const pending = usePendingDeepLinkContext();
  const { ads } = useMonetisation();
  const draft = useDraftRouteStore((store) => store.draft);
  const result = useDraftRouteStore((store) => store.result);
  const progress = useRouteProgressStore((store) => store.progress);
  const mark = useRouteProgressStore((store) => store.mark);
  const nextStop = useRouteProgressStore((store) => store.next);
  const activeSection = useUiStore((store) => store.activeSection);
  const openSection = useUiStore((store) => store.openSection);
  const closeSection = useUiStore((store) => store.closeSection);
  const selectedStopId = useUiStore((store) => store.selectedStopId);
  const selectStop = useUiStore((store) => store.selectStop);
  const clearSelection = useUiStore((store) => store.clearSelection);
  // The three actions the store has always had and no screen ever called. The
  // list could be built and optimized but never edited: no removal, no
  // reordering, no way to start again short of reinstalling.
  const removeStopById = useDraftRouteStore((store) => store.removeStopById);
  const undoRemove = useDraftRouteStore((store) => store.undoRemove);
  const moveStopTo = useDraftRouteStore((store) => store.moveStopTo);
  const resetDraft = useDraftRouteStore((store) => store.reset);
  const clearResult = useDraftRouteStore((store) => store.clearResult);
  const applyResolvedCoordinates = useDraftRouteStore((store) => store.applyResolvedCoordinates);

  // What the undo toast is offering. Null means nothing was just removed —
  // the removal has already happened in the store, and `undoRemove` is what
  // puts it back (docs/06 P8: execute and offer undo, never confirm first).
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  // Which face the Route section is showing. `routeViewAfter` decides; this only
  // holds the answer (ADR-0022).
  const [routeView, setRouteView] = useState<RouteView>('list');
  // What the last handoff attempt produced, for the five outcomes that used to
  // produce nothing at all.
  const [handoffNotice, setHandoffNotice] = useState<ReturnType<typeof handoffNoticeOf>>(null);

  const destination = useLaunchDestination({
    isStoreHydrated: true,
    hasRouteInProgress: progress !== null,
    pendingDeepLink: pending.target,
  });

  // Writes on meaningful events — optimized, started, each stop marked,
  // finished — and never on a keystroke. The local store already holds the
  // draft; what this adds is History and the second device.
  useRouteSync();

  // The signal coming back is the interesting edge: the server's copy is behind
  // by whatever the driver did underground. Pushes first, then re-reads.
  useDrainOnReconnect();

  const { open: openRoute } = useOpenRoute();

  const isBackgrounded = useIsBackgrounded();
  // The device's own edges. Read once, here, and passed down: a component that
  // asks answers differently in a test and in split screen.
  const insets = useSafeAreaInsets();

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

  // What the lookup returned is kept, rather than re-bought on the next render,
  // the next launch and every time the stop list changes shape. The thirty-day
  // rule still governs it — `applyResolvedCoordinates` stamps `refreshedAt` and
  // `isCoordinateFresh` expires it (ADR-0007).
  //
  // Keyed on the ids rather than on the map, which is a new object every render.
  // The action is a no-op when nothing needed writing, so a stray run costs one
  // comparison and no re-render.
  const resolvedKey = [...places.byPlaceId.keys()].sort().join(',');
  useEffect(() => {
    if (places.byPlaceId.size === 0) return;
    applyResolvedCoordinates(places.byPlaceId, new Date());
    // `places.byPlaceId` is deliberately absent: its identity changes on every
    // render and `resolvedKey` is the part that actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, applyResolvedCoordinates]);
  const { rows, markers, undrawableStopIds } = buildPlanRows({
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

  // A result arriving is the one thing that opens the map, and it does so
  // without a second tap: the user pressed Optimize and this is the answer.
  const hasResult = result !== null;
  useEffect(() => {
    if (hasResult)
      setRouteView((current) =>
        routeViewAfter({ kind: 'result-arrived' }, { current, hasResult: true }),
      );
  }, [hasResult]);

  // Every edit leaves the map, because the result no longer describes the stops
  // that are there. A map of the previous route is worse than no map: it looks
  // current.
  const editSignature = draft.stops.map((stop) => stop.id).join(',');
  useEffect(() => {
    setRouteView((current) => routeViewAfter({ kind: 'edited' }, { current, hasResult: false }));
    setHandoffNotice(null);
  }, [editSignature]);

  const theme = scheme === 'dark' ? 'dark' : 'light';

  const isMapShowing = showsMap(routeView, result !== null);

  return (
    <View
      // **The background was never set**, so under the dock — past where the
      // section panel stops — the window's own colour showed through as a white
      // band across the bottom of a dark screen. One surface, one colour, edge
      // to edge.
      style={{ flex: 1, backgroundColor: colours[theme].bg }}
      testID="plan-screen"
    >
      {activeSection === 'itinerary' && (
        <SectionPanel
          theme={theme}
          // The status bar. Without it the section began under the clock.
          topInset={insets.top}
          // The drawn route runs the whole height with the dock floating on it;
          // the stop list stops above the dock, or its last row is unreachable.
          extendsBehindDock={isMapShowing}
          testID="section-itinerary"
        >
          <PlanView
            state={state}
            intent={actionIntentOf(state, availability)}
            // The map is a face of this section, not a screen behind it
            // (ADR-0022). `showsMap` is the floor: a view of 'map' with no
            // result would draw an empty canvas, and the drawn map has no tiles
            // to fall back on.
            view={isMapShowing ? 'map' : 'list'}
            // Lifts Confirm clear of the dock the map runs underneath.
            bottomInset={isMapShowing ? DOCK_OUTER_HEIGHT : 0}
            mapSlot={
              result === null ? null : (
                <RouteCanvas
                  stops={markers}
                  route={planRoute(
                    geometry,
                    markers.map((marker) => ({
                      stopId: marker.stopId,
                      coordinate: marker.coordinate,
                    })),
                  )}
                  selectedStopId={selectedStopId}
                  undrawableStopIds={undrawableStopIds}
                  theme={theme}
                  testID="plan-route-canvas"
                />
              )
            }
            onDismissMap={() => {
              // The result goes; the stops stay. "Back to the list" with an
              // empty list would not be back to anything.
              clearResult();
              setRouteView(
                routeViewAfter({ kind: 'dismissed' }, { current: routeView, hasResult: true }),
              );
            }}
            stops={rows}
            distance={distance}
            duration={duration}
            onSelectStop={selectStop}
            onRemoveStop={(stopId) => {
              removeStopById(stopId);
              setPendingRemoval(stopId);
            }}
            onMoveStop={moveStopTo}
            onClearRoute={() => {
              // A fresh id, because a new route is a new row rather than an edit of
              // the last one — History would otherwise show one route that keeps
              // changing shape.
              resetDraft(newRouteId());
              clearSelection();
            }}
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
                if (outcome.kind === 'needs-provider') {
                  router.push('/provider');
                  return;
                }

                // **The other five used to produce nothing.** A blocked Waze
                // handoff, a route past the URL ceiling and an app that is not
                // installed all looked the same from the phone: the button was
                // pressed and the screen did not change (`CLAUDE.md` §0 rule 5).
                setHandoffNotice(
                  handoffNoticeOf({
                    kind: outcome.kind,
                    ...(outcome.kind === 'handed-off' ? { chunkCount: outcome.chunkCount } : {}),
                    ...(outcome.kind === 'needs-coordinates'
                      ? { stopCount: outcome.stopIds.length }
                      : {}),
                  }),
                );
              });
            }}
            // Nothing at all until an ad provider exists. `<AdSlot>` reserves its
            // height from the first render to avoid a reflow, so rendering it with no
            // provider would reserve a gap that could never be filled.
            adSlot={
              ads === null ? null : (
                <AdSlot
                  slot="stop-list"
                  allowances={quota.allowances}
                  isRouteInProgress={progress !== null}
                  ads={ads}
                  testID="plan-ad-slot"
                />
              )
            }
            onAddStop={() => {
              router.push('/add-stop');
            }}
            onImport={() => {
              router.push('/import');
            }}
            onSkipStop={() => {
              advance('skipped');
            }}
            // Four causes, four sentences, and a retry only where retrying can
            // work. Every row used to say "Address needs refreshing" for all of
            // them and offer no way to refresh anything.
            addressNotice={addressNoticeOf({
              failure: places.failure,
              unresolvedCount: places.unresolved.length,
              isLoading: places.isLoading,
            })}
            onRetryAddresses={places.retry}
            testID="plan-view"
          />
        </SectionPanel>
      )}

      {activeSection === 'history' && (
        <SectionPanel theme={theme} topInset={insets.top} testID="section-history">
          <HistorySection onOpenRoute={closeSection} theme={theme} />
        </SectionPanel>
      )}

      {activeSection === 'settings' && (
        <SectionPanel theme={theme} topInset={insets.top} testID="section-settings">
          <SettingsSection theme={theme} />
        </SectionPanel>
      )}

      <Dock
        // The gesture bar sits below the dock rather than behind it.
        bottomInset={insets.bottom}
        items={dockItems(activeSection, { isRouteInProgress: progress !== null })}
        onSelect={(section) => {
          // `toggleSection` decides; the screen only routes. Tapping the open
          // section returns to the map, which is the job the close control used
          // to do (ADR-0020).
          openSection(toggleSection(activeSection, section));
        }}
        theme={theme}
        testID="plan-dock"
      />

      {handoffNotice !== null && (
        // No timer on this one. A route split into three parts, or a navigation
        // app that is not installed, are both things the driver has to act on
        // before setting off — and a message that removes itself after six
        // seconds is one they can miss by looking at the road.
        <NoticeToast
          title={handoffNotice.title}
          detail={handoffNotice.detail}
          kind={handoffNotice.kind}
          bottomOffset={DOCK_OUTER_HEIGHT + insets.bottom + space.space2}
          theme={theme}
          onDismiss={() => {
            setHandoffNotice(null);
          }}
          testID="plan-handoff-notice"
        />
      )}

      {pendingRemoval !== null && (
        // The removal already happened; this is the window in which it can be
        // taken back. A dialog before the fact would tax every deletion to guard
        // against a mistake that is both rare and reversible (docs/06 P8).
        <UndoToast
          message="Stop removed"
          // Above the dock rather than inside it. The toast used to be a plain
          // flex child, so it pushed the content up by its own height and then
          // painted over the navigation.
          bottomOffset={DOCK_OUTER_HEIGHT + space.space2}
          // The window pauses while the app is off screen. `lib/ui/undo-window`
          // was written for this and nothing had ever passed the flag, so in
          // production the six seconds ran down in the user's pocket.
          isBackgrounded={isBackgrounded}
          onUndo={() => {
            undoRemove();
            setPendingRemoval(null);
          }}
          onExpire={() => {
            // Nothing to commit: the store removed it immediately. Closing the
            // window is only about giving up the ability to reverse it.
            setPendingRemoval(null);
          }}
          testID="plan-undo-remove"
        />
      )}
    </View>
  );
}
