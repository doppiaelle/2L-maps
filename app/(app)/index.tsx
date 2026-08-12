import { router } from 'expo-router';
import { getLocales } from 'expo-localization';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

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
import { legSummary } from '@/lib/map/leg-selection';
import { buildRouteGeometry, connectorsThrough, planRoute } from '@/lib/map/route-geometry';
import { PREPARING_DELAY_MS, routeViewAfter, showsCanvas, showsMap } from '@/lib/route/route-view';
import type { RouteView } from '@/lib/route/route-view';
import { handoffNoticeOf } from '@/lib/handoff/outcome-notice';
import { newRouteId } from '@/lib/route/route-id';
import { actionIntentOf, planStateOf } from '@/lib/route/plan-state';
import { reorderableCount, routeEndsOf, shapeForEnd } from '@/lib/route/route-ends';
import { unreachableIn } from '@/lib/route/progress';
import { wasAlreadyOptimal } from '@/lib/route/draft';
import { useAppTheme } from '@/features/preferences/use-app-theme';
import { InlineStopSearch } from '@/features/places/InlineStopSearch';

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
  const theme = useAppTheme();
  const locale = getLocales()[0]?.languageTag ?? 'en-GB';

  const pending = usePendingDeepLinkContext();
  const { ads } = useMonetisation();
  const draft = useDraftRouteStore((store) => store.draft);
  const result = useDraftRouteStore((store) => store.result);
  const progress = useRouteProgressStore((store) => store.progress);
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
  const setRouteShape = useDraftRouteStore((store) => store.setRouteShape);
  const resetDraft = useDraftRouteStore((store) => store.reset);
  const resetOptimization = useDraftRouteStore((store) => store.resetOptimization);
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
  // Which hop the driver tapped on the canvas. Null is most of the time and is
  // the whole route.
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const destination = useLaunchDestination({
    isStoreHydrated: true,
    hasRouteInProgress: progress !== null,
    pendingDeepLink: pending.target,
  });

  /**
   * Writes on meaningful events — optimized and handed over — never on a
   * keystroke. The local store already holds the draft; what this adds is
   * History and the second device.
   *
   * **The return value used to be discarded**, `failure` included, which is the
   * field the hook documents as existing "so a screen can say so rather than
   * letting the route silently exist on one device only". A route that failed to
   * save looked exactly like one that saved — on screen, in the store, and
   * simply not in History (ADR-0027).
   */
  const routeSync = useRouteSync();

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

  // The origin travels with the stops. Its address is what the "From" row says,
  // and the draft holds only its id (ADR-0007).
  const places = useResolvedPlaces(placeIdsToResolve(draft.stops, now, draft.originPlaceId));

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
    // The optimizer's own answer, and the only source there is. Nothing else can
    // make a stop anything other than pending now (ADR-0027).
    unreachableStopIds: unreachableIn(result),
    now,
  });

  /**
   * Where the round starts and finishes.
   *
   * Both ends were invisible: the origin was a field no screen drew, and
   * `setRouteShape` had no caller at all, so every route was one-way — which
   * pins the last typed stop as the destination and withholds it from the
   * optimizer (ADR-0027).
   */
  const ends = routeEndsOf({
    originPlaceId: draft.originPlaceId,
    originIsCurrentLocation: draft.originIsCurrentLocation,
    originAddress:
      draft.originPlaceId === null
        ? null
        : (places.byPlaceId.get(draft.originPlaceId)?.address ?? null),
    shape: draft.shape,
    firstStopTitle: rows[0]?.text.title ?? null,
  });

  // The route starts from stop one only when no origin was chosen at all — the
  // same condition `optimizeUpstream` applies, and it costs a movable stop.
  const startsFromFirstStop = draft.originPlaceId === null && !draft.originIsCurrentLocation;

  const quota = useUsageQuota();
  const availability = useOptimizeAvailability(draft.stops.length, quota);
  const { optimize, isOptimizing, failure } = useOptimizeRoute();

  const handoff = useHandoff({
    routeId: draft.routeId,
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

  // Decoded once, here, and memoised — never per render. A 25-stop polyline is
  // long enough that decoding it every frame is the most common cause of map
  // jank in this class of app (docs/24_PERFORMANCE.md).
  const geometry = useMemo(() => (result === null ? null : buildRouteGeometry(result)), [result]);

  /** The markers as the geometry functions want them: an id and a place, or the
   *  admission that we cannot place it. */
  const positionedStops = useMemo(
    () => markers.map((marker) => ({ stopId: marker.stopId, coordinate: marker.coordinate })),
    [markers],
  );

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
          value: formatDistance(metres, locale),
          spoken:
            result !== null && !result.isDegraded
              ? formatDistance(metres, locale)
              : `${formatDistance(metres, locale)} in a straight line`,
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
    isOptimizing,
    hasResult: draft.isOptimized,
    isDegraded: draft.isDegraded,
    wasAlreadyOptimal: wasAlreadyOptimal(draft),
    lastFailure: failure === null ? null : failure.kind === 'offline' ? 'offline' : 'upstream',
  });

  /**
   * A result arriving is the one thing that opens the map, and it does so
   * without a second tap: the user pressed Optimize and this is the answer.
   *
   * **Keyed on the result, not on whether one exists.** It used to depend on
   * `result !== null`, so pressing Optimize a second time changed nothing the
   * effect could see — the boolean was already true — and the map never opened.
   * A new result is a new object, and that is the event.
   */
  useEffect(() => {
    // A hop belongs to the result it was measured on. Carrying the index across
    // a new optimization would highlight a different segment and show it the old
    // numbers.
    setSelectedLegIndex(null);

    if (result !== null) {
      setRouteView((current) =>
        routeViewAfter({ kind: 'result-arrived' }, { current, hasResult: true }),
      );
    }
  }, [result]);

  /**
   * Every edit leaves the map, because the result no longer describes the stops
   * that are there. A map of the previous route is worse than no map: it looks
   * current.
   *
   * **The signature is the stop *set*, not the order** — and that is the whole
   * of "sometimes Optimize stays on the list". A successful optimization
   * reorders `draft.stops`, so an order-based signature changed at the moment
   * the result landed, and this effect ran *after* the one above and put the
   * list straight back. It only happened when the optimizer actually moved
   * something, which is exactly why it looked intermittent.
   *
   * A reorder the *user* performs still leaves the map, by a different and
   * sounder route: `moveStopTo` clears the result, so `showsMap` has nothing to
   * draw.
   */
  const editSignature = [...draft.stops.map((stop) => stop.id)].sort().join(',');
  useEffect(() => {
    setRouteView((current) => routeViewAfter({ kind: 'edited' }, { current, hasResult: false }));
    setHandoffNotice(null);
  }, [editSignature]);

  /**
   * The wait between pressing Optimize and seeing an answer.
   *
   * **Held back for a second**׎��G����ƭy�cts**. A result landing at 990 ms would otherwise be covered by a
   * waiting face scheduled before it arrived — the cleanup and the callback race
   * within the same tick, and one guard cannot be relied on to win.
   */
  const isOptimizingRef = useRef(isOptimizing);
  isOptimizingRef.current = isOptimizing;

  useEffect(() => {
    if (!isOptimizing) return;

    const timer = setTimeout(() => {
      if (!isOptimizingRef.current) return;
      setRouteView((current) =>
        routeViewAfter({ kind: 'optimize-started' }, { current, hasResult: false }),
      );
    }, PREPARING_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [isOptimizing]);

  // A failure returns to the list, where the stops are — and they are exactly as
  // they were, which is the thing a failed optimization most has to demonstrate.
  const hasFailed = failure !== null;
  useEffect(() => {
    if (hasFailed) {
      setRouteView((current) => routeViewAfter({ kind: 'failed' }, { current, hasResult: false }));
    }
  }, [hasFailed]);

  const isMapShowing = showsMap(routeView, result !== null);
  // Both faces of the canvas occupy the same space, so the layout that depends
  // on it — running behind the dock, lifting Confirm clear of it — is the same
  // for both.
  const isCanvasShowing = showsCanvas(routeView, result !== null);

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
          extendsBehindDock={isCanvasShowing}
          testID="section-itinerary"
        >
          <PlanView
            state={state}
            intent={actionIntentOf(state, availability)}
            // The map is a face of this section, not a screen behind it
            // (ADR-0022). `showsMap` is the floor: a view of 'map' with no
            // result would draw an empty canvas, and the drawn map has no tiles
            // to fall back on.
            view={isMapShowing ? 'map' : isCanvasShowing ? 'preparing' : 'list'}
            // Lifts Confirm clear of the dock the canvas runs underneath.
            bottomInset={isCanvasShowing ? DOCK_OUTER_HEIGHT : 0}
            mapSlot={
              !isCanvasShowing ? null : (
                <RouteCanvas
                  stops={markers}
                  // The result's own geometry once there is one; the stops in the
                  // order they were typed while there is not. Same canvas, same
                  // projection, same drawn town — so the answer arriving changes
                  // what is on screen without moving any of it.
                  route={
                    isMapShowing
                      ? planRoute(geometry, positionedStops)
                      : connectorsThrough(positionedStops)
                  }
                  phase={isMapShowing ? 'ready' : 'preparing'}
                  // Tapping a hop shows what Google measured for it — data the
                  // field mask already buys and nothing was showing (ADR-0027).
                  selectedLegIndex={selectedLegIndex}
                  onSelectLeg={setSelectedLegIndex}
                  selectedStopId={selectedStopId}
                  undrawableStopIds={undrawableStopIds}
                  // The route's own id. Stable across renders and across
                  // devices, so the drawn town is the same every time this
                  // route is opened — and a different one for a different route.
                  scenerySeed={draft.routeId}
                  theme={theme}
                  testID="plan-route-canvas"
                />
              )
            }
            selectedLeg={
              geometry === null || selectedLegIndex === null
                ? null
                : legSummary(selectedLegIndex, geometry.legs)
            }
            onDismissMap={() => {
              /**
               * **The result stays.** This used to call `clearResult()`, so the
               * three lines threw away an optimization the user had already paid
               * for: the route stopped being optimized, Confirm turned back into
               * Optimize, and the only way back to the map was to spend another
               * unit of quota on an answer we were still holding.
               *
               * What the control says is "back to the stop list", and that is now
               * all it does. `onShowMap` is the way back.
               */
              setRouteView(
                routeViewAfter({ kind: 'dismissed' }, { current: routeView, hasResult: true }),
              );
            }}
            // Only offered when there is a drawn route to return to. Free: the
            // result is in memory and the canvas is drawn from it.
            {...(result === null
              ? {}
              : {
                  onShowMap: () => {
                    setRouteView((current) =>
                      routeViewAfter({ kind: 'result-arrived' }, { current, hasResult: true }),
                    );
                  },
                })}
            stops={rows}
            ends={{
              ends,
              theme,
              onEditStart: () => {
                router.push('/add-stop?origin=1');
              },
              onSelectEnd: (end) => {
                // The store already clears the result: the optimal order
                // genuinely differs between the two shapes, so a cached answer
                // for one is not an answer for the other.
                setRouteShape(shapeForEnd(end));
              },
              reorderable:
                draft.stops.length < 3
                  ? null
                  : {
                      movable: reorderableCount({
                        stopCount: draft.stops.length,
                        end: draft.shape === 'round-trip' ? 'back-to-start' : 'last-stop',
                        startsFromFirstStop,
                      }),
                      total: draft.stops.length,
                    },
            }}
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
            onResetOptimization={() => {
              resetOptimization();
              setRouteView('list');
              setSelectedLegIndex(null);
            }}
            onPrimaryAction={() => {
              // The control's own state already says which of the two this is; the
              // screen only has to route the tap. `planStateOf` decided that, and
              // re-deriving it here would be the same rule in two places.
              if (state.kind !== 'optimized') {
                optimize();
                return;
              }

              // Confirm. `useHandoff` records the departure **before** it opens
              // anything — that write is what moves the route to `in_progress`
              // and therefore into History, which is exactly what was not
              // happening (`docs/11_STATE_MANAGEMENT.md` §7).
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
              setIsSearchOpen(true);
            }}
            onImport={() => {
              router.push('/import');
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
            theme={theme}
            testID="plan-view"
          />
        </SectionPanel>
      )}

      {activeSection === 'history' && (
        <SectionPanel theme={theme} topInset={insets.top} testID="section-history">
          {/* The failure belongs here rather than over the route. What has gone
              wrong is that a route is *not in History*, so History is where it
              is said — and Confirm, which the driver presses to set off, is
              never covered by a panel about filing. */}
          <HistorySection
            onOpenRoute={closeSection}
            saveFailure={routeSync.failure}
            onRetrySave={routeSync.sync}
            theme={theme}
          />
        </SectionPanel>
      )}

      {activeSection === 'settings' && (
        <SectionPanel theme={theme} topInset={insets.top} testID="section-settings">
          <SettingsSection theme={theme} />
        </SectionPanel>
      )}

      <Pressable
        onPress={() => openSection(activeSection === 'settings' ? 'itinerary' : 'settings')}
        accessibilityRole="button"
        accessibilityLabel={activeSection === 'settings' ? 'Return to route' : 'Open settings'}
        style={{
          position: 'absolute',
          top: insets.top + space.space2,
          right: space.space3,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colours[theme].surfaceRaised,
          borderWidth: 1,
          borderColor: colours[theme].border,
        }}
        testID="open-settings"
      >
        <Text style={{ color: colours[theme].textPrimary }}>
          {activeSection === 'settings' ? 'Back' : '••'}
        </Text>
      </Pressable>

      {isSearchOpen && activeSection === 'itinerary' && (
        <InlineStopSearch theme={theme} onClose={() => setIsSearchOpen(false)} />
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
