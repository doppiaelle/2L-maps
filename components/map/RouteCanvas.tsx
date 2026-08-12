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
 * no tiles â€” which is also why it needs no network, works in a basement, and
 * costs nothing per view.
 *
 * **It decides nothing.** `fitProjection` places the coordinates, `simplify`
 * decides which points survive, `planRoute` decides whether there is a road
 * shape to draw or only connectors, and `markerStyle` says what a pin looks like
 * in each state. All of them are pure and tested without a renderer; what is
 * left here is turning their answers into SVG.
 *
 * **The T0 distinction survives intact.** A degraded result draws as separate
 * dashed segments, never as a continuous road-shaped line â€” a straight-line
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
   * the same route draws the same streets on every device and every render â€”
   * scenery that reshuffled would read as movement on a canvas whose job is to
   * hold still ([`lib/map/scenery.ts`](../../lib/map/scenery.ts)).
   */
  readonly scenerySeed?: string;
  /**
   * Whether this is the answer or the wait for it.
   *
   * `preparing` draws the same canvas at the same size from the stops we already
   * hold, so **nothing moves when the result lands** â€” which is the whole
   * difference between a skeleton and a spinner (`CLAUDE.md` Â§7 rule 5). What it
   * withholds is every claim: the connectors are neutral rather than the
   * degraded warning style, the pins carry no ordinals, and the summary says the
   * route is being worked out rather than describing one.
   */
  readonly phase?: 'ready' | 'preparing';
  /**
   * Which hop is being inspected, and how to say one was tapped.
   *
   * Every optimization already returns a distance and a duration **per leg** â€”
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
 * edge of its own bounding box would have half its marker off the canvas â€” and
 * the first and last stop of every route are on that edge by definition.
 */
const CANVAS_PADDING = MARKER_SIZE_SELECTED / 2 + space.space3;

/** Nothing to draw around. Frozen so the empty case is one object rather than a
 *  new pair of arrays on every render. */
const EMPTY_SCENERY: Scenery = { roads: [], blocks: [], areas: [] };

