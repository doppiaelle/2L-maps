import { memo, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { MapAttribution } from './MapAttribution';
import { colours, mapColours, radius, space, stroke } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { LatLng } from '@/lib/geo/haversine';
import { landmassFor } from '@/lib/map/landmass';
import { fitProjection, metresPerPoint, pathThrough } from '@/lib/map/projection';
import { sceneryFor } from '@/lib/map/scenery';
import type { Scenery } from '@/lib/map/scenery';
import type { Point } from '@/lib/map/projection';
import { simplify } from '@/lib/map/simplify';
import { legAtScreenPoint } from '@/lib/map/leg-selection';
import { clampViewport, FITTED, MAX_SCALE, MIN_SCALE } from '@/lib/map/viewport';
import { MARKER_SIZE, MARKER_SIZE_SELECTED, markerStyle } from '@/lib/map/style';
import type { DrawnRoute } from '@/lib/map/route-geometry';
import type { StopProgressState } from '@/lib/route/progress';

/**
 * The route, drawn.
 *
 * **This replaces the Google map** ([ADR-0021](../../docs/adr/0021-drawn-route-preview.md)),
 * and that decision carries a risk recorded in the ADR rather than in a comment:
 * the coordinates and the road geometry are Google-derived, and Google's terms
 * forbid displaying their content on a surface that is not a Google map. The
 * user was told and chose to proceed. Nothing here is written as though the
 * question does not exist.
 *
 * What it draws is the shape of a day: the stops in their real relative
 * positions, the path between them, and nothing else. No roads, no place names,
 * no tiles — which is also why it needs no network, works in a basement, and
 * costs nothing per view.
 *
 * **It decides nothing.** `fitProjection` places the coordinates, `simplify`
 * decides which points survive, `planRoute` decides whether there is a road
 * shape to draw or only connectors, and `markerStyle` says what a pin looks like
 * in each state. All of them are pure and tested without a renderer; what is
 * left here is turning their answers into SVG.
 *
 * **The T0 distinction survives intact.** A degraded result draws as separate
 * dashed segments, never as a continuous road-shaped line — a straight-line
 * ordering drawn as a smooth curve would imply road routing that did not happen
 * ([`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../../docs/14_GOOGLE_MAPS_INTEGRATION.md)).
 * That is a correctness rule, not a style one, and it did not become optional
 * because the renderer changed.
 */

export interface CanvasStop {
  readonly stopId: string;
  /** The ordinal the driver reads. */
  readonly position: number;
  /** Null when the coordinate has expired or was never fetched (ADR-0007).
   *  Such a stop cannot be placed and is reported rather than dropped. */
  readonly coordinate: LatLng | null;
  readonly state: StopProgressState;
}

export interface RouteCanvasProps {
  readonly stops: readonly CanvasStop[];
  readonly route: DrawnRoute;
  readonly selectedStopId: string | null;
  readonly theme: ThemeName;
  /** Named so the screen can say which stops it could not draw, rather than
   *  leaving the user to count pins and find one short. */
  readonly undrawableStopIds?: readonly string[];
  /**
   * Anything stable and route-specific. The drawn town is generated from it, so
   * the same route draws the same streets on every device and every render —
   * scenery that reshuffled would read as movement on a canvas whose job is to
   * hold still ([`lib/map/scenery.ts`](../../lib/map/scenery.ts)).
   */
  readonly scenerySeed?: string;
  /**
   * Whether this is the answer or the wait for it.
   *
   * `preparing` draws the same canvas at the same size from the stops we already
   * hold, so **nothing moves when the result lands** — which is the whole
   * difference between a skeleton and a spinner (`CLAUDE.md` §7 rule 5). What it
   * withholds is every claim: the connectors are neutral rather than the
   * degraded warning style, the pins carry no ordinals, and the summary says the
   * route is being worked out rather than describing one.
   */
  readonly phase?: 'ready' | 'preparing';
  /**
   * Which hop is being inspected, and how to say one was tapped.
   *
   * Every optimization already returns a distance and a duration **per leg** —
   * the field mask buys them and nothing was showing them. Tapping one costs no
   * request ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
   * Omitted together, the route draws as one line and nothing is tappable.
   */
  readonly selectedLegIndex?: number | null;
  onSelectLeg?: (index: number | null) => void;
  readonly testID?: string;
}

/**
 * The margin the drawing keeps from the canvas edge.
 *
 * A stop sits at the centre of its pin, so a stop projected exactly onto the
 * edge of its own bounding box would have half its marker off the canvas — and
 * the first and last stop of every route are on that edge by definition.
 */
const CANVAS_PADDING = MARKER_SIZE_SELECTED / 2 + space.space3;

/** Nothing to draw around. Frozen so the empty case is one object rather than a
 *  new pair of arrays on every render. */
const EMPTY_SCENERY: Scenery = { roads: [], blocks: [], areas: [] };

/** The navigator's triangle, pointing along positive x before rotation. Drawn
 *  once and turned to the route's first bearing — a shape that says "you start
 *  here, facing this way" without a word of copy. */
const ORIGIN_TRIANGLE = 'M 9 0 L -6 6.5 L -3 0 L -6 -6.5 Z';

export const RouteCanvas = memo(function RouteCanvas({
  stops,
  route,
  selectedStopId,
  theme,
  undrawableStopIds = [],
  scenerySeed = '',
  phase = 'ready',
  selectedLegIndex = null,
  onSelectLeg,
  testID,
}: RouteCanvasProps): React.JSX.Element {
  const isPreparing = phase === 'preparing';
  const isInspectable = onSelectLeg !== undefined && !isPreparing;
  const palette = colours[theme];
  const map = mapColours[theme];
  const [size, setSize] = useState({ width: 0, height: 0 });

  const drawn = useMemo(() => {
    const placed = stops.filter(
      (stop): stop is CanvasStop & { coordinate: LatLng } => stop.coordinate !== null,
    );

    // Everything the canvas has to contain: the stops, and the road path where
    // there is one. Fitting to the stops alone would clip a motorway that loops
    // well outside the bounding box of the deliveries themselves.
    const extent: LatLng[] = [
      ...placed.map((stop) => stop.coordinate),
      ...(route.kind === 'road' ? route.path : []),
    ];

    const projection = fitProjection(extent, size, CANVAS_PADDING);
    // How much ground a point covers, which is what decides whether this canvas
    // gets streets or a coastline. They never both draw.
    const ground = metresPerPoint(projection.scale);
    const land = landmassFor({ projection, size, metresPerPoint: ground });

    const pins = placed.map((stop) => ({
      stopId: stop.stopId,
      position: stop.position,
      state: stop.state,
      point: projection.project(stop.coordinate),
    }));

    if (route.kind === 'road') {
      // Simplified after projection, never before: a tolerance in degrees means
      // a different amount of detail at every latitude and every zoom.
      const projected = simplify(route.path.map(projection.project));
      // Each leg simplified on its own, so a tap is tested against the same
      // vertices that are drawn. Testing against the unsimplified geometry
      // would answer about a line nobody can see.
      const legs = route.legPaths
        .map((leg) => simplify(leg.map(projection.project)))
        .map((points) => ({ points, d: pathThrough(points) }));
      return {
        pins,
        land,
        road: pathThrough(projected),
        legs,
        segments: [],
        // The town is generated around the *simplified* line, so the scenery and
        // the route agree about where the route is.
        scenery: sceneryFor({ path: projected, size, seed: scenerySeed, metresPerPoint: ground }),
        heading: projected,
      };
    }

    if (route.kind === 'connectors') {
      const through = pins.map((pin) => pin.point);
      return {
        pins,
        land,
        road: null,
        // A T0 result has no per-leg geometry to inspect, and the waiting face
        // has no result at all. Nothing to tap in either case.
        legs: [],
        scenery: sceneryFor({ path: through, size, seed: scenerySeed, metresPerPoint: ground }),
        heading: through,
        // Separate paths rather than one dashed line through every stop. A
        // single path would join at the stops and read as continuous, which is
        // the one impression a degraded result must not give.
        segments: route.segments.map((segment) => ({
          id: segment.id,
          d: pathThrough([projection.project(segment.from), projection.project(segment.to)]),
        })),
      };
    }

    return { pins, land, road: null, legs: [], segments: [], scenery: EMPTY_SCENERY, heading: [] };
  }, [stops, route, size, scenerySeed]);

  // Only a *result* can be degraded. While preparing, the connectors are the
  // stops in the order they were typed and claim nothing about distance or
  // traffic — calling that "straight-line estimate" would announce a degraded
  // answer for a route that has not been computed at all.
  const selectedLeg = selectedLegIndex === null ? null : (drawn.legs[selectedLegIndex] ?? null);

  /**
   * The lens over the drawing.
   *
   * **Shared values, not React state.** A pinch that re-rendered on every frame
   * would put the whole canvas through reconciliation during a gesture, which is
   * the one thing `CLAUDE.md` §6 rule 5 forbids. These live on the UI thread and
   * the transform follows them there; JavaScript hears about it once, when a
   * finger lifts, so the tap handler has a viewport to invert with.
   */
  const zoom = useSharedValue(FITTED.scale);
  const offsetX = useSharedValue(FITTED.translateX);
  const offsetY = useSharedValue(FITTED.translateY);
  const [viewport, setViewport] = useState(FITTED);

  const lens = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: zoom.value },
    ],
  }));

  /**
   * A tap, answered in canvas coordinates.
   *
   * The gesture reports where the finger landed on the **container**, which is
   * not transformed; the legs it might have hit are in canvas coordinates, which
   * are. `toCanvas` is the exact inverse of what the lens does, and getting the
   * direction backwards would select a hop the finger was nowhere near — while
   * looking entirely plausible on screen.
   */
  const selectLegAt = (x: number, y: number) => {
    if (!isInspectable) return;
    onSelectLeg?.(
      legAtScreenPoint(
        { x, y },
        viewport,
        drawn.legs.map((leg) => leg.points),
      ),
    );
  };

  const gestures = useMemo(() => {
    const settle = () => {
      // The clamp is applied on the UI thread as the gesture runs; this is the
      // same answer, handed to JavaScript so a tap can be inverted with it.
      setViewport(
        clampViewport(
          { scale: zoom.value, translateX: offsetX.value, translateY: offsetY.value },
          size,
        ),
      );
    };

    const pinch = Gesture.Pinch()
      .onChange((event) => {
        'worklet';
        const next = Math.min(Math.max(zoom.value * event.scaleChange, MIN_SCALE), MAX_SCALE);
        // The canvas point under the fingers, held still across the change —
        // the user pinched on a stop because that is the part they want larger.
        const anchorX = (event.focalX - offsetX.value) / zoom.value;
        const anchorY = (event.focalY - offsetY.value) / zoom.value;

        zoom.value = next;
        offsetX.value = event.focalX - anchorX * next;
        offsetY.value = event.focalY - anchorY * next;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(settle)();
      });

    const drag = Gesture.Pan()
      .onChange((event) => {
        'worklet';
        // Nothing to drag at the fitted view: the drawing is exactly the window.
        if (zoom.value <= MIN_SCALE) return;
        offsetX.value += event.changeX;
        offsetY.value += event.changeY;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(settle)();
      });

    const reset = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        'worklet';
        zoom.value = FITTED.scale;
        offsetX.value = FITTED.translateX;
        offsetY.value = FITTED.translateY;
        runOnJS(setViewport)(FITTED);
      });

    const inspect = Gesture.Tap().onEnd((event) => {
      'worklet';
      runOnJS(selectLegAt)(event.x, event.y);
    });

    // The double tap is given first refusal, so a second tap arriving inside the
    // window is a reset rather than two selections.
    return Gesture.Exclusive(Gesture.Simultaneous(pinch, drag), reset, inspect);
    // `selectLegAt` is stable enough for this: it is recreated with `drawn`, and
    // a gesture rebuilt mid-pinch would drop the pinch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, zoom, offsetX, offsetY, drawn.legs, viewport, isInspectable]);

  const isDegraded = !isPreparing && route.kind === 'connectors';
  const summary = isPreparing
    ? `Working out the fastest order for ${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`
    : `Route preview, ${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}${
        isDegraded ? ', straight-line estimate' : ''
      }`;

  return (
    <View
      // No corner radius and no inset: the drawing is the ground the section
      // stands on, and it runs under the dock rather than stopping at it
      // (ADR-0022). A rounded card would read as a panel with a map inside it.
      // Behind the SVG rather than instead of it. The rectangle above decides
      // whether the drawing is land or sea; this is only what shows in the
      // instant before the canvas has measured itself.
      style={{ flex: 1, backgroundColor: map.land }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
      // One element with a summary. Individual pins are not traversable: a
      // screen-reader user cannot usefully explore a canvas by touch, and the
      // stop list is the accessible equivalent
      // ([`docs/23_ACCESSIBILITY.md`](../../docs/23_ACCESSIBILITY.md)).
      accessible
      // `progressbar` while preparing, so a screen reader says work is happening
      // rather than describing a picture of a route that does not exist yet
      // (`CLAUDE.md` §10 rule 7).
      accessibilityRole={isPreparing ? 'progressbar' : 'image'}
      accessibilityLabel={summary}
      testID={testID}
    >
      {size.width > 0 && size.height > 0 && (
        <GestureDetector gesture={gestures}>
          {/* The transform sits on the container rather than on each shape: the
              whole picture grows, strokes and pins with it, which is the
              paper-map-under-a-lens model. An SVG that kept its stroke widths
              while the geometry grew would imply a map that knows more when you
              look closer, and this one does not (`lib/map/viewport.ts`). */}
          <Animated.View style={[{ width: size.width, height: size.height }, lens]}>
            <Svg width={size.width} height={size.height} testID="route-canvas-svg">
              {/* The ground. A rectangle rather than the container's background so
              the whole drawing is one surface the SVG owns — and so a future
              snapshot exports what is on screen rather than a transparent hole.

              **Sea, when there is a coastline to lay on it.** At the scale where
              the invented town would be a lie the rectangle becomes water and
              the landmasses go over it (ADR-0028); at every other scale it stays
              land, exactly as before, because a coastline a few kilometres
              across is one edge of one country and reads as nothing. */}
              <Rect
                x={0}
                y={0}
                width={size.width}
                height={size.height}
                fill={drawn.land.length > 0 ? map.water : map.land}
              />

              {/* Public-domain geometry under Google-derived stops: the hybrid
                  ADR-0012 rejects by name, chosen by the product owner with the
                  risk stated (ADR-0028). Outlines only — no borders, no roads,
                  no names, nothing that would claim to be a map service. */}
              {drawn.land.map((shape) => (
                <Path key={shape.id} testID="landmass" d={shape.d} fill={map.land} />
              ))}

              {/* The invented town, underneath everything. Blocks first, then the
              minor streets, then the through-roads — the order a real map is
              printed in, and the order that keeps the route on top of all of it.

              **These streets are not real** and the code that makes them says so
              (`lib/map/scenery.ts`). Drawing real ones would mean putting
              Google-derived stops on somebody else's map, which ADR-0012 rejects
              by name and `CLAUDE.md` §13 rule 5 forbids widening. */}
              {drawn.scenery.blocks.map((block) => (
                <Rect
                  key={block.id}
                  testID="scenery-block"
                  x={block.x}
                  y={block.y}
                  width={block.width}
                  height={block.height}
                  rx={4}
                  fill={map.block}
                  opacity={block.opacity}
                  transform={`rotate(${block.rotation} ${block.x + block.width / 2} ${block.y + block.height / 2})`}
                />
              ))}

              {drawn.scenery.areas.map((area) => (
                <Rect
                  key={area.id}
                  testID={`scenery-${area.kind}`}
                  x={area.x}
                  y={area.y}
                  width={area.width}
                  height={area.height}
                  rx={area.kind === 'park' ? 7 : 2}
                  fill={
                    area.kind === 'park'
                      ? map.park
                      : area.kind === 'square'
                        ? map.square
                        : map.building
                  }
                  stroke={area.kind === 'building' ? map.block : 'none'}
                  strokeWidth={area.kind === 'building' ? 0.8 : 0}
                  opacity={area.opacity}
                  transform={`rotate(${area.rotation} ${area.x + area.width / 2} ${area.y + area.height / 2})`}
                />
              ))}

              {drawn.scenery.roads.map((road) => (
                <Line
                  key={road.id}
                  testID="scenery-road"
                  x1={road.from.x}
                  y1={road.from.y}
                  x2={road.to.x}
                  y2={road.to.y}
                  stroke={road.isArterial ? map.road : map.roadMinor}
                  strokeWidth={road.isArterial ? stroke.sceneryArterial : stroke.sceneryMinor}
                  strokeLinecap="round"
                  opacity={road.opacity}
                />
              ))}

              {drawn.road !== null && (
                <>
                  {map.routeCasing !== null && (
                    // Drawn first, so it sits underneath. SVG has no outline on a
                    // path; a wider line beneath it is what produces the border, and
                    // in light theme mint on paper-white is this system's weakest
                    // pairing without it.
                    <Path
                      testID="route-casing"
                      d={drawn.road}
                      stroke={map.routeCasing}
                      strokeWidth={stroke.routeCasing}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                  <Path
                    testID="route-line"
                    d={drawn.road}
                    stroke={palette.accent}
                    strokeWidth={stroke.route}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    // Dimmed, not hidden, while one hop is being inspected: the rest
                    // of the day is still the context that makes the selected hop
                    // mean anything.
                    opacity={selectedLegIndex === null ? 1 : DIMMED_ROUTE_OPACITY}
                    fill="none"
                  />

                  {/* The hop being inspected, drawn over the dimmed rest of the
                  route at the casing's width so it reads as the same line
                  brought forward rather than a different one laid on top. */}
                  {selectedLeg !== null && (
                    <Path
                      testID="route-leg-selected"
                      d={selectedLeg.d}
                      stroke={palette.accent}
                      strokeWidth={stroke.routeCasing}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                </>
              )}

              {drawn.segments.map((segment) => (
                <Path
                  key={segment.id}
                  testID={isPreparing ? 'route-pending-connector' : 'route-connector'}
                  d={segment.d}
                  // Warning yellow says "degraded result" and is reserved for one.
                  // While preparing there is no result to describe, so the line is
                  // the quietest thing on the canvas — a placeholder holding the
                  // space the mint route is about to take.
                  stroke={isPreparing ? palette.textTertiary : palette.warning}
                  strokeWidth={stroke.routeDegraded}
                  strokeDasharray={DEGRADED_DASH}
                  strokeLinecap="round"
                  opacity={isPreparing ? PREPARING_OPACITY : 1}
                  fill="none"
                />
              ))}

              {/* Where the driver sets off, and which way. The one piece of chrome
              on the canvas that is about them rather than about the route.
              Absent while preparing: which stop comes first is precisely the
              question being asked. */}
              {drawn.heading.length >= 2 && !isPreparing && (
                <OriginMarker points={drawn.heading} colour={palette.accent} theme={theme} />
              )}

              {drawn.pins.map((pin) => (
                <Pin
                  key={pin.stopId}
                  point={pin.point}
                  state={pin.state}
                  isSelected={!isPreparing && pin.stopId === selectedStopId}
                  theme={theme}
                  opacity={isPreparing ? PREPARING_OPACITY : 1}
                />
              ))}
            </Svg>
          </Animated.View>
        </GestureDetector>
      )}

      {/* The pin numbers, as real text rather than SVG glyphs: `Text` gets
          Dynamic Type and the platform's own font, and an SVG `<Text>` gets
          neither (`CLAUDE.md` §10 rule 5).

          **Withheld while preparing.** The numbers are the answer: showing the
          entry order in them and then renumbering under the user's eyes would
          make the wait look like a result that changed its mind. */}
      {!isPreparing &&
        drawn.pins.map((pin) => (
          <PinLabel
            key={pin.stopId}
            point={pin.point}
            position={pin.position}
            state={pin.state}
            theme={theme}
          />
        ))}

      {!isPreparing && (
        <>
          <View
            style={{
              position: 'absolute',
              top: space.space3,
              left: space.space3,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            pointerEvents="none"
            testID="map-compass"
          >
            <Text style={{ color: palette.textPrimary, fontSize: 11, fontWeight: '700' }}>N</Text>
          </View>
          <View
            style={{ position: 'absolute', right: space.space3, top: 72, gap: space.space2 }}
            testID="map-controls"
          >
            <Pressable
              onPress={() => {
                const next = Math.min(MAX_SCALE, zoom.value * 1.35);
                zoom.value = next;
                setViewport({ scale: next, translateX: offsetX.value, translateY: offsetY.value });
              }}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.textPrimary, fontSize: 20 }}>+</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const next = Math.max(MIN_SCALE, zoom.value / 1.35);
                zoom.value = next;
                offsetX.value = 0;
                offsetY.value = 0;
                setViewport({ scale: next, translateX: 0, translateY: 0 });
              }}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.textPrimary, fontSize: 20 }}>−</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                zoom.value = FITTED.scale;
                offsetX.value = FITTED.translateX;
                offsetY.value = FITTED.translateY;
                setViewport(FITTED);
              }}
              accessibilityRole="button"
              accessibilityLabel="Recenter route"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.accent, fontSize: 16 }}>◎</Text>
            </Pressable>
          </View>
          <View
            style={{
              position: 'absolute',
              left: space.space3,
              bottom: 26,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
            pointerEvents="none"
            testID="map-scale"
          >
            <View style={{ width: 38, height: 2, backgroundColor: palette.textSecondary }} />
            <Text style={{ color: palette.textSecondary, fontSize: 10 }}>scale</Text>
          </View>
        </>
      )}

      {undrawableStopIds.length > 0 && (
        // Said rather than left to be counted. A route missing a pin looks like
        // a route with fewer stops (`CLAUDE.md` §0 rule 5).
        <View
          style={{
            position: 'absolute',
            left: space.space3,
            top: space.space3,
            paddingHorizontal: space.space3,
            paddingVertical: space.space1,
            borderRadius: radius.radiusFull,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}
          testID="route-canvas-undrawable"
        >
          <Text className="text-caption text-text-secondary">
            {undrawableStopIds.length === 1
              ? '1 stop could not be placed'
              : `${undrawableStopIds.length} stops could not be placed`}
          </Text>
        </View>
      )}

      {/* The obligation attaches to Google-derived content being shown, and this
          canvas is drawn from Google's coordinates and Google's road geometry.
          The renderer changing does not change where the data came from
          (ADR-0021). */}
      <MapAttribution theme={theme} bottomOffset={0} testID="route-canvas-attribution" />
    </View>
  );
});

