import { fireEvent, render, screen } from '@testing-library/react-native';

import { RouteCanvas } from './RouteCanvas';
import type { CanvasStop } from './RouteCanvas';
import type { DrawnRoute } from '@/lib/map/route-geometry';

/**
 * The drawn route preview.
 *
 * Two properties here are correctness rules rather than appearance, and both are
 * invisible when broken. A degraded result drawn as one continuous line claims
 * road routing that never happened; a stop with no coordinate silently omitted
 * makes a twelve-stop day look like an eleven-stop one.
 *
 * The canvas measures itself before it draws, so every case has to lay out
 * first — which is also the first frame of every real mount.
 */

/** The canvas is one accessibility element, so everything inside it is hidden
 *  from the default query — which is the intended behaviour, not an obstacle. */
const visually = { includeHiddenElements: true } as const;

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

const stop = (stopId: string, position: number, coordinate = at(45.6 + position * 0.01, 9.6)) =>
  ({ stopId, position, coordinate, state: 'pending' }) as CanvasStop;

const road: DrawnRoute = {
  kind: 'road',
  path: [at(45.6, 9.6), at(45.65, 9.62), at(45.7, 9.65)],
  legPaths: [
    [at(45.6, 9.6), at(45.65, 9.62)],
    [at(45.65, 9.62), at(45.7, 9.65)],
  ],
};

const connectors: DrawnRoute = {
  kind: 'connectors',
  segments: [
    { id: 'a', from: at(45.6, 9.6), to: at(45.65, 9.62) },
    { id: 'b', from: at(45.65, 9.62), to: at(45.7, 9.65) },
  ],
};

const laidOut = (element: React.JSX.Element) => {
  const utils = render(element);
  fireEvent(screen.getByTestId('canvas'), 'layout', {
    nativeEvent: { layout: { width: 390, height: 400, x: 0, y: 0 } },
  });
  return utils;
};

const canvas = (route: DrawnRoute, stops: readonly CanvasStop[], overrides = {}) => (
  <RouteCanvas
    stops={stops}
    route={route}
    selectedStopId={null}
    theme="light"
    testID="canvas"
    {...overrides}
  />
);

describe('what it draws', () => {
  it('draws a pin per placed stop', () => {
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2), stop('s3', 3)]));
    expect(screen.getAllByTestId('route-canvas-pin')).toHaveLength(3);
  });

  it('draws the road path as one line for a real result', () => {
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)]));
    expect(screen.getByTestId('route-line')).toBeTruthy();
    expect(screen.queryAllByTestId('route-connector')).toHaveLength(0);
  });

  it('numbers the pins, so the order is readable without colour', () => {
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)]));
    expect(screen.getAllByTestId('route-canvas-pin-label', visually)).toHaveLength(2);
  });
});

describe('a degraded result', () => {
  it('draws one segment per hop, never a continuous line', () => {
    // A single path would join at the stops and read as continuous, which is the
    // one impression a straight-line ordering must not give (docs/14).
    laidOut(canvas(connectors, [stop('s1', 1), stop('s2', 2), stop('s3', 3)]));

    expect(screen.getAllByTestId('route-connector')).toHaveLength(2);
    expect(screen.queryByTestId('route-line')).toBeNull();
  });

  it('says so to a screen reader as well as in the drawing', () => {
    // Never colour or dashes alone (`CLAUDE.md` §10 rule 4).
    laidOut(canvas(connectors, [stop('s1', 1), stop('s2', 2)]));
    expect(screen.getByTestId('canvas').props.accessibilityLabel).toMatch(/straight-line/i);
  });
});

describe('a stop that cannot be placed', () => {
  const unplaceable = {
    stopId: 's2',
    position: 2,
    coordinate: null,
    state: 'pending',
  } as CanvasStop;

  it('is left out of the drawing rather than drawn at the equator', () => {
    laidOut(canvas(road, [stop('s1', 1), unplaceable]));
    expect(screen.getAllByTestId('route-canvas-pin')).toHaveLength(1);
  });

  it('is named, rather than leaving the user to count pins', () => {
    laidOut(canvas(road, [stop('s1', 1), unplaceable], { undrawableStopIds: ['s2'] }));
    expect(screen.getByTestId('route-canvas-undrawable')).toBeTruthy();
    expect(screen.getByText('1 stop could not be placed')).toBeTruthy();
  });

  it('counts them when there are several', () => {
    laidOut(canvas(road, [stop('s1', 1)], { undrawableStopIds: ['s2', 's3'] }));
    expect(screen.getByText('2 stops could not be placed')).toBeTruthy();
  });

  it('says nothing when everything was placed', () => {
    laidOut(canvas(road, [stop('s1', 1)]));
    expect(screen.queryByTestId('route-canvas-undrawable')).toBeNull();
  });
});

