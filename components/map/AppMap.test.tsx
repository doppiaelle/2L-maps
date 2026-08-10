import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';

import { AppMap } from './AppMap';
import type { AppMapHandle } from '@/lib/providers/types';
import { colours } from '@/lib/design/tokens';
import type { MarkerInput } from '@/lib/map/clustering';
import { mapCalls, resetMapCalls } from '../../__mocks__/react-native-maps';
import { MARKER_CLUSTER_THRESHOLD } from '@/types';

/**
 * The map is mocked; the facade is not. What is asserted here is **what the
 * facade asked the SDK to draw** — the polyline's colour and dash pattern, the
 * Map ID, the marker count — because those are the facts the facade is
 * responsible for and the only ones a test can see without a device.
 *
 * Every state in `docs/09_COMPONENT_LIBRARY.md` §6 is covered: loading, ready,
 * offline, failed, and a degraded route.
 */

const mapIds = { light: 'light-map-id', dark: 'dark-map-id' };

/**
 * Markers and the attribution are hidden from the accessibility tree on purpose
 * — the map is one element and the notice is for the eye — and RNTL skips hidden
 * elements by default. Every query below that asserts a *visual* fact has to opt
 * back in, which is itself a check that they really are hidden.
 */
const visually = { includeHiddenElements: true } as const;

const stop = (i: number, overrides: Partial<MarkerInput> = {}): MarkerInput => ({
  stopId: `stop-${i}`,
  position: i + 1,
  coordinate: { latitude: 45.65 + (i % 10) * 0.01, longitude: 9.6 + Math.floor(i / 10) * 0.01 },
  state: 'pending',
  ...overrides,
});

const stops = (count: number) => Array.from({ length: count }, (_, i) => stop(i));
const noop = () => undefined;

const baseProps = {
  stops: stops(3),
  route: null,
  selectedStopId: null,
  theme: 'light' as const,
  mapIds,
  status: 'ready' as const,
  onStopPress: noop,
  onMapPress: noop,
};

beforeEach(() => {
  resetMapCalls();
});

describe('what reaches the SDK', () => {
  it('selects the Map ID for the current theme', () => {
    render(<AppMap {...baseProps} theme="dark" />);
    expect(screen.getByTestId('app-map').props.googleMapId).toBe('dark-map-id');
  });

  it('falls back to the default style when no Map ID is configured', () => {
    // Risk C15: a revoked Map ID must degrade to a working map, never a blank
    // one (docs/14_GOOGLE_MAPS_INTEGRATION.md §6).
    render(<AppMap {...baseProps} mapIds={{ light: '', dark: '' }} />);
    expect(screen.getByTestId('app-map').props.googleMapId).toBeUndefined();
  });

  it('draws one marker per stop below the cluster threshold', () => {
    render(<AppMap {...baseProps} stops={stops(MARKER_CLUSTER_THRESHOLD)} />);
    expect(screen.getAllByTestId('map-marker', visually)).toHaveLength(MARKER_CLUSTER_THRESHOLD);
  });

  it('clusters above it', () => {
    render(<AppMap {...baseProps} stops={stops(MARKER_CLUSTER_THRESHOLD + 10)} />);
    expect(screen.queryAllByTestId('map-cluster', visually).length).toBeGreaterThan(0);
  });

  it('gives every pin a 44 pt hit area', () => {
    // The drawn pin may be smaller; the hit area may not (CLAUDE.md §10 rule 2).
    render(<AppMap {...baseProps} />);

    for (const area of screen.getAllByTestId('marker-hit-area', visually)) {
      expect(area.props.style).toMatchObject({ width: 44, height: 44 });
    }
  });
});

describe('the route line', () => {
  const roadRoute = {
    legs: [],
    decodedPolyline: [
      { latitude: 45.65, longitude: 9.6 },
      { latitude: 45.66, longitude: 9.61 },
      { latitude: 45.67, longitude: 9.62 },
    ],
    isDegraded: false,
  };

  it('draws mint with a casing beneath it in light theme', () => {
    render(<AppMap {...baseProps} route={roadRoute} />);

    const line = screen.getByTestId('route-line');
    const casing = screen.getByTestId('route-casing');

    expect(line.props.strokeColor).toBe(colours.light.accent);
    expect(casing.props.strokeWidth).toBeGreaterThan(line.props.strokeWidth);
  });

  it('drops the casing in dark theme', () => {
    render(<AppMap {...baseProps} theme="dark" route={roadRoute} />);
    expect(screen.queryByTestId('route-casing')).toBeNull();
  });

  it('never draws a degraded result as a continuous road line', () => {
    // A smooth line would claim road routing that did not happen. This is a
    // correctness rule, not a style choice (docs/15_ROUTE_OPTIMIZATION.md).
    render(<AppMap {...baseProps} route={{ legs: [], decodedPolyline: [], isDegraded: true }} />);

    expect(screen.queryByTestId('route-line')).toBeNull();
    const connectors = screen.getAllByTestId('route-connector');
    expect(connectors).toHaveLength(2);
    for (const connector of connectors) {
      expect(connector.props.lineDashPattern).toBeDefined();
      expect(connector.props.strokeColor).toBe(colours.light.warning);
    }
  });

  it('draws markers only, and reports a defect, when a road route will not decode', () => {
    // Documented behaviour (docs/09_COMPONENT_LIBRARY.md §Errors): the user
    // still gets their stops, and the defect is recorded rather than swallowed.
    let defects = 0;
    render(
      <AppMap
        {...baseProps}
        route={{ legs: [], decodedPolyline: [], isDegraded: false }}
        onGeometryDefect={() => {
          defects += 1;
        }}
      />,
    );

    expect(screen.queryByTestId('route-line')).toBeNull();
    expect(screen.queryAllByTestId('route-connector')).toHaveLength(0);
    expect(screen.getAllByTestId('map-marker', visually)).toHaveLength(3);
    expect(defects).toBe(1);
  });
});