/** On, off — long enough to read as deliberate rather than as a rendering
 *  artefact at route zoom. */
const DEGRADED_DASH = '10,8';

/**
 * How present the placeholder drawing is while the answer is being computed.
 *
 * Faint enough that nobody mistakes it for the route, present enough that the
 * canvas is visibly about *their* stops rather than a generic loading screen —
 * which is what makes the wait feel like work happening on their day. Not
 * animated: the shimmer would be the only moving thing on a canvas whose whole
 * job is to hold still, and under reduced motion it would have to stop anyway
 * (`CLAUDE.md` §10 rule 6).
 */
const PREPARING_OPACITY = 0.35;

/**
 * How far the rest of the route recedes while one hop is being inspected.
 *
 * Dimmed rather than hidden. The other hops are the context that makes the
 * selected one mean anything — "eleven minutes" is a different fact on a
 * two-stop route and on a twenty-stop one — and a canvas that emptied itself
 * around the tap would lose the shape of the day.
 */
const DIMMED_ROUTE_OPACITY = 0.3;

/**
 * One stop.
 *
 * The disc only: the ordinal is drawn above it as real text, so it inherits the
 * user's font size instead of being baked into the vector at a fixed one.
 */
const Pin = memo(function Pin({
  point,
  state,
  isSelected,
  theme,
  opacity = 1,
}: {
  point: Point;
  state: StopProgressState;
  isSelected: boolean;
  theme: ThemeName;
  opacity?: number;
}): React.JSX.Element {
  const style = markerStyle(theme, state, isSelected);
  const size = isSelected ? MARKER_SIZE_SELECTED : MARKER_SIZE;

  return (
    <Circle
      testID="route-canvas-pin"
      cx={point.x}
      cy={point.y}
      r={size / 2}
      fill={style.fill}
      stroke={style.border}
      strokeWidth={2}
      opacity={opacity}
    />
  );
});

