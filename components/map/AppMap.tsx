import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { MapAttribution } from './MapAttribution';
import { colours, durationFor, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { boundsFor, planMarkers, regionToViewport, viewportToRegion } from '@/lib/map/clustering';
import type { CameraRegion, DrawnPin, MarkerInput, Viewport } from '@/lib/map/clustering';
import { coordinatesToFit, planRoute } from '@/lib/map/route-geometry';
import type { DrawnRoute } from '@/lib/map/route-geometry';
import {
  CLUSTER_SIZE,
  MARKER_SIZE,
  MARKER_SIZE_SELECTED,
  mapIdFor,
  markerStyle,
  routeStroke,
} from '@/lib/map/style';
import type { MapIdConfig } from '@/lib/map/style';
import { baseMapStyle } from '@/lib/map/base-style';
import type { AppMapHandle, MapBounds, MapCamera, RouteGeometry } from '@/lib/providers/types';

/**
 * The map facade.
 *
 * **The only module in the codebase that imports `react-native-maps`**
 * (`CLAUDE.md` §0 rule 2, [ADR-0005](../../docs/adr/0005-map-engine-and-route-preview.md)).
 * That single import is what makes the Expo-upgrade fragility of risk C6 a
 * one-file problem, and what makes the MapLibre exit of ADR-0012 a second
 * adapter rather than a rewrite of every screen.
 *
 * Its props are the product's vocabulary — stops, route, selected stop, theme.
 * A prop named after a library concept would mean the facade is leaking
 * ([`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../../docs/14_GOOGLE_MAPS_INTEGRATION.md) §4).
 *
 * **It decides nothing.** What to cluster, what the route line looks like, which
 * Map ID a theme uses, whether a degraded result may be drawn as a road — all of
 * that lives in `lib/map/` as pure functions and is tested without a renderer.
 * What is left here is driving the SDK, which is the one thing that cannot be
 * unit tested and the one thing that breaks on an SDK upgrade. Keeping the two
 * apart is the whole point of the file.
 *
 * **The map is one accessibility element.** Individual markers are not
 * traversable: a screen reader user cannot usefully explore pins by touch, and
 * the stop list is the accessible equivalent
 * ([`docs/23_ACCESSIBILITY.md`](../../docs/23_ACCESSIBILITY.md)). The map carries
 * a summary label instead — "Route map, 12 stops".
 *
 * Styling is inline rather than NativeWind throughout, because nearly every
 * value here is computed per marker from the tokens. `CLAUDE.md` §8 rule 8
 * forbids mixing the two in one component, so this one commits to values.
 */

export type MapStatus = 'ready' | 'offline' | 'failed';

export interface AppMapProps {
  /** In visiting order. Position is the ordinal the user reads while driving. */
  readonly stops: readonly MarkerInput[];
  /** Built once at receipt with `buildRouteGeometry`, never decoded per render. */
  readonly route: RouteGeometry | null;
  readonly selectedStopId: string | null;
  readonly theme: ThemeName;
  readonly mapIds: MapIdConfig;
  readonly status: MapStatus;
  onStopPress: (stopId: string) => void;
  onMapPress: () => void;
  /** Offered in the failed state. Without one the state is still explained; it
   *  just has no next action beyond the dock, which stays fully usable. */
  onRetry?: () => void;
  /**
   * Fraction of the map's bottom edge covered by something else — today the dock
   * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)). The camera fits
   * around it and the attribution clears it.
   *
   * Named for what it is rather than for what used to cause it: this was
   * `sheetFraction` and defaulted to 0.4, a number that meant "a half-open
   * sheet" and kept padding the camera for a sheet that no longer exists. Zero
   * is the honest default — nothing covers the map unless a caller says so.
   */
  readonly bottomObstructionFraction?: number;
  /** Transitions become instant (`CLAUDE.md` §10 rule 6). Injected rather than
   *  read here, so the whole tree answers the question the same way. */
  readonly prefersReducedMotion?: boolean;
  /** Reported so the screen can name the stops it could not draw, rather than
   *  leaving the user to count pins and find one short (ADR-0007). */
  onUndrawableStops?: (stopIds: readonly string[]) => void;
  /** A road route whose geometry would not decode is a defect, not a user
   *  error: markers are drawn and this fires so it can be recorded. */
  onGeometryDefect?: () => void;
  readonly testID?: string;
}

/** Where the camera sits before any stop exists. Northern Italy, wide enough to
 *  be recognisable and specific enough not to look like a broken map. */
const INITIAL_REGION: CameraRegion = {
  latitude: 45.6983,
  longitude: 9.6773,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

export const AppMap = forwardRef<AppMapHandle, AppMapProps>(function AppMap(
  {
    stops,
    route,
    selectedStopId,
    theme,
    mapIds,
    status,
    onStopPress,
    onMapPress,
    onRetry,
    bottomObstructionFraction = 0,
    prefersReducedMotion = false,
    onUndrawableStops,
    onGeometryDefect,
    testID,
  },
  ref,
) {
  const palette = colours[theme];
  const mapRef = useRef<MapView | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [height, setHeight] = useState(0);
  const [viewport, setViewport] = useState<Viewport>(() => regionToViewport(INITIAL_REGION));

  // The camera stops following after any gesture, and a Recenter control returns
  // it (docs/14 §9). A ref, not state: nothing renders differently because of
  // it, and re-rendering the map on a pan is exactly the frame cost the budget
  // has no room for.
  const isFollowingRef = useRef(true);

  const drawnRoute = useMemo(
    () =>
      planRoute(
        route,
        stops.map((stop) => ({ stopId: stop.stopId, coordinate: stop.coordinate })),
      ),
    [route, stops],
  );

  const plan = useMemo(
    () => planMarkers(stops, viewport, { selectedStopId }),
    [stops, viewport, selectedStopId],
  );

  // Reported rather than returned, so the screen can name them. The dependency
  // is the joined ids and not the array, because the plan rebuilds on every
  // camera move and the set of undrawable stops does not.
  const undrawableKey = plan.undrawableStopIds.join(',');
  useEffect(() => {
    if (undrawableKey === '') return;
    onUndrawableStops?.(undrawableKey.split(','));
  }, [undrawableKey, onUndrawableStops]);

  useEffect(() => {
    if (drawnRoute.kind === 'none' && drawnRoute.reason === 'undecodable') onGeometryDefect?.();
  }, [drawnRoute, onGeometryDefect]);

  const fitCoordinates = useMemo(
    () =>
      coordinatesToFit(
        drawnRoute,
        stops.map((s) => ({ stopId: s.stopId, coordinate: s.coordinate })),
      ),
    [drawnRoute, stops],
  );

  const fitToBounds = useCallback(
    (bounds: MapBounds, padding: { readonly bottom: number }) => {
      mapRef.current?.fitToCoordinates([bounds.northEast, bounds.southWest], {
        edgePadding: {
          top: layout.screenPadding,
          left: layout.screenPadding,
          right: layout.screenPadding,
          bottom: padding.bottom,
        },
        animated: !prefersReducedMotion,
      });
    },
    [prefersReducedMotion],
  );

  useImperativeHandle(
    ref,
    (): AppMapHandle => ({
      fitToBounds: (bounds, padding) => {
        // An explicit fit is the Recenter control: it resumes following, which
        // is the only way back once a gesture has stopped it.
        isFollowingRef.current = true;
        fitToBounds(bounds, padding);
      },
      moveTo: (camera: MapCamera, animated: boolean) => {
        isFollowingRef.current = false;
        const target = { center: camera.center, zoom: camera.zoom };
        if (animated && !prefersReducedMotion) {
          mapRef.current?.animateCamera(target, { duration: durationFor('standard', false) });
        } else {
          mapRef.current?.setCamera(target);
        }
      },
      snapshot: async () => {
        const map = mapRef.current;
        // A handle method that resolves to nothing would make every caller write
        // a check they will forget. Rejecting says what happened.
        if (map === null) throw new Error('The map is not mounted');
        return map.takeSnapshot({ format: 'png', quality: 0.9, result: 'base64' });
      },
    }),
    [fitToBounds, prefersReducedMotion],
  );

  // A new route fits the camera to it — but only while following, so the fit
  // never yanks the map out from under a user who is looking at something.
  useEffect(() => {
    if (!isReady || !isFollowingRef.current || fitCoordinates.length === 0) return;
    const bounds = boundsFor(fitCoordinates, bottomObstructionFraction);
    if (bounds === null) return;
    fitToBounds(bounds, { bottom: layout.screenPadding + height * bottomObstructionFraction });
  }, [fitCoordinates, isReady, bottomObstructionFraction, height, fitToBounds]);

  const handleRegionChange = useCallback((region: CameraRegion) => {
    setViewport(regionToViewport(region));
  }, []);

  const summary = `Route map, ${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`;
  const resolvedMapId = mapIdFor(theme, mapIds);

  if (status !== 'ready') {
    return <MapUnavailable theme={theme} status={status} onRetry={onRetry} testID={testID} />;
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg }}
      onLayout={(event) => {
        setHeight(event.nativeEvent.layout.height);
      }}
      testID={testID}
    >
      <MapView
        ref={mapRef}
        testID="app-map"
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={viewportToRegion(viewport)}
        // A configured Map ID wins, because Cloud styling overrides JSON and
        // passing both would silently ignore one of them. Without one — which is
        // the normal case and no longer a misconfiguration — the repository's own
        // style applies, so the product looks like the product with nothing set
        // up in the Google console (risk C15, `lib/map/base-style.ts`).
        {...(resolvedMapId === null
          ? { customMapStyle: baseMapStyle(theme) }
          : { googleMapId: resolvedMapId })}
        onMapReady={() => {
          setIsReady(true);
        }}
        onRegionChangeComplete={handleRegionChange}
        onPanDrag={() => {
          isFollowingRef.current = false;
        }}
        onPress={onMapPress}
        // One element with a summary. Markers are not traversable; the stop list
        // is the accessible equivalent (docs/23_ACCESSIBILITY.md).
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        toolbarEnabled={false}
        showsMyLocationButton={false}
      >
        <RouteLine drawn={drawnRoute} theme={theme} />
        {plan.pins.map((pin) => (
          <MapPin
            key={pin.kind === 'cluster' ? pin.id : pin.stopId}
            pin={pin}
            theme={theme}
            isSelected={pin.kind === 'marker' && pin.stopId === selectedStopId}
            onPress={onStopPress}
          />
        ))}
      </MapView>

      {/* Never a grey void: the map's own surface, at `bg`, until the SDK has
          something to show (docs/09_COMPONENT_LIBRARY.md §6). */}
      {!isReady && (
        <View
          testID="app-map-loading"
          pointerEvents="none"
          accessibilityLabel="Loading the map"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: palette.bg,
          }}
        />
      )}

      <MapAttribution
        theme={theme}
        bottomOffset={height * bottomObstructionFraction}
        testID="app-map-attribution"
      />
    </View>
  );
});

