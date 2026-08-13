import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { useHandoff } from '@/features/handoff/use-handoff';
import { useLocation } from '@/features/location/location-provider';
import { useDrainOnReconnect } from '@/features/network/use-drain-on-reconnect';
import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { useLaunchDestination } from '@/features/navigation/use-launch-destination';
import { InlineStopSearch } from '@/features/places/InlineStopSearch';
import { useResolvedPlaces } from '@/features/places/use-resolved-places';
import { useOptimizeAvailability, useUsageQuota } from '@/features/quota/use-usage-quota';
import { PlanView } from '@/features/route-planning/PlanView';
import { RouteEndpointControls } from '@/features/route-planning/RouteEndpointControls';
import { useOptimizeRoute } from '@/features/route-planning/use-optimize-route';
import { useOpenRoute } from '@/features/routes/use-open-route';
import { RouteSaveNotice } from '@/features/routes/RouteSaveNotice';
import { useRouteSync } from '@/features/routes/use-route-sync';
import {
  useDraftRouteStore,
  usePreferencesStore,
  useRouteProgressStore,
  useUiStore,
} from '@/features/stores';
import { RouteCanvas } from '@/components/map/RouteCanvas';
import { Dock } from '@/components/navigation/Dock';
import { SectionPanel } from '@/components/navigation/SectionPanel';
import { HistorySection } from '@/features/routes/HistorySection';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { dockItems, toggleSection } from '@/lib/ui/dock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours, layout, space } from '@/lib/design/tokens';
import { buildPlanRows, placeIdsToResolve } from '@/lib/route/plan-rows';
import { legSummary } from '@/lib/map/leg-selection';
import { buildRouteGeometry, planRoute } from '@/lib/map/route-geometry';
import { routeViewAfter, showsMap } from '@/lib/route/route-view';
import type { RouteView } from '@/lib/route/route-view';
import { actionIntentOf, planStateOf } from '@/lib/route/plan-state';
import { unreachableIn } from '@/lib/route/progress';
import { wasAlreadyOptimal } from '@/lib/route/draft';
import { normalizeEndpointChoice } from '@/lib/route/route-ends';
import type { RouteEndPreference, RouteStartPreference } from '@/lib/route/route-ends';
import { newRouteId } from '@/lib/route/route-id';
import { useAppTheme } from '@/features/preferences/use-app-theme';

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
  const pending = usePendingDeepLinkContext();
  const draft = useDraftRouteStore((store) => store.draft);
  const result = useDraftRouteStore((store) => store.result);
  const activeSection = useUiStore((store) => store.activeSection);
  const openSection = useUiStore((store) => store.openSection);
  const closeSection = useUiStore((store) => store.closeSection);
  const selectedStopId = useUiStore((store) => store.selectedStopId);
  const selectStop = useUiStore((store) => store.selectStop);
  const removeStopById = useDraftRouteStore((store) => store.removeStopById);
  const applyResolvedCoordinates = useDraftRouteStore((store) => store.applyResolvedCoordinates);
  const setEndpoints = useDraftRouteStore((store) => store.setEndpoints);
  const resetDraft = useDraftRouteStore((store) => store.reset);
  const abandonProgress = useRouteProgressStore((store) => store.abandon);
  const preferences = usePreferencesStore((store) => store.preferences);
  const chooseRouteStart = usePreferencesStore((store) => store.chooseRouteStart);
  const chooseRouteEnd = usePreferencesStore((store) => store.chooseRouteEnd);
  const clearSelection = useUiStore((store) => store.clearSelection);
  const location = useLocation();

  // Which face the Route section is showing. `routeViewAfter` decides; this only
  // holds the answer (ADR-0022).
  const [routeView, setRouteView] = useState<RouteView>('list');
  // Which hop the driver tapped on the canvas. Null is most of the time and is
  // the whole route.
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Search starts at this measured y within PlanView. The initial value is the
  // token-derived layout, so the first tap is correct even before a layout event.
  const [routeSearchY, setRouteSearchY] = useState(173);
  const [settingsEntry, setSettingsEntry] = useState<'settings' | 'subscription'>('settings');

  const destination = useLaunchDestination({
    isStoreHydrated: true,
    hasRouteInProgress: false,
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

  // The device's own edges. Read once, here, and passed down: a component that
  // asks answers differently in a test and in split screen.
  const insets = useSafeAreaInsets();

  // A new, empty route inherits the last explicit endpoint choices. Persisted
  // routes keep their own geometry; only a blank draft is a template.
  useEffect(() => {
    if (draft.stops.length > 0 || draft.isOptimized) return;
    if (draft.routeStart === preferences.routeStart && draft.routeEnd === preferences.routeEnd) {
      return;
    }
    setEndpoints({ start: preferences.routeStart, end: preferences.routeEnd });
  }, [
    draft.isOptimized,
    draft.routeEnd,
    draft.routeStart,
    draft.stops.length,
    preferences.routeEnd,
    preferences.routeStart,
    setEndpoints,
  ]);

  useEffect(() => {
    if (activeSection !== 'itinerary' || routeView === 'map') setIsSearchOpen(false);
  }, [activeSection, routeView]);

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

  useEffect(() => {
    if (destination.kind !== 'settings') return;
    pending.clear();
    setSettingsEntry(destination.section === 'subscription' ? 'subscription' : 'settings');
    openSection('settings');
  }, [destination, openSection, pending]);

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

  const quota = useUsageQuota();
  const availability = useOptimizeAvailability(draft.stops.length, quota);
  const { optimize, isOptimizing, failure } = useOptimizeRoute();

  const handoff = useHandoff({
    routeId: draft.routeId,
    stops: draft.stops,
    resolved: places.byPlaceId,
    originIsCurrentLocation: draft.originIsCurrentLocation,
    originCoordinate: location.state.kind === 'ready' ? location.state.location.coordinate : null,
    isRoundTrip: draft.shape === 'round-trip',
    // `beginAndHandOff` writes progress first, then this awaited save runs, and
    // only after both does Linking background the app.
    beforeOpen: routeSync.sync,
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
  }, [editSignature]);

  // A failure returns to the list, where the stops are — and they are exactly as
  // they were, which is the thing a failed optimization most has to demonstrate.
  const hasFailed = failure !== null;
  useEffect(() => {
    if (hasFailed) {
      setRouteView((current) => routeViewAfter({ kind: 'failed' }, { current, hasResult: false }));
    }
  }, [hasFailed]);

  const isMapShowing = showsMap(routeView, result !== null);
  const selectedLegDetails = (() => {
    if (geometry === null || selectedLegIndex === null) return null;
    const summary = legSummary(selectedLegIndex, geometry.legs);
    if (summary === null) return null;

    const stop = rows[selectedLegIndex + 1] ?? rows[selectedLegIndex];
    return {
      value: summary.value,
      spoken: summary.spoken,
      ...(stop === undefined ? {} : { stopLabel: stop.text.title, stopNumber: stop.position }),
    };
  })();

  const applyEndpointChoice = (
    start: RouteStartPreference,
    end: RouteEndPreference,
    changed: 'start' | 'end',
  ) => {
    const normalized = normalizeEndpointChoice({ start, end }, changed);
    chooseRouteStart(normalized.start);
    chooseRouteEnd(normalized.end);
    setEndpoints(normalized);
  };

  const chooseStart = async (start: RouteStartPreference) => {
    if (start === 'current-location' && !(await location.enable())) return;
    applyEndpointChoice(start, draft.routeEnd, 'start');
  };

  const chooseEnd = async (end: RouteEndPreference) => {
    if (end === 'current-location' && !(await location.enable())) return;
    applyEndpointChoice(draft.routeStart, end, 'end');
  };

  const resetRoute = () => {
    abandonProgress();
    resetDraft(newRouteId(), {
      start: preferences.routeStart,
      end: preferences.routeEnd,
    });
    clearSelection();
    setSelectedLegIndex(null);
    setRouteView('list');
    setIsSearchOpen(false);
  };

  const needsCurrentLocation = draft.originIsCurrentLocation && location.state.kind !== 'ready';

  return (
    <View
      // **The background was never set**, so under the dock — past where the
      // section panel stops — the window's own colour showed through as a white
      // band across the bottom of a dark screen. One surface, one colour, edge
      // to edge.
      style={{ flex: 1, backgroundColor: colours[theme].bg }}
      testID="plan-screen"
    >
      <View
        pointerEvents={isSearchOpen ? 'none' : 'auto'}
        style={{
          flex: 1,
          // React Native 0.86 supports the native blur filter. Keeping the
          // route mounted preserves its scroll and map state while search is
          // open; the sharp dropdown remains a sibling above it.
          filter: isSearchOpen ? [{ blur: 6 }] : undefined,
        }}
        testID="plan-content"
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
              // Lifts Confirm clear of the dock the canvas runs underneath.
              bottomInset={isMapShowing ? insets.bottom + space.space5 : 0}
              mapSlot={
                !isMapShowing ? null : (
                  <RouteCanvas
                    stops={markers}
                    route={planRoute(geometry, positionedStops)}
                    phase="ready"
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
              selectedLeg={selectedLegDetails}
              controlsSlot={
                <RouteEndpointControls
                  start={draft.routeStart}
                  end={draft.routeEnd}
                  locationState={location.state.kind}
                  onChooseStart={(choice) => {
                    void chooseStart(choice);
                  }}
                  onChooseEnd={(choice) => {
                    void chooseEnd(choice);
                  }}
                  onReset={resetRoute}
                  disabled={isOptimizing}
                  theme={theme}
                />
              }
              noticeSlot={
                routeSync.failure === null ? null : (
                  <RouteSaveNotice
                    failure={routeSync.failure}
                    isSaving={routeSync.isSaving}
                    onRetry={() => {
                      void routeSync.sync();
                    }}
                    theme={theme}
                  />
                )
              }
              onOpenSearch={() => setIsSearchOpen(true)}
              onSearchLayout={setRouteSearchY}
              onDismissMap={() => {
                /**
                 * **The result stays.** This used to call `clearResult()`, so the
                 * three lines threw away an optimization the user had already paid
                 * for: the route stopped being optimized, Confirm turned back into
                 * Optimize, and the only way back to the map was to spend another
                 * unit of quota on an answer we were still holding.
                 *
                 * What the control says is "back to the stop list", and that is now
                 * all it does.
                 */
                setRouteView(
                  routeViewAfter({ kind: 'dismissed' }, { current: routeView, hasResult: true }),
                );
              }}
              stops={rows}
              onSelectStop={selectStop}
              onRemoveStop={removeStopById}
              onPrimaryAction={() => {
                // The control's own state already says which of the two this is; the
                // screen only has to route the tap. `planStateOf` decided that, and
                // re-deriving it here would be the same rule in two places.
                if (state.kind !== 'optimized') {
                  if (needsCurrentLocation) {
                    void location.enable();
                    return;
                  }
                  optimize();
                  return;
                }

                // Confirm. `useHandoff` records the departure **before** it opens
                // anything — that write is what moves the route to `in_progress`
                // and therefore into History, which is exactly what was not
                // happening (`docs/11_STATE_MANAGEMENT.md` §7).
                void handoff.start();
              }}
              theme={theme}
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
          <SectionPanel
            theme={theme}
            topInset={insets.top}
            dockHeight={0}
            testID="section-settings"
          >
            <SettingsSection
              theme={theme}
              initialView={settingsEntry}
              onBack={() => openSection('itinerary')}
            />
          </SectionPanel>
        )}

        {activeSection !== 'settings' && (
          <Pressable
            onPress={() => {
              setSettingsEntry('settings');
              openSection('settings');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={{
              position: 'absolute',
              top: insets.top + space.space3,
              right: space.space3,
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colours[theme].surfaceRaised,
              borderWidth: 1,
              borderColor: colours[theme].border,
            }}
            testID="open-settings"
          >
            <Text style={{ color: colours[theme].textPrimary, fontSize: 21, fontWeight: '700' }}>
              ⚙
            </Text>
          </Pressable>
        )}

        {activeSection !== 'settings' && !isMapShowing && (
          <Dock
            // The gesture bar sits below the dock rather than behind it.
            bottomInset={insets.bottom}
            items={dockItems(activeSection, { isRouteInProgress: false })}
            onSelect={(section) => {
              openSection(toggleSection(activeSection, section));
            }}
            theme={theme}
            testID="plan-dock"
          />
        )}
      </View>

      {isSearchOpen && activeSection === 'itinerary' && !isMapShowing && (
        <InlineStopSearch
          theme={theme}
          topOffset={insets.top + layout.screenPadding + routeSearchY}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
    </View>
  );
}