/** The navigator's triangle, pointing along positive x before rotation. Drawn
 *  once and turned to the route's first bearing â€” a shape that says "you start
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
  // traffic â€” calling that "straight-line estimate" would announce a degraded
  // answer for a route that has not been computed at all.
  const selectedLeg = selectedLegIndex === null ? null : (drawn.legs[selectedLegIndex] ?? null);

  /**
   * The lens over the drawing.
   *
   * **Shared values, not React state.** A pinch that re-rendered on every frame
   * would put the whole canvas through reconciliation during a gesture, which is
   * the one thing `CLAUDE.md` Â§6 rule 5 forbids. These live on the UI thread and
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
   * direction backwards would select a hop the finger was nowhere near â€” while
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
        // The canvas point under the fingers, held still across the change â€”
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
      // `progressbar` while prepari×m<¶‰žËkºwµç@€€€€€€€€€€€€€€¡•¥¡Ðõí…É•„¹¡•¥¡Ñô(€€€€€€€€€€€€€€€€€Éàõí…É•„¹­¥¹€ôôô€Á…É¬œ€ü€Ü€è€Éô(€€€€€€€€€€€€€€€€€™¥±°õì(€€€€€€€€€€€€€€€€€€€…É•„¹­¥¹€ôôô€Á…É¬œ(€€€€€€€€€€€€€€€€€€€€€€üµ…À¹Á…É¬(€€€€€€€€€€€€€€€€€€€€€€è…É•„¹­¥¹€ôôô€ÍÅÕ…É”œ(€€€€€€€€€€€€€€€€€€€€€€€€üµ…À¹ÍÅÕ…É”(€€€€€€€€€€€€€€€€€€€€€€€€èµ…À¹‰Õ¥±‘¥¹œ(€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€ÍÑÉ½­”õí…É•„¹­¥¹€ôôô€‰Õ¥±‘¥¹œœ€üµ…À¹‰±½¬€è€¹½¹”ô(€€€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õí…É•„¹­¥¹€ôôô€‰Õ¥±‘¥¹œœ€ü€À¸à€è€Áô(€€€€€€€€€€€€€€€€€½Á…¥Ñäõí…É•„¹½Á…¥Ñåô(€€€€€€€€€€€€€€€€€ÑÉ…¹Í™½É´õíÉ½Ñ…Ñ” ‘í…É•„¹É½Ñ…Ñ¥½¹ô€‘í…É•„¹à€¬…É•„¹Ý¥‘Ñ €¼€Éô€‘í…É•„¹ä€¬…É•„¹¡•¥¡Ð€¼€Éô¥ô(€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€¤¥ô((€€€€€€€€€€€€€í‘É…Ý¸¹Í•¹•Éä¹É½…‘Ì¹µ…À ¡É½…¤€ôø€ (€€€€€€€€€€€€€€€€ñ1¥¹”(€€€€€€€€€€€€€€€€€­•äõíÉ½…¹¥‘ô(€€€€€€€€€€€€€€€€€Ñ•ÍÑ%ô‰Í•¹•ÉäµÉ½…ˆ(€€€€€€€€€€€€€€€€€àÄõíÉ½…¹™É½´¹áô(€€€€€€€€€€€€€€€€€äÄõíÉ½…¹™É½´¹åô(€€€€€€€€€€€€€€€€€àÈõíÉ½…¹Ñ¼¹áô(€€€€€€€€€€€€€€€€€äÈõíÉ½…¹Ñ¼¹åô(€€€€€€€€€€€€€€€€€ÍÑÉ½­”õíÉ½…¹¥ÍÉÑ•É¥…°€üµ…À¹É½…€èµ…À¹É½…‘5¥¹½Éô(€€€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õíÉ½…¹¥ÍÉÑ•É¥…°€üÍÑÉ½­”¹Í•¹•ÉåÉÑ•É¥…°€èÍÑÉ½­”¹Í•¹•Éå5¥¹½Éô(€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•…Àô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€½Á…¥ÑäõíÉ½…¹½Á…¥Ñåô(€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€¤¥ô((€€€€€€€€€€€€€í‘É…Ý¸¹É½…€„ôô¹Õ±°€˜˜€ (€€€€€€€€€€€€€€€€ðø(€€€€€€€€€€€€€€€€€íµ…À¹É½ÕÑ•…Í¥¹œ€„ôô¹Õ±°€˜˜€ (€€€€€€€€€€€€€€€€€€€€¼¼É…Ý¸™¥ÉÍÐ°Í¼¥ÐÍ¥ÑÌÕ¹‘•É¹•…Ñ ¸MY¡…Ì¹¼½ÕÑ±¥¹”½¸„(€€€€€€€€€€€€€€€€€€€€¼¼Á…Ñ ì„Ý¥‘•È±¥¹”‰•¹•…Ñ ¥Ð¥ÌÝ¡…ÐÁÉ½‘Õ•ÌÑ¡”‰½É‘•È°…¹(€€€€€€€€€€€€€€€€€€€€¼¼¥¸±¥¡ÐÑ¡•µ”µ¥¹Ð½¸Á…Á•ÈµÝ¡¥Ñ”¥ÌÑ¡¥ÌÍåÍÑ•´ÌÝ•…­•ÍÐ(€€€€€€€€€€€€€€€€€€€€¼¼Á…¥É¥¹œÝ¥Ñ¡½ÕÐ¥Ð¸(€€€€€€€€€€€€€€€€€€€€ñA…Ñ (€€€€€€€€€€€€€€€€€€€€€Ñ•ÍÑ%ô‰É½ÕÑ”µ…Í¥¹œˆ(€€€€€€€€€€€€€€€€€€€€€õí‘É…Ý¸¹É½…‘ô(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­”õíµ…À¹É½ÕÑ•…Í¥¹ô(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õíÍÑÉ½­”¹É½ÕÑ•…Í¥¹ô(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•…Àô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•©½¥¸ô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€€€€€™¥±°ô‰¹½¹”ˆ(€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€ñA…Ñ (€€€€€€€€€€€€€€€€€€€Ñ•ÍÑ%ô‰É½ÕÑ”µ±¥¹”ˆ(€€€€€€€€€€€€€€€€€€€õí‘É…Ý¸¹É½…‘ô(€€€€€€€€€€€€€€€€€€€ÍÑÉ½­”õíÁ…±•ÑÑ”¹…•¹Ñô(€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õíÍÑÉ½­”¹É½ÕÑ•ô(€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•…Àô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•©½¥¸ô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€€€€¼¼¥µµ•°¹½Ð¡¥‘‘•¸°Ý¡¥±”½¹”¡½À¥Ì‰•¥¹œ¥¹ÍÁ•Ñ•èÑ¡”É•ÍÐ(€€€€€€€€€€€€€€€€€€€€¼¼½˜Ñ¡”‘…ä¥ÌÍÑ¥±°Ñ¡”½¹Ñ•áÐÑ¡…Ðµ…­•ÌÑ¡”Í•±•Ñ•¡½À(€€€€€€€€€€€€€€€€€€€€¼¼µ•…¸…¹åÑ¡¥¹œ¸(€€€€€€€€€€€€€€€€€€€½Á…¥ÑäõíÍ•±•Ñ•‘1•%¹‘•à€ôôô¹Õ±°€ü€Ä€è%55}I=UQ}=A%Qeô(€€€€€€€€€€€€€€€€€€€™¥±°ô‰¹½¹”ˆ(€€€€€€€€€€€€€€€€€€¼ø((€€€€€€€€€€€€€€€€€ì¼¨Q¡”¡½À‰•¥¹œ¥¹ÍÁ•Ñ•°‘É…Ý¸½Ù•ÈÑ¡”‘¥µµ•É•ÍÐ½˜Ñ¡”(€€€€€€€€€€€€€€€€€É½ÕÑ”…ÐÑ¡”…Í¥¹œÌÝ¥‘Ñ Í¼¥ÐÉ•…‘Ì…ÌÑ¡”Í…µ”±¥¹”(€€€€€€€€€€€€€€€€€‰É½Õ¡Ð™½ÉÝ…ÉÉ…Ñ¡•ÈÑ¡…¸„‘¥™™•É•¹Ð½¹”±…¥½¸Ñ½À¸€¨½ô(€€€€€€€€€€€€€€€€€íÍ•±•Ñ•‘1•œ€„ôô¹Õ±°€˜˜€ (€€€€€€€€€€€€€€€€€€€€ñA…Ñ (€€€€€€€€€€€€€€€€€€€€€Ñ•ÍÑ%ô‰É½ÕÑ”µ±•œµÍ•±•Ñ•ˆ(€€€€€€€€€€€€€€€€€€€€€õíÍ•±•Ñ•‘1•œ¹‘ô(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­”õíÁ…±•ÑÑ”¹…•¹Ñô(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õíÍÑÉ½­”¹É½ÕÑ•…Í¥¹ô(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•…Àô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•©½¥¸ô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€€€€€™¥±°ô‰¹½¹”ˆ(€€€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€ð¼ø(€€€€€€€€€€€€€€¥ô((€€€€€€€€€€€€€í‘É…Ý¸¹Í•µ•¹ÑÌ¹µ…À ¡Í•µ•¹Ð¤€ôø€ (€€€€€€€€€€€€€€€€ñA…Ñ (€€€€€€€€€€€€€€€€€­•äõíÍ•µ•¹Ð¹¥‘ô(€€€€€€€€€€€€€€€€€Ñ•ÍÑ%õí¥ÍAÉ•Á…É¥¹œ€ü€É½ÕÑ”µÁ•¹‘¥¹œµ½¹¹•Ñ½Èœ€è€É½ÕÑ”µ½¹¹•Ñ½Èô(€€€€€€€€€€€€€€€€€õíÍ•µ•¹Ð¹‘ô(€€€€€€€€€€€€€€€€€€¼¼]…É¹¥¹œå•±±½ÜÍ…åÌ€‰‘•É…‘•É•ÍÕ±Ðˆ…¹¥ÌÉ•Í•ÉÙ•™½È½¹”¸(€€€€€€€€€€€€€€€€€€¼¼]¡¥±”ÁÉ•Á…É¥¹œÑ¡•É”¥Ì¹¼É•ÍÕ±ÐÑ¼‘•ÍÉ¥‰”°Í¼Ñ¡”±¥¹”¥Ì(€€€€€€€€€€€€€€€€€€¼¼Ñ¡”ÅÕ¥•Ñ•ÍÐÑ¡¥¹œ½¸Ñ¡”…¹Ù…ÌƒŠP„Á±…•¡½±‘•È¡½±‘¥¹œÑ¡”(€€€€€€€€€€€€€€€€€€¼¼ÍÁ…”Ñ¡”µ¥¹ÐÉ½ÕÑ”¥Ì…‰½ÕÐÑ¼Ñ…­”¸(€€€€€€€€€€€€€€€€€ÍÑÉ½­”õí¥ÍAÉ•Á…É¥¹œ€üÁ…±•ÑÑ”¹Ñ•áÑQ•ÉÑ¥…Éä€èÁ…±•ÑÑ”¹Ý…É¹¥¹ô(€€€€€€€€€€€€€€€€€ÍÑÉ½­•]¥‘Ñ õíÍÑÉ½­”¹É½ÕÑ••É…‘•‘ô(€€€€€€€€€€€€€€€€€ÍÑÉ½­•…Í¡…ÉÉ…äõíI}M!ô(€€€€€€€€€€€€€€€€€ÍÑÉ½­•1¥¹•…Àô‰É½Õ¹ˆ(€€€€€€€€€€€€€€€€€½Á…¥Ñäõí¥ÍAÉ•Á…É¥¹œ€üAIAI%9}=A%Qd€è€Åô(€€€€€€€€€€€€€€€€€™¥±°ô‰¹½¹”ˆ(€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€¤¥ô((€€€€€€€€€€€€€ì¼¨]¡•É”Ñ¡”‘É¥Ù•ÈÍ•ÑÌ½™˜°…¹Ý¡¥ Ý…ä¸Q¡”½¹”Á¥•”½˜¡É½µ”(€€€€€€€€€€€€€½¸Ñ¡”…¹Ù…ÌÑ¡…Ð¥Ì…‰½ÕÐÑ¡•´É…Ñ¡•ÈÑ¡…¸…‰½ÕÐÑ¡”É½ÕÑ”¸(€€€€€€€€€€€€€‰Í•¹ÐÝ¡¥±”ÁÉ•Á…É¥¹œèÝ¡¥ ÍÑ½À½µ•Ì™¥ÉÍÐ¥ÌÁÉ•¥Í•±äÑ¡”(€€€€€€€€€€€€€ÅÕ•ÍÑ¥½¸‰•¥¹œ…Í­•¸€¨½ô(€€€€€€€€€€€€€í‘É…Ý¸¹¡•…‘¥¹œ¹±•¹Ñ €øô€È€˜˜€…¥ÍAÉ•Á…É¥¹œ€˜˜€ (€€€€€€€€€€€€€€€€ñ=É¥¥¹5…É­•ÈÁ½¥¹ÑÌõí‘É…Ý¸¹¡•…‘¥¹ô½±½ÕÈõíÁ…±•ÑÑ”¹…•¹ÑôÑ¡•µ”õíÑ¡•µ•ô€¼ø(€€€€€€€€€€€€€€¥ô((€€€€€€€€€€€€€í‘É…Ý¸¹Á¥¹Ì¹µ…À ¡Á¥¸¤€ôø€ (€€€€€€€€€€€€€€€€ñA¥¸(€€€€€€€€€€€€€€€€€­•äõíÁ¥¸¹ÍÑ½Á%‘ô(€€€€€€€€€€€€€€€€€Á½¥¹ÐõíÁ¥¸¹Á½¥¹Ñô(€€€€€€€€€€€€€€€€€ÍÑ…Ñ”õíÁ¥¸¹ÍÑ…Ñ•ô(€€€€€€€€€€€€€€€€€¥ÍM•±•Ñ•õì…¥ÍAÉ•Á…É¥¹œ€˜˜Á¥¸¹ÍÑ½Á%€ôôôÍ•±•Ñ•‘MÑ½Á%‘ô(€€€€€€€€€€€€€€€€€Ñ¡•µ”õíÑ¡•µ•ô(€€€€€€€€€€€€€€€€€½Á…¥Ñäõí¥ÍAÉ•Á…É¥¹œ€üAIAI%9}=A%Qd€è€Åô(€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€ð½MÙœø(€€€€€€€€€€ð½¹¥µ…Ñ•¹Y¥•Üø(€€€€€€€€ð½•ÍÑÕÉ••Ñ•Ñ½Èø(€€€€€€¥ô((€€€€€ì¼¨Q¡”Á¥¸¹Õµ‰•ÉÌ°…ÌÉ•…°Ñ•áÐÉ…Ñ¡•ÈÑ¡…¸MY±åÁ¡ÌèQ•áÑ€•ÑÌ(€€€€€€€€€å¹…µ¥ŒQåÁ”…¹Ñ¡”Á±…Ñ™½É´Ì½Ý¸™½¹Ð°…¹…¸MY€ñQ•áÐù€•ÑÌ(€€€€€€€€€¹•¥Ñ¡•È€¡1U¹µ‘€ƒ
œÄÀÉÕ±”€Ô¤¸((€€€€€€€€€€¨©]¥Ñ¡¡•±Ý¡¥±”ÁÉ•Á…É¥¹œ¸¨¨Q¡”¹Õµ‰•ÉÌ…É”Ñ¡”…¹ÍÝ•ÈèÍ¡½Ý¥¹œÑ¡”(€€€€€€€€€•¹ÑÉä½É‘•È¥¸Ñ¡•´…¹Ñ¡•¸É•¹Õµ‰•É¥¹œÕ¹‘•ÈÑ¡”ÕÍ•ÈÌ•å•ÌÝ½Õ±(€€€€€€€€€µ…­”Ñ¡”Ý…¥Ð±½½¬±¥­”„É•ÍÕ±ÐÑ¡…Ð¡…¹•¥ÑÌµ¥¹¸€¨½ô(€€€€€ì…¥ÍAÉ•Á…É¥¹œ€˜˜(€€€€€€€‘É…Ý¸¹Á¥¹Ì¹µ…À ¡Á¥¸¤€ôø€ (€€€€€€€€€€ñA¥¹1…‰•°(€€€€€€€€€€€­•äõíÁ¥¸¹ÍÑ½Á%‘ô(€€€€€€€€€€€Á½¥¹ÐõíÁ¥¸¹Á½¥¹Ñô(€€€€€€€€€€€Á½Í¥Ñ¥½¸õíÁ¥¸¹Á½Í¥Ñ¥½¹ô(€€€€€€€€€€€ÍÑ…Ñ”õíÁ¥¸¹ÍÑ…Ñ•ô(€€€€€€€€€€€Ñ¡•µ”õíÑ¡•µ•ô(€€€€€€€€€€¼ø(€€€€€€€€¤¥ô((€€€€€ì…¥ÍAÉ•Á…É¥¹œ€˜˜€ (€€€€€€€€ðø(€€€€€€€€€€ñY¥•Ü(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€Á½Í¥Ñ¥½¸è€…‰Í½±ÕÑ”œ°(€€€€€€€€€€€€€Ñ½ÀèÍÁ…”¹ÍÁ…”Ì°(€€€€€€€€€€€€€±•™ÐèÍÁ…”¹ÍÁ…”Ì°(€€€€€€€€€€€€€Ý¥‘Ñ è€ÌØ°(€€€€€€€€€€€€€¡•¥¡Ðè€ÌØ°(€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€Äà°(€€€€€€€€€€€€€‰…­É½Õ¹‘½±½ÈèÁ…±•ÑÑ”¹ÍÕÉ™…”°(€€€€€€€€€€€€€‰½É‘•É]¥‘Ñ è€Ä°(€€€€€€€€€€€€€‰½É‘•É½±½ÈèÁ…±•ÑÑ”¹‰½É‘•È°(€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°(€€€€€€€€€€€€€©ÕÍÑ¥™å½¹Ñ•¹Ðè€•¹Ñ•Èœ°(€€€€€€€€€€€õô(€€€€€€€€€€€Á½¥¹Ñ•ÉÙ•¹ÑÌô‰¹½¹”ˆ(€€€€€€€€€€€Ñ•ÍÑ%ô‰µ…Àµ½µÁ…ÍÌˆ(€€€€€€€€€€ø(€€€€€€€€€€€€ñQ•áÐÍÑå±”õíì½±½ÈèÁ…±•ÑÑ”¹Ñ•áÑAÉ¥µ…Éä°™½¹ÑM¥é”è€ÄÄ°™½¹Ñ]•¥¡Ðè€œÜÀÀœõôù8ð½Q•áÐø(€€€€€€€€€€ð½Y¥•Üø(€€€€€€€€€€ñY¥•Ü(€€€€€€€€€€€ÍÑå±”õíìÁ½Í¥Ñ¥½¸è€…‰Í½±ÕÑ”œ°É¥¡ÐèÍÁ…”¹ÍÁ…”Ì°Ñ½Àè€ÜÈ°…ÀèÍÁ…”¹ÍÁ…”Èõô(€€€€€€€€€€€Ñ•ÍÑ%ô‰µ…Àµ½¹ÑÉ½±Ìˆ(€€€€€€€€€€ø(€€€€€€€€€€€€ñAÉ•ÍÍ…‰±”(€€€€€€€€€€€€€½¹AÉ•ÍÌõì ¤€ôøì(€€€€€€€€€€€€€€€½¹ÍÐ¹•áÐ€ô5…Ñ ¹µ¥¸¡5a}M1°é½½´¹Ù…±Õ”€¨€Ä¸ÌÔ¤ì(€€€€€€€€€€€€€€€é½½´¹Ù…±Õ”€ô¹•áÐì(€€€€€€€€€€€€€€€Í•ÑY¥•ÝÁ½ÉÐ¡ìÍ…±”è¹•áÐ°ÑÉ…¹Í±…Ñ•`è½™™Í•Ñ`¹Ù…±Õ”°ÑÉ…¹Í±…Ñ•dè½™™Í•Ñd¹Ù…±Õ”ô¤ì(€€€€€€€€€€€€€õô(€€€€€€€€€€€€€…•ÍÍ¥‰¥±¥ÑåI½±”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€…•ÍÍ¥‰¥±¥Ñå1…‰•°ô‰i½½´¥¸ˆ(€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€Ý¥‘Ñ è€ÐÀ°(€€€€€€€€€€€€€€€¡•¥¡Ðè€ÐÀ°(€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÈÀ°(€€€€€€€€€€€€€€€‰…­É½Õ¹‘½±½ÈèÁ…±•ÑÑ”¹ÍÕÉ™…”°(€€€€€€€€€€€€€€€‰½É‘•É]¥‘Ñ è€Ä°(€€€€€€€€€€€€€€€‰½É‘•É½±½ÈèÁ…±•ÑÑ”¹‰½É‘•È°(€€€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°(€€€€€€€€€€€€€€€©ÕÍÑ¥™å½¹Ñ•¹Ðè€•¹Ñ•Èœ°(€€€€€€€€€€€€€õô(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñQ•áÐÍÑå±”õíì½±½ÈèÁ…±•ÑÑ”¹Ñ•áÑAÉ¥µ…Éä°™½¹ÑM¥é”è€ÈÀõôø¬ð½Q•áÐø(€€€€€€€€€€€€ð½AÉ•ÍÍ…‰±”ø(€€€€€€€€€€€€ñAÉ•ÍÍ…‰±”(€€€€€€€€€€€€€½¹AÉ•ÍÌõì ¤€ôøì(€€€€€€€€€€€€€€€½¹ÍÐ¹•áÐ€ô5…Ñ ¹µ…à¡5%9}M1°é½½´¹Ù…±Õ”€¼€Ä¸ÌÔ¤ì(€€€€€€€€€€€€€€€é½½´¹Ù…±Õ”€ô¹•áÐì(€€€€€€€€€€€€€€€½™™Í•Ñ`¹Ù…±Õ”€ô€Àì(€€€€€€€€€€€€€€€½™™Í•Ñd¹Ù…±Õ”€ô€Àì(€€€€€€€€€€€€€€€Í•ÑY¥•ÝÁ½ÉÐ¡ìÍ…±”è¹•áÐ°ÑÉ…¹Í±…Ñ•`è€À°ÑÉ…¹Í±…Ñ•dè€Àô¤ì(€€€€€€€€€€€€€õô(€€€€€€€€€€€€€…•ÍÍ¥‰¥±¥ÑåI½±”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€…•ÍÍ¥‰¥±¥Ñå1…‰•°ô‰i½½´½ÕÐˆ(€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€Ý¥‘Ñ è€ÐÀ°(€€€€€€€€€€€€€€€¡•¥¡Ðè€ÐÀ°(€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÈÀ°(€€€€€€€€€€€€€€€‰…­É½Õ¹‘½±½ÈèÁ…±•ÑÑ”¹ÍÕÉ™…”°(€€€€€€€€€€€€€€€‰½É‘•É]¥‘Ñ è€Ä°(€€€€€€€€€€€€€€€‰½É‘•É½±½ÈèÁ…±•ÑÑ”¹‰½É‘•È°(€€€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°(€€€€€€€€€€€€€€€©ÕÍÑ¥™å½¹Ñ•¹Ðè€•¹Ñ•Èœ°(€€€€€€€€€€€€€õô(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñQ•áÐÍÑå±”õíì½±½ÈèÁ…±•ÑÑ”¹Ñ•áÑAÉ¥µ…Éä°™½¹ÑM¥é”è€ÈÀõôûŠ"Hð½Q•áÐø(€€€€€€€€€€€€ð½AÉ•ÍÍ…‰±”ø(€€€€€€€€€€€€ñAÉ•ÍÍ…‰±”(€€€€€€€€€€€€€½¹AÉ•ÍÌõì ¤€ôøì(€€€€€€€€€€€€€€€é½½´¹Ù…±Õ”€ô%QQ¹Í…±”ì(€€€€€€€€€€€€€€€½™™Í•Ñ`¹Ù…±Õ”€ô%QQ¹ÑÉ…¹Í±…Ñ•`ì(€€€€€€€€€€€€€€€½™™Í•Ñd¹Ù…±Õ”€ô%QQ¹ÑÉ…¹Í±…Ñ•dì(€€€€€€€€€€€€€€€Í•ÑY¥•ÝÁ½ÉÐ¡%QQ¤ì(€€€€€€€€€€€€€õô(€€€€€€€€€€€€€…•ÍÍ¥‰¥±¥ÑåI½±”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€…•ÍÍ¥‰¥±¥Ñå1…‰•°ô‰I••¹Ñ•ÈÉ½ÕÑ”ˆ(€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€Ý¥‘Ñ è€ÐÀ°(€€€€€€€€€€€€€€€¡•¥¡Ðè€ÐÀ°(€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€ÈÀ°(€€€€€€€€€€€€€€€‰…­É½Õ¹‘½±½ÈèÁ…±•ÑÑ”¹ÍÕÉ™…”°(€€€€€€€€€€€€€€€‰½É‘•É]¥‘Ñ è€Ä°(€€€€€€€€€€€€€€€‰½É‘•É½±½ÈèÁ…±•ÑÑ”¹‰½É‘•È°(€€€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°(€€€€€€€€€€€€€€€©ÕÍÑ¥™å½¹Ñ•¹Ðè€•¹Ñ•Èœ°(€€€€€€€€€€€€€õô(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñQ•áÐÍÑå±”õíì½±½ÈèÁ…±•ÑÑ”¹…•¹Ð°™½¹ÑM¥é”è€ÄØõôûŠ^8ð½Q•áÐø(€€€€€€€€€€€€ð½AÉ•ÍÍ…‰±”ø(€€€€€€€€€€ð½Y¥•Üø(€€€€€€€€€€ñY¥•Ü(€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€Á½Í¥Ñ¥½¸è€…‰Í½±ÕÑ”œ°(€€€€€€€€€€€€€±•™ÐèÍÁ…”¹ÍÁ…”Ì°(€€€€€€€€€€€€€‰½ÑÑ½´è€ÈØ°(€€€€€€€€€€€€€™±•á¥É•Ñ¥½¸è€É½Üœ°(€€€€€€€€€€€€€…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°(€€€€€€€€€€€€€…Àè€Ð°(€€€€€€€€€€€õô(€€€€€€€€€€€Á½¥¹Ñ•ÉÙ•¹ÑÌô‰¹½¹”ˆ(€€€€€€€€€€€Ñ•ÍÑ%ô‰µ…ÀµÍ…±”ˆ(€€€€€€€€€€ø(€€€€€€€€€€€€ñY¥•ÜÍÑå±”õíìÝ¥‘Ñ è€Ìà°¡•¥¡Ðè€È°‰…­É½Õ¹‘½±½ÈèÁ…±•ÑÑ”¹Ñ•áÑM•½¹‘…Éäõô€¼ø(€€€€€€€€€€€€ñQ•áÐÍÑå±”õíì½±½ÈèÁ…±•ÑÑ”¹Ñ•áÑM•½¹‘…Éä°™½¹ÑM¥é”è€ÄÀõôùÍ…±”ð½Q•áÐø(€€€€€€€€€€ð½Y¥•Üø(€€€€€€€€ð¼ø(€€€€€€¥ô((€€€€€íÕ¹‘É…Ý…‰±•MÑ½Á%‘Ì¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€¼¼M…¥É…Ñ¡•ÈÑ¡…¸±•™ÐÑ¼‰”½Õ¹Ñ•¸É½ÕÑ”µ¥ÍÍ¥¹œ„Á¥¸±½½­Ì±¥­”(€€€€€€€€¼¼„É½ÕÑ”Ý¥Ñ ™•Ý•ÈÍÑ½ÁÌ€¡1U¹µ‘€ƒ
œÀÉÕ±”€Ô¤¸(€€€€€€€€ñY¥•Ü(€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€Á½Í¥Ñ¥½¸è€…‰Í½±ÕÑ”œ°(€€€€€€€€€€€±•™ÐèÍÁ…”¹ÍÁ…”Ì°(€€€€€€€€€€€Ñ½ÀèÍÁ…”¹ÍÁ…”Ì°(€€€€€€€€€€€Á…‘‘¥¹!½É¥é½¹Ñ…°èÍÁ…”¹ÍÁ…”Ì°(€€€€€€€€€€€Á…‘‘¥¹Y•ÉÑ¥…°èÍÁ…”¹ÍÁ…”Ä°(€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌèÉ…‘¥ÕÌ¹É…‘¥ÕÍÕ±°°(€€€€€€€€€€€‰…­É½Õ¹‘½±½ÈèÁ…±•ÑÑ”¹ÍÕÉ™…”°(€€€€€€€€€€€‰½É‘•É]¥‘Ñ è€Ä°(€€€€€€€€€€€‰½É‘•É½±½ÈèÁ…±•ÑÑ”¹‰½É‘•È°(€€€€€€€€€õô(€€€€€€€€€Ñ•ÍÑ%ô‰É½ÕÑ”µ…¹Ù…ÌµÕ¹‘É…Ý…‰±”ˆ(€€€€€€€€ø(€€€€€€€€€€ñQ•áÐ±…ÍÍ9…µ”ô‰Ñ•áÐµ…ÁÑ¥½¸Ñ•áÐµÑ•áÐµÍ•½¹‘…Éäˆø(€€€€€€€€€€€íÕ¹‘É…Ý…‰±•MÑ½Á%‘Ì¹±•¹Ñ €ôôô€Ä(€€€€€€€€€€€€€€ü€œÄÍÑ½À½Õ±¹½Ð‰”Á±…•œ(€€€€€€€€€€€€€€è€‘íÕ¹‘É…Ý…‰±•MÑ½Á%‘Ì¹±•¹Ñ¡ôÍÑ½ÁÌ½Õ±¹½Ð‰”Á±…•‘ô(€€€€€€€€€€ð½Q•áÐø(€€€€€€€€ð½Y¥•Üø(€€€€€€¥ô((€€€€€ì¼¨Q¡”½‰±¥…Ñ¥½¸…ÑÑ…¡•ÌÑ¼½½±”µ‘•É¥Ù•½¹Ñ•¹Ð‰•¥¹œÍ¡½Ý¸°…¹Ñ¡¥Ì(€€€€€€€€€…¹Ù…Ì¥Ì‘É…Ý¸™É½´½½±”Ì½½É‘¥¹…Ñ•Ì…¹½½±”ÌÉ½…•½µ•ÑÉä¸(€€€€€€€€€Q¡”É•¹‘•É•È¡…¹¥¹œ‘½•Ì¹½Ð¡…¹”Ý¡•É”Ñ¡”‘…Ñ„…µ”™É½´(€€€€€€€€€€¡H´ÀÀÈÄ¤¸€¨½ô(€€€€€€ñ5…ÁÑÑÉ¥‰ÕÑ¥½¸Ñ¡•µ”õíÑ¡•µ•ô‰½ÑÑ½µ=™™Í•ÐõìÁôÑ•ÍÑ%ô‰É½ÕÑ”µ…¹Ù…Ìµ…ÑÑÉ¥‰ÕÑ¥½¸ˆ€¼ø(€€€€ð½Y¥•Üø(€€¤ì)ô¤ì((¼¨¨=¸°½™˜ƒŠP±½¹œ•¹½Õ Ñ¼É•……Ì‘•±¥‰•É…Ñ”É…Ñ¡•ÈÑ¡…¸…Ì„É•¹‘•É¥¹œ(€¨€…ÉÑ•™…Ð…ÐÉ½ÕÑ”é½½´¸€¨¼)½¹ÍÐI}M €ô€œÄÀ°àœì((¼¨¨(€¨!½ÜÁÉ•Í•¹ÐÑ¡”Á±…•¡½±‘•È‘É…Ý¥¹œ¥ÌÝ¡¥±”Ñ¡”…¹ÍÝ•È¥Ì‰•¥¹œ½µÁÕÑ•¸(€¨(€¨…¥¹Ð•¹½Õ Ñ¡…Ð¹½‰½‘äµ¥ÍÑ…­•Ì¥Ð™½ÈÑ¡”É½ÕÑ”°ÁÉ•Í•¹Ð•¹½Õ Ñ¡…ÐÑ¡”(€¨…¹Ù…Ì¥ÌÙ¥Í¥‰±ä…‰½ÕÐ€©Ñ¡•¥È¨ÍÑ½ÁÌÉ…Ñ¡•ÈÑ¡…¸„•¹•É¥Œ±½…‘¥¹œÍÉ••¸ƒŠP(€¨Ý¡¥ ¥ÌÝ¡…Ðµ…­•ÌÑ¡”Ý…¥Ð™••°±¥­”Ý½É¬¡…ÁÁ•¹¥¹œ½¸Ñ¡•¥È‘…ä¸9½Ð(€¨…¹¥µ…Ñ•èÑ¡”Í¡¥µµ•ÈÝ½Õ±‰”Ñ¡”½¹±äµ½Ù¥¹œÑ¡¥¹œ½¸„…¹Ù…ÌÝ¡½Í”Ý¡½±”(€¨©½ˆ¥ÌÑ¼¡½±ÍÑ¥±°°…¹Õ¹‘•ÈÉ•‘Õ•µ½Ñ¥½¸¥ÐÝ½Õ±¡…Ù”Ñ¼ÍÑ½À…¹åÝ…ä(€¨€¡1U¹µ‘€ƒ
œÄÀÉÕ±”€Ø¤¸(€¨¼)½¹ÍÐAIAI%9}=A%Qd€ô€À¸ÌÔì((¼¨¨(€¨!½Ü™…ÈÑ¡”É•ÍÐ½˜Ñ¡”É½ÕÑ”É••‘•ÌÝ¡¥±”½¹”¡½À¥Ì‰•¥¹œ¥¹ÍÁ•Ñ•¸(€¨(€¨¥µµ•É…Ñ¡•ÈÑ¡…¸¡¥‘‘•¸¸Q¡”½Ñ¡•È¡½ÁÌ…É”Ñ¡”½¹Ñ•áÐÑ¡…Ðµ…­•ÌÑ¡”(€¨Í•±•Ñ•½¹”µ•…¸…¹åÑ¡¥¹œƒŠP€‰•±•Ù•¸µ¥¹ÕÑ•Ìˆ¥Ì„‘¥™™•É•¹Ð™…Ð½¸„(€¨ÑÝ¼µÍÑ½ÀÉ½ÕÑ”…¹½¸„ÑÝ•¹ÑäµÍÑ½À½¹”ƒŠP…¹„…¹Ù…ÌÑ¡…Ð•µÁÑ¥•¥ÑÍ•±˜(€¨…É½Õ¹Ñ¡”Ñ…ÀÝ½Õ±±½Í”Ñ¡”Í¡…Á”½˜Ñ¡”‘…ä¸(€¨¼)½¹ÍÐ%55}I=UQ}=A%Qd€ô€À¸Ìì((¼¨¨(€¨=¹”ÍÑ½À¸(€¨(€¨Q¡”‘¥ÍŒ½¹±äèÑ¡”½É‘¥¹…°¥Ì‘É…Ý¸…‰½Ù”¥Ð…ÌÉ•…°Ñ•áÐ°Í¼¥Ð¥¹¡•É¥ÑÌÑ¡”(€¨ÕÍ•ÈÌ™½¹ÐÍ¥é”¥¹ÍÑ•…½˜‰•¥¹œ‰…­•¥¹Ñ¼Ñ¡”Ù•Ñ½È…Ð„™¥á•½¹”¸(€¨¼)½¹ÍÐA¥¸€ôµ•µ¼¡™Õ¹Ñ¥½¸A¥¸¡ì(€Á½¥¹Ð°(€ÍÑ…Ñ”°(€¥ÍM•±•Ñ•°(€Ñ¡•µ”°(€½Á…¥Ñä€ô€Ä°)ôèì(€Á½¥¹ÐèA½¥¹Ðì(€ÍÑ…Ñ”èMÑ½ÁAÉ½É•ÍÍMÑ…Ñ”ì(€¥ÍM•±•Ñ•è‰½½±•…¸ì(€Ñ¡•µ”èQ¡•µ•9…µ”ì(€½Á…¥Ñäüè¹Õµ‰•Èì)ô¤èI•…Ð¹)M`¹±•µ•¹Ðì(€½¹ÍÐÍÑå±”€ôµ…É­•ÉMÑå±”¡Ñ¡•µ”°ÍÑ…Ñ”°¥ÍM•±•Ñ•¤ì(€½¹ÍÐÍ¥é”€ô¥ÍM•±•Ñ•€ü5I-I}M%i}M1Q€è5I-I}M%iì((€É•ÑÕÉ¸€ (€€€€ñ¥É±”(€€€€€Ñ•ÍÑ%ô‰É½ÕÑ”µ…¹Ù…ÌµÁ¥¸ˆ(€€€€€àõíÁ½¥¹Ð¹áô(€€€€€äõíÁ½¥¹Ð¹åô(€€€€€ÈõíÍ¥é”€¼€Éô(€€€€€™¥±°õíÍÑå±”¹™¥±±ô(€€€€€ÍÑÉ½­”õíÍÑå±”¹‰½É‘•Éô(€€€€€ÍÑÉ½­•]¥‘Ñ õìÉô(€€€€€½Á…¥Ñäõí½Á…¥Ñåô(€€€€¼ø(€€¤ì)ô¤ì((¼¨¨Q¡”½É‘¥¹…°°½ÈÑ¡”±åÁ Ñ¡…ÐÉ•Á±…•Ì¥Ð¸9•Ù•È½±½ÕÈ…±½¹”è„½µÁ±•Ñ•(€¨€ÍÑ½ÀÍ¡½ÝÌ„¡•­µ…É¬…ÌÝ•±°…Ìµ¥¹Ð€¡1U¹µ‘€ƒ
œÄÀÉÕ±”€Ð¤¸€¨¼)™Õ¹Ñ¥½¸A¥¹1…‰•°¡ì(€Á½¥¹Ð°(€Á½Í¥Ñ¥½¸°(€ÍÑ…Ñ”°(€Ñ¡•µ”°)ôèì(€Á½¥¹ÐèA½¥¹Ðì(€Á½Í¥Ñ¥½¸è¹Õµ‰•Èì(€ÍÑ…Ñ”èMÑ½ÁAÉ½É•ÍÍMÑ…Ñ”ì(€Ñ¡•µ”èQ¡•µ•9…µ”ì)ô¤èI•…Ð¹)M`¹±•µ•¹Ðì(€½¹ÍÐÍÑå±”€ôµ…É­•ÉMÑå±”¡Ñ¡•µ”°ÍÑ…Ñ”°™…±Í”¤ì((€É•ÑÕÉ¸€ (€€€€ñY¥•Ü(€€€€€Á½¥¹Ñ•ÉÙ•¹ÑÌô‰¹½¹”ˆ(€€€€€ÍÑå±”õíì(€€€€€€€Á½Í¥Ñ¥½¸è€…‰Í½±ÕÑ”œ°(€€€€€€€±•™ÐèÁ½¥¹Ð¹à€´5I-I}M%i€¼€È°(€€€€€€€Ñ½ÀèÁ½¥¹Ð¹ä€´5I-I}M%i€¼€È°(€€€€€€€Ý¥‘Ñ è5I-I}M%i°(€€€€€€€¡•¥¡Ðè5I-I}M%i°(€€€€€€€…±¥¹%Ñ•µÌè€•¹Ñ•Èœ°(€€€€€€€©ÕÍÑ¥™å½¹Ñ•¹Ðè€•¹Ñ•Èœ°(€€€€€õô(€€€€€…•ÍÍ¥‰¥±¥Ñå±•µ•¹ÑÍ!¥‘‘•¸(€€€€€¥µÁ½ÉÑ…¹Ñ½É•ÍÍ¥‰¥±¥Ñäô‰¹¼µ¡¥‘”µ‘•Í•¹‘…¹ÑÌˆ(€€€€ø(€€€€€€ñQ•áÐÍÑå±”õíì½±½ÈèÍÑå±”¹™½É•É½Õ¹°™½¹ÑM¥é”è€ÄÌ°™½¹Ñ]•¥¡Ðè€œØÀÀœõôø(€€€€€€€íÍÑå±”¹±åÁ €üüÁ½Í¥Ñ¥½¹ô(€€€€€€ð½Q•áÐø(€€€€ð½Y¥•Üø(€€¤ì)ô((¼¨¨(€¨Q¡”¹…Ù¥…Ñ½ÈÌÑÉ¥…¹±”…ÐÑ¡”É½ÕÑ”ÌÍÑ…ÉÐ¸(€¨(€¨5¥¹Ð°‰•…ÕÍ”¥Ð¥ÌÑ¡”…•¹ÐÑ¡…Ðµ•…¹Ì€‰Ñ¡¥Ì¥Ìå½ÕÈÉ½ÕÑ”ˆ(€¨€¡1U¹µ‘€ƒ
œàÉÕ±”€È¤°…¹É½Ñ…Ñ•Ñ¼Ñ¡”‰•…É¥¹œ½˜Ñ¡”™¥ÉÍÐ±•œÍ¼¥Ð(€¨Í…åÌÝ¡¥ Ý…äÑ¡”‘…ä‰•¥¹Ì…ÌÝ•±°…ÌÝ¡•É”¸%Ð…ÉÉ¥•Ì„¡…±¼¥¸Ñ¡”µ…À(€¨½±½ÕÉÌÍ¼¥ÐÍÑ…åÌ±•¥‰±”½Ù•È„‰±½¬…ÌÝ•±°…Ì½Ù•È½Á•¸É½Õ¹¸(€¨(€¨%Ð¥Ì‘•½É…Ñ¥½¸¥¸Ñ¡”ÍÑÉ¥ÐÍ•¹Í”ƒŠP¹¼ÍÑ…Ñ”°¹¼¥¹Ñ•É…Ñ¥½¸°¹½Ñ¡¥¹œ(€¨‘•É¥Ù•™É½´¥Ð¸‘É¥Ù•ÈÉ•…‘¥¹œÑ¡”…¹Ù…ÌÍ¡½Õ±‰”…‰±”Ñ¼™¥¹Ñ¡•¥È(€¨ÍÑ…ÉÑ¥¹œÁ½¥¹Ð¥¸Õ¹‘•È„Í•½¹°…¹„¹Õµ‰•É•‘¥ÍŒ…µ½¹œ½Ñ¡•È¹Õµ‰•É•(€¨‘¥ÍÌ‘½•Ì¹½Ð‘¼Ñ¡…Ð¸(€¨¼)™Õ¹Ñ¥½¸=É¥¥¹5…É­•È¡ì(€Á½¥¹ÑÌ°(€½±½ÕÈ°(€Ñ¡•µ”°)ôèì(€Á½¥¹ÑÌèÉ•…‘½¹±äA½¥¹Ñmtì(€½±½ÕÈèÍÑÉ¥¹œì(€Ñ¡•µ”èQ¡•µ•9…µ”ì)ô¤èI•…Ð¹)M`¹±•µ•¹Ðð¹Õ±°ì(€½¹ÍÐ™¥ÉÍÐ€ôÁ½¥¹ÑÍlÁtì(€½¹ÍÐ¹•áÐ€ôÁ½¥¹ÑÍlÅtì(€¥˜€¡™¥ÉÍÐ€ôôôÕ¹‘•™¥¹•ñð¹•áÐ€ôôôÕ¹‘•™¥¹•¤É•ÑÕÉ¸¹Õ±°ì((€½¹ÍÐ‘•É••Ì€ô€¡5…Ñ ¹…Ñ…¸È¡¹•áÐ¹ä€´™¥ÉÍÐ¹ä°¹•áÐ¹à€´™¥ÉÍÐ¹à¤€¨€ÄàÀ¤€¼5…Ñ ¹A$ì((€É•ÑÕÉ¸€ (€€€€ñ(€€€€€Ñ•ÍÑ%ô‰É½ÕÑ”µ…¹Ù…Ìµ½É¥¥¸ˆ(€€€€€ÑÉ…¹Í™½É´õíÑÉ…¹Í±…Ñ” ‘í™¥ÉÍÐ¹áô€‘í™¥ÉÍÐ¹åô¤É½Ñ…Ñ” ‘í‘•É••Íô¥ô(€€€€ø(€€€€€€ñA…Ñ (€€€€€€€õí=I%%9}QI%91ô(€€€€€€€™¥±°õí½±½ÕÉô(€€€€€€€ÍÑÉ½­”õíµ…Á½±½ÕÉÍmÑ¡•µ•t¹±…¹‘ô(€€€€€€€ÍÑÉ½­•]¥‘Ñ õìÉô(€€€€€€€ÍÑÉ½­•1¥¹•©½¥¸ô‰É½Õ¹ˆ(€€€€€€¼ø(€€€€ð½ø(€€¤ì)ô(