// ─── The route line ──────────────────────────────────────────────────────────

/**
 * Two polylines for a road route in light theme, one in dark, and a separate
 * dashed segment per pair for a degraded one.
 *
 * The degraded form is separate segments rather than one dashed path on purpose:
 * a single path would join at the stops and read as continuous, which is exactly
 * the impression a T0 result must not give.
 */
const RouteLine = memo(function RouteLine({
  drawn,
  theme,
}: {
  drawn: DrawnRoute;
  theme: ThemeName;
}): React.JSX.Element | null {
  if (drawn.kind === 'none') return null;

  const style = routeStroke(theme, drawn.kind === 'connectors');

  if (drawn.kind === 'connectors') {
    return (
      <>
        {drawn.segments.map((segment) => (
          <Polyline
            key={segment.id}
            testID="route-connector"
            coordinates={[segment.from, segment.to]}
            strokeColor={style.colour}
            strokeWidth={style.width}
            {...(style.dashPattern === null ? {} : { lineDashPattern: [...style.dashPattern] })}
            lineCap="round"
          />
        ))}
      </>
    );
  }

  return (
    <>
      {style.casing !== null && (
        // Drawn first, so it sits underneath. The SDK has no outline on a
        // polyline; a wider line beneath is what produces the border.
        <Polyline
          testID="route-casing"
          coordinates={[...drawn.path]}
          strokeColor={style.casing.colour}
          strokeWidth={style.casing.width}
          lineCap="round"
          lineJoin="round"
        />
      )}
      <Polyline
        testID="route-line"
        coordinates={[...drawn.path]}
        strokeColor={style.colour}
        strokeWidth={style.width}
        lineCap="round"
        lineJoin="round"
      />
    </>
  );
});

