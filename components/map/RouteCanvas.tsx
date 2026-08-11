import { memo, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { MapAttribution } from './MapAttribution';
import { colours, mapColours, radius, space, stroke } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { LatLng } from '@/lib/geo/haversine';
import { fitProjection, pathThrough } from '@/lib/map/projection';
import { sceneryFor } from '@/lib/map/scenery';
import type { Scenery } from '@/lib/map/scenery';
import type { Point } from '@/lib/map/projection';
import { simplify } from '@/lib/map/simplify';
import { legAt } from '@/lib/map/leg-selection';
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
const EMPTY_SCENERY: Scenery = { roads: [], blocks: [] };

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
        road: pathThrough(projected),
        legs,
        segments: [],
        // The town is generated around the *simplified* line, so the scenery and
        // the route agree about where the route is.
        scenery: sceneryFor({ path: projected, size, seed: scenerySeed }),
        heading: projected,
      };
    }

    if (route.kind === 'connectors') {
      const through = pins.map((pin) => pin.point);
      return {
        pins,
        road: null,
        // A T0 result has no per-leg geometry to inspect, and the waiting face
        // has no result at all. Nothing to tap in either case.
        legs: [],
        scenery: sceneryFor({ path: through, size, seed: scenerySeed }),
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

    return { pins, road: null, legs: [], segments: [], scenery: EMPTY_SCENERY, heading: [] };
  }, [stops, route, size, scenerySeed]);

  // Only a *result* can be degraded. While preparing, the connectors are the
  // stops in the order they were typed and claim nothing about distance or
  // traffic — calling that "straight-line estimate" would announce a degraded
  // answer for a route that has not been computed at all.
  const selectedLeg = selectedLegIndex === null ? null : (drawn.legs[selectedLegIndex] ?? null);

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
        <Svg
          width={size.width}
          height={size.height}
          testID="route-canvas-svg"
          {...(isInspectable
            ? {
                /**
                 * One handler for the whole canvas, rather than a touch target
                 * per hop.
                 *
                 * The corridors overlap wherever the route doubles back — a run
                 * through a town centre and out again passes the same junction
                 * twice — and per-path handlers would answer with whichever leg
                 * happened to be drawn last, not the one nearest the finger.
                 * `legAt` answers *nearest*, and is tested for exactly that case.
                 *
                 * A tap on empty canvas clears the selection, which is the way
                 * back to the whole route without leaving the map.
                 */
                onPress: (event: GestureResponderEvent) => {
                  const { locationX, locationY } = event.nativeEvent;
                  onSelectLeg?.(
                    legAt(
                      { x: locationX, y: locationY },
                      drawn.legs.map((leg) => leg.points),
                    ),
                  );
                },
              }
            : {})}
        >
          {/* The ground. A rectangle rather than the container's background so
              the whole drawing is one surface the SVG owns — and so a future
              snapshot exports what is on screen rather than a transparent hole. */}
          <Rect x={0} y={0} width={size.width} height={size.height} fill={map.land} />

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
              rx={2}
              fill={map.park}
              opacity={block.opacity}
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
