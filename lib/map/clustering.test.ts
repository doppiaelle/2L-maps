import {
  boundsFor,
  GRID_DIVISIONS,
  overlapsAtScale,
  planMarkers,
  regionToViewport,
  viewportToRegion,
} from './clustering';
import type { MarkerInput, Viewport } from './clustering';
import { MARKER_CLUSTER_THRESHOLD } from '@/types';

/**
 * The clustering threshold is a performance budget, not a preference, so the
 * boundary is tested on both sides. Everything else here is about what the user
 * loses when a pin becomes a cluster — the ordinal they read while driving —
 * and about not losing a stop entirely.
 */

const bergamo: Viewport = {
  southWest: { latitude: 45.65, longitude: 9.6 },
  northEast: { latitude: 45.75, longitude: 9.75 },
};

const marker = (i: number, overrides: Partial<MarkerInput> = {}): MarkerInput => ({
  stopId: `stop-${i}`,
  position: i,
  coordinate: {
    latitude: 45.65 + (i % 10) * 0.01,
    longitude: 9.6 + Math.floor(i / 10) * 0.01,
  },
  state: 'pending',
  ...overrides,
});

const markers = (count: number) => Array.from({ length: count }, (_, i) => marker(i));

describe('the clustering threshold', () => {
  it('draws every stop as its own pin at the threshold', () => {
    // The ordinal is what the user reads out loud while driving, and a cluster
    // hides it. So it is kept for as long as the frame budget allows.
    const plan = planMarkers(markers(MARKER_CLUSTER_THRESHOLD), bergamo);

    expect(plan.isClustered).toBe(false);
    expect(plan.pins).toHaveLength(MARKER_CLUSTER_THRESHOLD);
    expect(plan.pins.every((p) => p.kind === 'marker')).toBe(true);
  });

  it('clusters one above it', () => {
    // Above this, holding 60 fps needs fewer nodes (docs/24_PERFORMANCE.md).
    const plan = planMarkers(markers(MARKER_CLUSTER_THRESHOLD + 1), bergamo);
    expect(plan.isClustered).toBe(true);
  });

  it('never draws more pins than it was given', () => {
    const plan = planMarkers(markers(25), bergamo);
    expect(plan.pins.length).toBeLessThanOrEqual(25);
  });

  it('accounts for every stop across pins and undrawables', () => {
    // A stop that appears in neither is a stop the user has lost, and they
    // would find out by counting pins.
    const plan = planMarkers(markers(25), bergamo);
    const covered = plan.pins.flatMap((p) => (p.kind === 'cluster' ? p.stopIds : [p.stopId]));
    expect(new Set([...covered, ...plan.undrawableStopIds]).size).toBe(25);
  });
});

describe('a stop with no coordinate', () => {
  it('is reported rather than silently dropped', () => {
    // Coordinates expire at 30 days by design (ADR-0007). The stop still
    // exists; it just cannot be drawn, and the screen must be able to say which.
    const input = [marker(0), marker(1, { coordinate: null }), marker(2)];
    const plan = planMarkers(input, bergamo);

    expect(plan.undrawableStopIds).toEqual(['stop-1']);
    expect(plan.pins).toHaveLength(2);
  });

  it('does not push the count over the threshold on its own', () => {
    // An undrawable stop costs no frame time, so it must not force clustering.
    const input = [...markers(MARKER_CLUSTER_THRESHOLD), marker(99, { coordinate: null })];
    expect(planMarkers(input, bergamo).isClustered).toBe(false);
  });
});

describe('what a cluster carries', () => {
  it('keeps the ids of everything inside it', () => {
    const plan = planMarkers(markers(30), bergamo);
    const clusters = plan.pins.filter((p) => p.kind === 'cluster');

    expect(clusters.length).toBeGreaterThan(0);
    for (const c of clusters) {
      if (c.kind !== 'cluster') continue;
      expect(c.stopIds).toHaveLength(c.count);
    }
  });

  it('raises an unreachable stop to the cluster', () => {
    // A problem must be visible at the zoom level the user is at, not only
    // after they zoom in looking for it.
    const input = Array.from({ length: 30 }, (_, i) =>
      marker(i, i === 5 ? { state: 'unreachable' } : {}),
    );
    const plan = planMarkers(input, bergamo);

    const containing = plan.pins.find((p) => p.kind === 'cluster' && p.stopIds.includes('stop-5'));
    if (containing?.kind === 'cluster') {
      expect(containing.hasUnreachable).toBe(true);
    } else {
      // It stayed a single marker, which is also correct — then the state is
      // on the marker itself.
      expect(containing).toBeUndefined();
    }
  });

  it('leaves a lone marker in its cell as a marker', () => {
    // A "1" badge costs the ordinal and gains nothing.
    const spread = Array.from({ length: 20 }, (_, i) => ({
      ...marker(i),
      coordinate: {
        latitude: 45.65 + (i % GRID_DIVISIONS) * 0.016,
        longitude: 9.6 + Math.floor(i / GRID_DIVISIONS) * 0.024,
      },
    }));
    const plan = planMarkers(spread, bergamo);

    for (const pin of plan.pins) {
      if (pin.kind === 'cluster') expect(pin.count).toBeGreaterThan(1);
    }
  });
});

