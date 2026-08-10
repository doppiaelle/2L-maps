import { memo, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { MapAttribution } from './MapAttribution';
import { colours, mapColours, radius, space, stroke } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { LatLng } from '@/lib/geo/haversine';
import { fitProjection, pathThrough } from '@/lib/map/projection';
import type { Point } from '@/lib/map/projection';
import { simplify } from '@/lib/map/simplify';
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

export const RouteCanvas = memo(function RouteCanvas({
  stops,
  route,
  selectedStopId,
  theme,
  undrawableStopIds = [],
  testID,
}: RouteCanvasProps): React.JSX.Element {
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
      return {
        pins,
        road: pathThrough(simplify(route.path.map(projection.project))),
        segments: [],
      };
    }

    if (route.kind === 'connectors') {
      return {
        pins,
        road: null,
        // Separate paths rather than one dashed line through every stop. A
        // single path would join at the stops and read as continuous, which is
        // the one impression a degraded result must not give.
        segments: route.segments.map((segment) => ({
          id: segment.id,
          d: pathThrough([projection.project(segment.from), projection.project(segment.to)]),
        })),
      };
    }

    return { pins, road: null, segments: [] };
  }, [stops, route, size]);

  const isDegraded = route.kind === 'connectors';
  const summary = `Route preview, ${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}${
    isDegraded ? ', straight-line estimate' : ''
  }`;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: map.land,
        borderRadius: radius.radiusLg,
        overflow: 'hidden',
      }}
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
      accessibilityRole="image"
      accessibilityLabel={summary}
      testID={testID}
    >
      {size.width > 0 && size.height > 0 && (
        <Svg width={size.width} height={size.height} testID="route-canvas-svg">
          {/* The ground. A rectangle rather than the container's background so
              the whole drawing is one surface the SVG owns — and so a future
              snapshot exports what is on screen rather than a transparent hole. */}
          <Rect x={0} y={0} width={size.width} height={size.height} fill={map.land} />

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
                fill="none"
              />
            </>
          )}

          {drawn.segments.map((segment) => (
            <Path
              key={segment.id}
              testID="route-connector"
              d={segment.d}
              stroke={palette.warning}
              strokeWidth={stroke.routeDegraded}
              strokeDasharray={DEGRADED_DASH}
              strokeLinecap="round"
              fill="none"
            />
          ))}

          {drawn.pins.map((pin) => (
            <Pin
              key={pin.stopId}
              point={pin.point}
              state={pin.state}
              isSelected={pin.stopId === selectedStopId}
              theme={theme}
            />
          ))}
        </Svg>
      )}

      {/* The pin numbers, as real text rather than SVG glyphs: `Text` gets
          Dynamic Type and the platform's own font, and an SVG `<Text>` gets
          neither (`CLAUDE.md` §10 rule 5). */}
      {drawn.pins.map((pin) => (
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
}: {
  point: Point;
  state: StopProgressState;
  isSelected: boolean;
  theme: ThemeName;
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