/** The ordinal, or the glyph that replaces it. Never colour alone: a completed
 *  stop shows a checkmark as well as mint (`CLAUDE.md` §10 rule 4). */
function PinLabel({
  point,
  position,
  state,
  theme,
}: {
  point: Point;
  position: number;
  state: StopProgressState;
  theme: ThemeName;
}): React.JSX.Element {
  const style = markerStyle(theme, state, false);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: point.x - MARKER_SIZE / 2,
        top: point.y - MARKER_SIZE / 2,
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ color: style.foreground, fontSize: 13, fontWeight: '600' }}>
        {style.glyph ?? position}
      </Text>
    </View>
  );
}

/**
 * The navigator's triangle at the route's start.
 *
 * Mint, because it is the accent that means "this is your route"
 * (`CLAUDE.md` §8 rule 2), and rotated to the bearing of the first leg so it
 * says which way the day begins as well as where. It carries a halo in the map
 * colours so it stays legible over a block as well as over open ground.
 *
 * It is decoration in the strict sense — no state, no interaction, nothing
 * derived from it. A driver reading the canvas should be able to find their
 * starting point in under a second, and a numbered disc among other numbered
 * discs does not do that.
 */
function OriginMarker({
  points,
  colour,
  theme,
}: {
  points: readonly Point[];
  colour: string;
  theme: ThemeName;
}): React.JSX.Element | null {
  const first = points[0];
  const next = points[1];
  if (first === undefined || next === undefined) return null;

  const degrees = (Math.atan2(next.y - first.y, next.x - first.x) * 180) / Math.PI;

  return (
    <G
      testID="route-canvas-origin"
      transform={`translate(${first.x} ${first.y}) rotate(${degrees})`}
    >
      <Path
        d={ORIGIN_TRIANGLE}
        fill={colour}
        stroke={mapColours[theme].land}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </G>
  );
}