// ─── Pins ────────────────────────────────────────────────────────────────────

/**
 * One marker or one cluster.
 *
 * Memoised by what it draws, because the plan rebuilds on every camera move and
 * without this every pan re-renders twenty-five native views
 * (docs/24_PERFORMANCE.md).
 */
const MapPin = memo(
  function MapPin({
    pin,
    theme,
    isSelected,
    onPress,
  }: {
    pin: DrawnPin;
    theme: ThemeName;
    isSelected: boolean;
    onPress: (stopId: string) => void;
  }): React.JSX.Element {
    const palette = colours[theme];

    if (pin.kind === 'cluster') {
      return (
        <Marker
          testID="map-cluster"
          coordinate={pin.coordinate}
          onPress={() => {
            // Tapping a cluster selects its first stop, which is what moves the
            // list and the camera. Zooming to its bounds is the screen's job —
            // it owns the camera through the handle.
            const first = pin.stopIds[0];
            if (first !== undefined) onPress(first);
          }}
          tracksViewChanges={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <HitArea>
            <View
              style={{
                width: CLUSTER_SIZE,
                height: CLUSTER_SIZE,
                borderRadius: radius.radiusFull,
                backgroundColor: palette.surface,
                // The warning is raised to the cluster so a problem is visible at
                // the zoom the user is at, not only after they go looking.
                borderColor: pin.hasUnreachable ? palette.danger : palette.textPrimary,
                borderWidth: 2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '600' }}>
                {pin.count}
              </Text>
            </View>
          </HitArea>
        </Marker>
      );
    }

    const style = markerStyle(theme, pin.state, isSelected);
    const size = isSelected ? MARKER_SIZE_SELECTED : MARKER_SIZE;

    return (
      <Marker
        testID="map-marker"
        coordinate={pin.coordinate}
        onPress={() => {
          onPress(pin.stopId);
        }}
        // Redrawing a marker view on every frame is the single most expensive
        // thing this map can do on Android. The view only changes when the pin's
        // memo inputs change, and the memo above is what guards that.
        tracksViewChanges={false}
        zIndex={isSelected ? 2 : 1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <HitArea>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: radius.radiusFull,
              backgroundColor: style.fill,
              borderColor: style.border,
              borderWidth: 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* The glyph replaces the ordinal, never merely tints it: never
                colour alone (CLAUDE.md §10 rule 4). */}
            <Text style={{ color: style.foreground, fontSize: 13, fontWeight: '600' }}>
              {style.glyph ?? pin.position}
            </Text>
          </View>
        </HitArea>
      </Marker>
    );
  },
  (a, b) =>
    a.theme === b.theme &&
    a.isSelected === b.isSelected &&
    a.onPress === b.onPress &&
    samePin(a.pin, b.pin),
);

function samePin(a: DrawnPin, b: DrawnPin): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cluster' && b.kind === 'cluster') {
    return a.id === b.id && a.count === b.count && a.hasUnreachable === b.hasUnreachable;
  }
  if (a.kind === 'marker' && b.kind === 'marker') {
    return (
      a.stopId === b.stopId &&
      a.position === b.position &&
      a.state === b.state &&
      a.coordinate.latitude === b.coordinate.latitude &&
      a.coordinate.longitude === b.coordinate.longitude
    );
  }
  return false;
}

