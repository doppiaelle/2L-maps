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
    expect(screen.getByText('1', visually)).toBeTruthy();
    expect(screen.getByText('2', visually)).toBeTruthy();
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
  });

  it('marks where the driver sets off, and which way', () => {
    // A numbered disc among other numbered discs does not tell anyone where the
    // day begins.
    laidOut(canvas(road, [stop('s1', 1), stop('s2', 2)], { scenerySeed: 'route-1' }));

    expect(screen.getByTestId('route-canvas-origin')).toBeTruthy();
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