describe('states', () => {
  it('covers the map with its own surface until the SDK is ready', () => {
    // Never a grey void (docs/09_COMPONENT_LIBRARY.md §6).
    render(<AppMap {...baseProps} />);
    expect(screen.getByTestId('app-map-loading').props.style).toMatchObject({
      backgroundColor: colours.light.bg,
    });
  });

  it('uncovers it once the map reports ready', () => {
    render(<AppMap {...baseProps} />);
    fireEvent(screen.getByTestId('app-map'), 'mapReady');
    expect(screen.queryByTestId('app-map-loading')).toBeNull();
  });

  it('says the dock still works when offline', () => {
    // The failure is explained and bounded: the stop list, the order and the
    // handoff do not depend on tiles rendering.
    render(<AppMap {...baseProps} status="offline" />);

    expect(screen.getByText('Map unavailable offline')).toBeTruthy();
    expect(screen.getByText('Your stops and route are still here.')).toBeTruthy();
  });

  it('offers a retry when loading failed', () => {
    let retries = 0;
    render(
      <AppMap
        {...baseProps}
        status="failed"
        onRetry={() => {
          retries += 1;
        }}
      />,
    );

    fireEvent.press(screen.getByLabelText('Try loading the map again'));
    expect(retries).toBe(1);
  });

  it('still explains a failure with no retry to offer', () => {
    // An error path with no next action still has a user-visible outcome
    // (CLAUDE.md §0 rule 5) — here, the sheet.
    render(<AppMap {...baseProps} status="failed" />);
    expect(screen.getByText('The map could not load')).toBeTruthy();
    expect(screen.queryByLabelText('Try loading the map again')).toBeNull();
  });

  it('names the stops it cannot draw rather than dropping them', () => {
    // Coordinates expire at 30 days (ADR-0007). The user must not find out by
    // counting pins.
    let reported: readonly string[] = [];
    render(
      <AppMap
        {...baseProps}
        stops={[stop(0), stop(1, { coordinate: null }), stop(2)]}
        onUndrawableStops={(ids) => {
          reported = ids;
        }}
      />,
    );

    expect(reported).toEqual(['stop-1']);
    expect(screen.getAllByTestId('map-marker', visually)).toHaveLength(2);
  });
});

