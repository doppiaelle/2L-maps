import { buildRouteGeometry, coordinatesToFit, planRoute } from './route-geometry';
import type { PositionedStop } from './route-geometry';
import { encodePolyline } from '@/lib/routing/polyline';
import type { Leg, OptimizationResult } from '@/types';

/**
 * The T0 distinction is a correctness requirement, not a style choice
 * (docs/14_GOOGLE_MAPS_INTEGRATION.md §8), so it is tested as one: a degraded
 * result must never produce a road-shaped line, under any input.
 */

const leg = (from: string, to: string, polyline: string): Leg => ({
  fromStopId: from,
  toStopId: to,
  distanceMeters: 1000,
  durationSeconds: 300,
  polyline,
});

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

const stop = (id: string, coordinate: { latitude: number; longitude: number } | null) =>
  ({ stopId: id, coordinate }) satisfies PositionedStop;

describe('building the geometry once', () => {
  it('decodes every leg into one path', () => {
    const result: OptimizationResult = {
      tier: 'T1',
      isDegraded: false,
      orderedStopIds: ['a', 'b', 'c'],
      legs: [
        leg('a', 'b', encodePolyline([at(45.7, 9.7), at(45.71, 9.71)])),
        leg('b', 'c', encodePolyline([at(45.71, 9.71), at(45.72, 9.72)])),
      ],
      totalDistanceMeters: 2000,
      totalDurationSeconds: 600,
      unreachableStopIds: [],
    };

    const geometry = buildRouteGeometry(result);

    // Three points, not four: the joint between the legs arrives twice and is
    // counted once.
    expect(geometry.decodedPolyline).toHaveLength(3);
    expect(geometry.isDegraded).toBe(false);
  });

  it('drops the duplicated joint between consecutive legs', () => {
    // A duplicate vertex is invisible on a solid line and visible on a dashed
    // one, because the dash phase restarts at it.
    const shared = at(45.71, 9.71);
    const result: OptimizationResult = {
      tier: 'T1',
      isDegraded: false,
      orderedStopIds: ['a', 'b', 'c'],
      legs: [
        leg('a', 'b', encodePolyline([at(45.7, 9.7), shared])),
        leg('b', 'c', encodePolyline([shared, at(45.72, 9.72)])),
      ],
      totalDistanceMeters: 2000,
      totalDurationSeconds: 600,
      unreachableStopIds: [],
    };

    const path = buildRouteGeometry(result).decodedPolyline;
    const jointOccurrences = path.filter((p) => Math.abs(p.latitude - 45.71) < 1e-6).length;
    expect(jointOccurrences).toBe(1);
  });

  it('gives a degraded result no geometry at all', () => {
    // T0 is an ordering. Anything else here would be geometry we invented.
    const geometry = buildRouteGeometry({
      tier: 'T0',
      isDegraded: true,
      orderedStopIds: ['a', 'b'],
      totalDistanceMeters: 1200,
    });

    expect(geometry).toEqual({ legs: [], decodedPolyline: [], isDegraded: true });
  });
});

describe('what gets drawn', () => {
  const stops = [stop('a', at(45.7, 9.7)), stop('b', at(45.71, 9.71)), stop('c', at(45.72, 9.72))];

  it('draws a road route as the decoded path', () => {
    const drawn = planRoute(
      {
        legs: [],
        decodedPolyline: [at(45.7, 9.7), at(45.705, 9.705), at(45.71, 9.71)],
        isDegraded: false,
      },
      stops,
    );

    expect(drawn.kind).toBe('road');
    if (drawn.kind === 'road') expect(drawn.path).toHaveLength(3);
  });

  it('never draws a degraded route as a road line', () => {
    // The whole point. A smooth curve would claim road routing that did not
    // happen (docs/15_ROUTE_OPTIMIZATION.md).
    const drawn = planRoute({ legs: [], decodedPolyline: [], isDegraded: true }, stops);

    expect(drawn.kind).toBe('connectors');
    if (drawn.kind === 'connectors') {
      expect(drawn.segments).toHaveLength(2);
      expect(drawn.segments[0]?.id).toBe('a→b');
    }
  });

  it('runs a degraded connector past a stop whose coordinate expired', () => {
    // The stop is still reported by the marker plan; it just cannot anchor a
    // line (ADR-0007). Breaking the line into two would imply two routes.
    const drawn = planRoute({ legs: [], decodedPolyline: [], isDegraded: true }, [
      stop('a', at(45.7, 9.7)),
      stop('b', null),
      stop('c', at(45.72, 9.72)),
    ]);

    expect(drawn.kind).toBe('connectors');
    if (drawn.kind === 'connectors') {
      expect(drawn.segments).toHaveLength(1);
      expect(drawn.segments[0]?.id).toBe('a→c');
    }
  });

  it('draws nothing, and says why, when a road route will not decode', () => {
    // Markers only, logged as a defect (docs/09_COMPONENT_LIBRARY.md) — and
    // deliberately not connectors, which would relabel a road route as degraded.
    const drawn = planRoute({ legs: [], decodedPolyline: [], isDegraded: false }, stops);

    expect(drawn).toEqual({ kind: 'none', reason: 'undecodable' });
  });

  it('distinguishes having no route from having a broken one', () => {
    expect(planRoute(null, stops)).toEqual({ kind: 'none', reason: 'no-route' });
  });

  it('has nothing to connect with one placeable stop', () => {
    const drawn = planRoute({ legs: [], decodedPolyline: [], isDegraded: true }, [
      stop('a', at(45.7, 9.7)),
      stop('b', null),
    ]);
    expect(drawn).toEqual({ kind: 'none', reason: 'too-few-stops' });
  });
});

describe('what the camera has to fit', () => {
  it('includes the road line, not only the stops', () => {
    // A motorway ring bulges outside the box the stops describe, and fitting the
    // stops alone crops it.
    const stops = [stop('a', at(45.7, 9.7)), stop('b', at(45.71, 9.71))];
    const drawn = planRoute(
      {
        legs: [],
        decodedPolyline: [at(45.7, 9.7), at(45.9, 9.9), at(45.71, 9.71)],
        isDegraded: false,
      },
      stops,
    );

    const fit = coordinatesToFit(drawn, stops);
    expect(fit.some((c) => c.latitude > 45.8)).toBe(true);
  });

  it('fits the stops when there is no line to fit', () => {
    const stops = [stop('a', at(45.7, 9.7)), stop('b', null)];
    expect(coordinatesToFit({ kind: 'none', reason: 'no-route' }, stops)).toEqual([at(45.7, 9.7)]);
  });
});