/** 44×44 pt around whatever it wraps. The drawn pin may be smaller than its hit
 *  area, but the hit area may not shrink (`CLAUDE.md` §10 rule 2). */
function HitArea({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <View
      testID="marker-hit-area"
      style={{
        width: layout.touchMin,
        height: layout.touchMin,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

// ─── When there is no map ────────────────────────────────────────────────────

/**
 * Offline and failed, both designed rather than left blank (`CLAUDE.md` §7
 * rule 5), and both saying the same reassuring thing: the sheet still works.
 * That sentence is the product's actual behaviour — the stop list, the order and
 * the handoff do not depend on tiles rendering.
 *
 * No attribution here, deliberately: the obligation attaches to Google content
 * being shown, and in this state none is.
 */
function MapUnavailable({
  theme,
  status,
  onRetry,
  testID,
}: {
  theme: ThemeName;
  status: Exclude<MapStatus, 'ready'>;
  onRetry: (() => void) | undefined;
  testID: string | undefined;
}): React.JSX.Element {
  const palette = colours[theme];
  const copy =
    status === 'offline'
      ? { title: 'Map unavailable offline', body: 'Your stops and route are still here.' }
      : { title: 'The map could not load', body: 'Your stops and route are still here.' };

  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: layout.screenPadding,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: palette.textPrimary, fontSize: 17, fontWeight: '600' }}
      >
        {copy.title}
      </Text>
      <Text
        style={{
          color: palette.textSecondary,
          fontSize: 16,
          marginTop: space.space2,
          textAlign: 'center',
        }}
      >
        {copy.body}
      </Text>

      {onRetry !== undefined && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try loading the map again"
          style={{
            minHeight: layout.touchMin,
            justifyContent: 'center',
            paddingHorizontal: space.space5,
            marginTop: space.space4,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.accent,
          }}
        >
          <Text style={{ color: palette.accentOn, fontSize: 16, fontWeight: '600' }}>
            Try again
          </Text>
        </Pressable>
      )}
    </View>
  );
}