describe('accessibility', () => {
  it('is one element with a summary, not a field of pins', () => {
    // A screen reader user cannot usefully explore pins by touch; the stop list
    // is the accessible equivalent (docs/23_ACCESSIBILITY.md).
    render(<AppMap {...baseProps} stops={stops(12)} />);

    expect(screen.getByLabelText('Route map, 12 stops')).toBeTruthy();
  });

  it('counts one stop in the singular', () => {
    render(<AppMap {...baseProps} stops={stops(1)} />);
    expect(screen.getByLabelText('Route map, 1 stop')).toBeTruthy();
  });

  it('hides individual markers from the accessibility tree', () => {
    render(<AppMap {...baseProps} />);

    for (const marker of screen.getAllByTestId('map-marker', visually)) {
      expect(marker.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it('keeps attribution on screen, above where the dock sits', () => {
    // A terms obligation: visible wherever the map is, never dismissible
    // (docs/32_LEGAL_COMPLIANCE.md).
    render(<AppMap {...baseProps} testID="map-container" bottomObstructionFraction={0.5} />);
    fireEvent(screen.getByTestId('map-container'), 'layout', {
      nativeEvent: { layout: { height: 800, width: 400 } },
    });

    // 800 × 0.5 for the sheet, plus the token gap above it. Sitting at the
    // bottom of the map would put a non-dismissible legal notice under the sheet.
    expect(screen.getByTestId('app-map-attribution', visually).props.style).toMatchObject({
      bottom: 408,
    });
  });
});

describe('interaction', () => {
  it('selects a stop when its marker is tapped', () => {
    let selected: string | null = null;
    render(
      <AppMap
        {...baseProps}
        onStopPress={(id) => {
          selected = id;
        }}
      />,
    );

    const marker = screen.getAllByTestId('map-marker', visually)[1];
    if (marker === undefined) throw new Error('expected a second marker');

    fireEvent.press(marker);
    expect(selected).toBe('stop-1');
  });

  it('deselects when the map itself is tapped', () => {
    let deselected = false;
    render(
      <AppMap
        {...baseProps}
        onMapPress={() => {
          deselected = true;
        }}
      />,
    );

    fireEvent.press(screen.getByTestId('app-map'));
    expect(deselected).toBe(true);
  });

  it('never hides the selected stop inside a cluster', () => {
    // docs/14_GOOGLE_MAPS_INTEGRATION.md §7. The user selected it; a map that
    // answers by folding it into a count has not answered.
    render(
      <AppMap
        {...baseProps}
        stops={stops(MARKER_CLUSTER_THRESHOLD + 10)}
        selectedStopId="stop-7"
      />,
    );

    // Drawn last, which is also its raised z-index: the SDK draws in array order,
    // so a selected pin beneath a neighbouring cluster is the one pin the user
    // cannot see.
    const markers = screen.getAllByTestId('map-marker', visually);
    const last = markers[markers.length - 1];
    if (last === undefined) throw new Error('expected the selected marker');

    // `stop-7` is the eighth stop, so it carries the ordinal 8.
    expect(within(last).getByText('8', visually)).toBeTruthy();
  });
});

describe('the camera', () => {
  it('fits the route once the map is ready', () => {
    render(<AppMap {...baseProps} />);
    fireEvent(screen.getByTestId('app-map'), 'mapReady');

    expect(mapCalls.fitToCoordinates.length).toBeGreaterThan(0);
  });

  it('leaves room for the dock at the bottom', () => {
    // A route fitted behind a half-open sheet is fitted wrongly (docs/14 §9).
    render(<AppMap {...baseProps} testID="map-container" bottomObstructionFraction={0.5} />);
    fireEvent(screen.getByTestId('map-container'), 'layout', {
      nativeEvent: { layout: { height: 800, width: 400 } },
    });
    fireEvent(screen.getByTestId('app-map'), 'mapReady');

    const call = mapCalls.fitToCoordinates[mapCalls.fitToCoordinates.length - 1];
    const options = call?.options as { edgePadding: { bottom: number; top: number } } | undefined;
    expect(options?.edgePadding.bottom).toBeGreaterThan(options?.edgePadding.top ?? 0);
  });

  it('stops following after a gesture, so the map never moves under a finger', () => {
    const { rerender } = render(<AppMap {...baseProps} />);
    fireEvent(screen.getByTestId('app-map'), 'mapReady');
    const beforeGesture = mapCalls.fitToCoordinates.length;

    fireEvent(screen.getByTestId('app-map'), 'panDrag');
    rerender(<AppMap {...baseProps} stops={stops(5)} />);

    expect(mapCalls.fitToCoordinates).toHaveLength(beforeGesture);
  });

  it('resumes following when the handle is asked to fit — the Recenter control', () => {
    // An explicit fit is the only way back once a gesture has stopped following.
    // Without this, one accidental pan means the camera never tracks a new
    // result again for the rest of the session.
    const ref = createRef<AppMapHandle>();
    const { rerender } = render(<AppMap {...baseProps} ref={ref} />);
    fireEvent(screen.getByTestId('app-map'), 'mapReady');
    fireEvent(screen.getByTestId('app-map'), 'panDrag');

    const handle = ref.current;
    if (handle === null) throw new Error('expected a handle');

    handle.fitToBounds(
      {
        northEast: { latitude: 45.8, longitude: 9.8 },
        southWest: { latitude: 45.6, longitude: 9.6 },
      },
      { bottom: 100 },
    );
    const afterRecenter = mapCalls.fitToCoordinates.length;

    // The proof that following resumed: a new route fits the camera again.
    rerender(<AppMap {...baseProps} ref={ref} stops={stops(5)} />);
    expect(mapCalls.fitToCoordinates.length).toBeGreaterThan(afterRecenter);
  });

  it('moves instantly under reduced motion', () => {
    // Transitions become instant; nothing depends on animation to be understood
    // (CLAUDE.md §10 rule 6).
    const ref = createRef<AppMapHandle>();
    render(<AppMap {...baseProps} ref={ref} prefersReducedMotion />);

    ref.current?.moveTo({ center: { latitude: 45.7, longitude: 9.7 }, zoom: 12 }, true);

    expect(mapCalls.animateCamera).toHaveLength(0);
    expect(mapCalls.setCamera).toHaveLength(1);
  });

  it('animates when motion is allowed', () => {
    const ref = createRef<AppMapHandle>();
    render(<AppMap {...baseProps} ref={ref} />);

    ref.current?.moveTo({ center: { latitude: 45.7, longitude: 9.7 }, zoom: 12 }, true);

    expect(mapCalls.animateCamera).toHaveLength(1);
  });

  it('takes a snapshot through the handle', async () => {
    const ref = createRef<AppMapHandle>();
    render(<AppMap {...baseProps} ref={ref} />);

    const handle = ref.current;
    if (handle === null) throw new Error('expected a handle');

    expect(await handle.snapshot()).toContain('base64');
    expect(mapCalls.snapshots).toBe(1);
  });
});