describe('the selected stop', () => {
  it('is never folded into a cluster', () => {
    // The user selected it. A map that answers by hiding it has not answered
    // (docs/14_GOOGLE_MAPS_INTEGRATION.md §7).
    const plan = planMarkers(markers(30), bergamo, { selectedStopId: 'stop-7' });

    const asMarker = plan.pins.find((p) => p.kind === 'marker' && p.stopId === 'stop-7');
    expect(asMarker).toBeDefined();
    for (const pin of plan.pins) {
      if (pin.kind === 'cluster') expect(pin.stopIds).not.toContain('stop-7');
    }
  });

  it('is drawn last, which is its raised z-index', () => {
    // The SDK draws in array order, so a selected pin under a neighbouring
    // cluster would be the one thing the user cannot see.
    const plan = planMarkers(markers(30), bergamo, { selectedStopId: 'stop-7' });
    const last = plan.pins[plan.pins.length - 1];

    expect(last?.kind === 'marker' && last.stopId === 'stop-7').toBe(true);
  });

  it('still accounts for every stop', () => {
    const plan = planMarkers(markers(30), bergamo, { selectedStopId: 'stop-7' });
    const covered = plan.pins.flatMap((p) => (p.kind === 'cluster' ? p.stopIds : [p.stopId]));

    expect(covered).toHaveLength(30);
    expect(new Set(covered).size).toBe(30);
  });

  it('changes nothing below the threshold, where nothing is clustered anyway', () => {
    const plan = planMarkers(markers(10), bergamo, { selectedStopId: 'stop-3' });
    expect(plan.isClustered).toBe(false);
    expect(plan.pins).toHaveLength(10);
  });
});

describe('stability across camera moves', () => {
  it('returns pins in a deterministic order', () => {
    // React keys stay matched and the map does not re-mount pins that did not
    // change — a jumping pin reads as the map being broken.
    const first = planMarkers(markers(30), bergamo);
    const second = planMarkers(markers(30), bergamo);

    expect(first.pins.map((p) => (p.kind === 'cluster' ? p.id : p.stopId))).toEqual(
      second.pins.map((p) => (p.kind === 'cluster' ? p.id : p.stopId)),
    );
  });

  it('survives a viewport with no span, which is the first frame', () => {
    // Before the camera settles the span is zero, and dividing by it would
    // produce NaN coordinates — pins drawn nowhere, with no error.
    const degenerate: Viewport = {
      southWest: { latitude: 45.7, longitude: 9.7 },
      northEast: { latitude: 45.7, longitude: 9.7 },
    };
    const plan = planMarkers(markers(30), degenerate);

    expect(plan.pins).toHaveLength(1);
    for (const pin of plan.pins) {
      expect(Number.isFinite(pin.coordinate.latitude)).toBe(true);
      expect(Number.isFinite(pin.coordinate.longitude)).toBe(true);
    }
  });
});

describe('the bounds that fit a route', () => {
  it('leaves room for the sheet at the south edge', () => {
    // A naive fit centres the route behind the sheet and the user sees the top
    // third of their own day.
    const coords = [
      { latitude: 45.68, longitude: 9.65 },
      { latitude: 45.72, longitude: 9.7 },
    ];
    const bounds = boundsFor(coords, 0.4);
    if (bounds === null) throw new Error('expected bounds');

    const northPadding = bounds.northEast.latitude - 45.72;
    const southPadding = 45.68 - bounds.southWest.latitude;
    expect(southPadding).toBeGreaterThan(northPadding);
  });

  it('gives a single stop a viewport rather than a point', () => {
    // Zero span is not a viewport; it fills the screen with one building.
    const bounds = boundsFor([{ latitude: 45.7, longitude: 9.7 }]);
    if (bounds === null) throw new Error('expected bounds');

    expect(bounds.northEast.latitude).toBeGreaterThan(bounds.southWest.latitude);
    expect(bounds.northEast.longitude).toBeGreaterThan(bounds.southWest.longitude);
  });

  it('has nothing to fit when there are no stops', () => {
    expect(boundsFor([])).toBeNull();
  });
});

describe('the camera region conversion', () => {
  it('treats a delta as the whole span, not half of it', () => {
    // Halving this is the mistake that shrinks every viewport and clusters the
    // whole route into one pin.
    const viewport = regionToViewport({
      latitude: 45.7,
      longitude: 9.7,
      latitudeDelta: 0.1,
      longitudeDelta: 0.2,
    });

    expect(viewport.northEast.latitude).toBeCloseTo(45.75, 6);
    expect(viewport.southWest.latitude).toBeCloseTo(45.65, 6);
    expect(viewport.northEast.longitude).toBeCloseTo(9.8, 6);
    expect(viewport.southWest.longitude).toBeCloseTo(9.6, 6);
  });

  it('round-trips', () => {
    const region = viewportToRegion(bergamo);
    const back = regionToViewport(region);

    expect(back.northEast.latitude).toBeCloseTo(bergamo.northEast.latitude, 6);
    expect(back.southWest.longitude).toBeCloseTo(bergamo.southWest.longitude, 6);
  });
});

describe('label overlap', () => {
  it('reports two stops in the same building as overlapping', () => {
    const a = { latitude: 45.7, longitude: 9.7 };
    const b = { latitude: 45.70005, longitude: 9.7 };
    expect(overlapsAtScale(a, b, 2)).toBe(true);
  });

  it('reports two stops across town as not overlapping', () => {
    const a = { latitude: 45.7, longitude: 9.7 };
    const b = { latitude: 45.72, longitude: 9.72 };
    expect(overlapsAtScale(a, b, 2)).toBe(false);
  });
});