describe('before it has been measured', () => {
  it('renders without drawing, rather than dividing by a zero-width canvas', () => {
    // The first frame of every mount.
    render(canvas(road, [stop('s1', 1), stop('s2', 2)]));
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(screen.queryByTestId('route-canvas-svg')).toBeNull();
  });
});

describe('the attribution', () => {
  it('is on the canvas, because the geometry is still Google-derived', () => {
    // The renderer changing does not change where the data came from
    // (ADR-0021).
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)]));
    expect(screen.getByTestId('route-canvas-attribution', visually)).toBeTruthy();
  });
});

describe('an empty route', () => {
  it('draws nothing and does not fall over', () => {
    laidOut(canvas({ kind: 'none', reason: 'too-few-stops' }, []));
    expect(screen.queryAllByTestId('route-canvas-pin')).toHaveLength(0);
  });
});

describe('the drawn town', () => {
  it('puts streets and blocks under the route', () => {
    // The canvas was a dark rectangle with a line on it. The scenery is what
    // makes it read as a place — invented, and `lib/map/scenery.ts` says so,
    // but a route floating in a void tells a driver nothing about where they
    // are going.
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)], { scenerySeed: 'route-1' }));

    expect(screen.getAllByTestId('scenery-road').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('scenery-block').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('scenery-building').length).toBeGreaterThan(0);
  });

  it('provides the map controls required by the navigation viewport', () => {
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)], { scenerySeed: 'route-1' }));
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
    expect(screen.getByLabelText('Recenter route')).toBeTruthy();
    expect(screen.getByTestId('map-compass', visually)).toBeTruthy();
    expect(screen.getByTestId('map-scale', visually)).toBeTruthy();
  });

  it('marks where the driver sets off, and which way', () => {
    // A numbered disc among other numbered discs does not tell anyone where the
    // day begins.
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)], { scenerySeed: 'route-1' }));

    expect(screen.getByTestId('route-canvas-origin')).toBeTruthy();
  });

  it('draws quiet route context labels without another map service', () => {
    laidOut(
      canvas(road, [stop('s1', 1), stop('s2', 2)], {
        contextLabels: ['Duomo di Milano', 'Naviglio Grande'],
        scenerySeed: 'route-1',
      }),
    );

    const labels = screen.getAllByTestId('map-context-label', visually);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => label.props.accessibilityLabel === 'Duomo di Milano')).toBe(true);
  });

  it('draws the same town twice for the same route', () => {
    // The property the whole module exists for: scenery that reshuffled between
    // renders would read as movement on a canvas whose job is to hold still.
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)], { scenerySeed: 'route-1' }));
    const first = screen.getAllByTestId('scenery-road').map((r) => String(r.props.x1));

    screen.unmount();
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)], { scenerySeed: 'route-1' }));
    const second = screen.getAllByTestId('scenery-road').map((r) => String(r.props.x1));

    expect(second).toEqual(first);
  });

  it('draws no town before the canvas has been measured', () => {
    // Zero-sized means no projection and nothing to fade around; a grid there
    // would be a hundred SVG nodes at the wrong scale.
    render(canvas(road, [stop('s1', 1)]));
    expect(screen.queryAllByTestId('scenery-road')).toHaveLength(0);
  });
});

describe('the wait for an answer', () => {
  const preparing = (stops: readonly CanvasStop[]) =>
    canvas(connectors, stops, { phase: 'preparing' });

  it('draws the same town around the same stops, so nothing moves when the result lands', () => {
    // The whole difference between a skeleton and a spinner: the canvas is
    // already about *their* day, at the size the answer will occupy
    // (`CLAUDE.md` §7 rule 5).
    laidOut(preparing([stop('a', 1), stop('b', 2), stop('c', 3)]));

    expect(screen.getAllByTestId('route-canvas-pin', visually)).toHaveLength(3);
    expect(screen.getAllByTestId('scenery-road', visually).length).toBeGreaterThan(0);
  });

  it('claims nothing about the route it is waiting for', () => {
    // The degraded style means "straight-line estimate", which is a statement
    // about a result. There is no result. Reusing it here would announce a
    // degraded answer for a route that has not been computed at all.
    laidOut(preparing([stop('a', 1), stop('b', 2)]));

    expect(screen.queryAllByTestId('route-connector', visually)).toHaveLength(0);
    expect(screen.getAllByTestId('route-pending-connector', visually).length).toBeGreaterThan(0);
  });

  it('withholds the ordinals, which are the answer', () => {
    // Showing the entry order and renumbering under the user's eyes would make
    // the wait look like a result that changed its mind.
    laidOut(preparing([stop('a', 1), stop('b', 2)]));

    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('announces work rather than describing a picture', () => {
    laidOut(preparing([stop('a', 1), stop('b', 2)]));
    const element = screen.getByTestId('canvas');

    expect(element.props.accessibilityRole).toBe('progressbar');
    expect(element.props.accessibilityLabel).toContain('Working out the fastest order');
    expect(element.props.accessibilityLabel).not.toContain('straight-line');
  });

  it('does not point a navigator triangle at a first stop nobody has chosen yet', () => {
    // Which stop comes first is precisely the question being asked.
    laidOut(preparing([stop('a', 1), stop('b', 2)]));
    expect(screen.queryByTestId('route-canvas-origin', visually)).toBeNull();
  });

  it('still attributes, because the coordinates are still Google’s', () => {
    // The obligation attaches to the data being shown, not to how confident the
    // drawing is about it (ADR-0021).
    laidOut(preparing([stop('a', 1), stop('b', 2)]));
    expect(screen.getByTestId('route-canvas-attribution', visually)).toBeTruthy();
  });
});

describe('inspecting a hop', () => {
  const stops = [stop('a', 1), stop('b', 2), stop('c', 3)];

  /**
   * **Which leg a tap means is not asserted here**, and deliberately. The
   * gesture double in `jest.setup.ts` recognises nothing — a double that
   * satisfied the real detector would be most of the library — so a simulated
   * tap through it would be asserting the double.
   *
   * The decision is pure and is proven where it lives: `legAtScreenPoint` in
   * `lib/map/leg-selection.test.ts`, including the case that only appears once
   * the map is zoomed, and `lib/map/viewport.test.ts` for the inverse being
   * exact. What is left for the canvas is what it *draws* about a selection.
   */
  it('brings the selected hop forward and lets the rest recede', () => {
    // Dimmed rather than hidden: "eleven minutes" is a different fact on a
    // two-stop route than on a twenty-stop one, so the rest of the day stays as
    // the context that gives it meaning.
    laidOut(canvas(road, stops, { onSelectLeg: () => undefined, selectedLegIndex: 0 }));

    expect(screen.getByTestId('route-leg-selected', visually)).toBeTruthy();
    expect(Number(screen.getByTestId('route-line', visually).props.opacity)).toBeLessThan(1);
  });

  it('draws the whole route at full strength when nothing is selected', () => {
    laidOut(canvas(road, stops, { onSelectLeg: () => undefined }));

    expect(screen.queryByTestId('route-leg-selected', visually)).toBeNull();
    expect(Number(screen.getByTestId('route-line', visually).props.opacity)).toBe(1);
  });

  it('highlights nothing for an index the route does not have', () => {
    // A stale index outliving the result it was measured on would otherwise
    // throw or highlight an arbitrary hop.
    laidOut(canvas(road, stops, { onSelectLeg: () => undefined, selectedLegIndex: 99 }));
    expect(screen.queryByTestId('route-leg-selected', visually)).toBeNull();
  });

  it('offers nothing to inspect while the answer is still being computed', () => {
    // There are no legs yet, so there is nothing a tap could be about.
    laidOut(canvas(connectors, stops, { phase: 'preparing', onSelectLeg: () => undefined }));
    expect(screen.queryByTestId('route-leg-selected', visually)).toBeNull();
  });
});

describe('the ground under a route that crosses a country', () => {
  /** Rome, Milan, Bari — the route the product owner reported on, and about
   *  nine hundred kilometres across. */
  const national = [
    stop('a', 1, at(41.9, 12.5)),
    stop('b', 2, at(45.46, 9.19)),
    stop('c', 3, at(41.12, 16.87)),
  ];

  const nationalRoad: DrawnRoute = {
    kind: 'road',
    path: [at(41.9, 12.5), at(45.46, 9.19), at(41.12, 16.87)],
    legPaths: [
      [at(41.9, 12.5), at(45.46, 9.19)],
      [at(45.46, 9.19), at(41.12, 16.87)],
    ],
  };

  it('draws a coastline where the invented town would be a lie', () => {
    // The reported defect: a fixed pixel grid makes each "block" about a hundred
    // kilometres at this scale, so the background was empty but for a few
    // scattered squares (ADR-0028).
    laidOut(canvas(nationalRoad, national));

    expect(screen.getAllByTestId('landmass', visually).length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('scenery-road', visually)).toHaveLength(0);
  });

  it('draws streets and no coastline on a delivery round', () => {
    // The two take turns. A coastline a few kilometres across is one edge of one
    // country and reads as nothing at all.
    laidOut(canvas(road, [stop('a', 1), stop('b', 2), stop('c', 3)]));

    expect(screen.getAllByTestId('scenery-road', visually).length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('landmass', visually)).toHaveLength(0);
  });

  it('still attributes, because the stops on it are still Google’s', () => {
    // The ground changing does not change where the route came from (ADR-0021).
    laidOut(canvas(nationalRoad, national));
    expect(screen.getByTestId('route-canvas-attribution', visually)).toBeTruthy();
  });
});
