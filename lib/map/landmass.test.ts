import { landmassFor, LANDMASS_TOLERANCE_DEGREES, visibleBounds } from './landmass';
import { fitProjection, metresPerPoint } from './projection';
import { SCENERY_MAX_SPAN_METRES } from './scenery';

import type { LatLng } from '@/lib/geo/haversine';

/**
 * The ground under a route that crosses a country.
 *
 * Two properties carry this file. **The two backgrounds must never both draw** —
 * a coastline under invented streets would be a map claiming to be two different
 * amounts of detail at once. And **most of the world must be rejected without
 * being projected**: the bundled asset is four and a half thousand points, and
 * projecting all of them to discover that Australia is off screen would be the
 * most expensive thing this canvas does.
 *
 * What it does *not* assert is that the shapes look like anywhere. They are
 * Natural Earth's coastlines at 1:110m, and testing their accuracy would be
 * testing the dataset.
 */

const size = { width: 390, height: 640 };

/** Rome to Milan and back down to Bari: the route the product owner reported on,
 *  and about 900 km across. */
const acrossItaly: readonly LatLng[] = [
  { latitude: 41.9, longitude: 12.5 },
  { latitude: 45.46, longitude: 9.19 },
  { latitude: 41.12, longitude: 16.87 },
];

/** A delivery round: a few kilometres of Turin. */
const acrossTown: readonly LatLng[] = [
  { latitude: 45.07, longitude: 7.68 },
  { latitude: 45.09, longitude: 7.71 },
];

const projectionFor = (coordinates: readonly LatLng[]) => fitProjection(coordinates, size, 20);

const shapesFor = (coordinates: readonly LatLng[]) => {
  const projection = projectionFor(coordinates);
  return landmassFor({
    projection,
    size,
    metresPerPoint: metresPerPoint(projection.scale),
  });
};

describe('the two backgrounds take turns', () => {
  it('draws the coast where the invented town would be a lie', () => {
    // Nine hundred kilometres across. A seventy-eight-point "block" is a hundred
    // kilometres there, which is what the empty background with scattered
    // squares actually was.
    expect(shapesFor(acrossItaly).length).toBeGreaterThan(0);
  });

  it('draws nothing on a round the town belongs to', () => {
    // Streets below sixty kilometres, coast above it, never both.
    expect(shapesFor(acrossTown)).toEqual([]);
  });

  it('hands over at exactly the scenery’s own ceiling', () => {
    const projection = projectionFor(acrossItaly);
    const diagonal = Math.hypot(size.width, size.height);

    const justInside = landmassFor({
      projection,
      size,
      metresPerPoint: (SCENERY_MAX_SPAN_METRES - 1) / diagonal,
    });
    const justOutside = landmassFor({
      projection,
      size,
      metresPerPoint: (SCENERY_MAX_SPAN_METRES + 1) / diagonal,
    });

    expect(justInside).toEqual([]);
    expect(justOutside.length).toBeGreaterThan(0);
  });
});

describe('what is on screen', () => {
  it('asks the projection rather than the route', () => {
    // The canvas is always larger than the stops it fits — the projection keeps
    // a margin so no pin hangs off the edge — so the visible box is wider than
    // the box the stops describe.
    const view = visibleBounds(projectionFor(acrossItaly), size);

    expect(view.minLatitude).toBeLessThan(41.12);
    expect(view.maxLatitude).toBeGreaterThan(45.46);
    expect(view.minLongitude).toBeLessThan(9.19);
    expect(view.maxLongitude).toBeGreaterThan(16.87);
  });

  it('rejects a landmass that is nowhere near, without projecting it', () => {
    const projection = projectionFor(acrossItaly);
    const projected: unknown[] = [];

    landmassFor({
      projection: {
        ...projection,
        project: (coordinate) => {
          projected.push(coordinate);
          return projection.project(coordinate);
        },
      },
      size,
      metresPerPoint: metresPerPoint(projection.scale),
      rings: [
        // Off the coast of Australia, and about as far from Italy as a ring gets.
        [
          [150, -30],
          [152, -30],
          [152, -28],
          [150, -30],
        ],
      ],
    });

    expect(projected).toHaveLength(0);
  });

  it('keeps a landmass whose edge only touches the canvas', () => {
    // A coast exactly on the canvas edge is a coast on screen. Rejecting it
    // would leave a sliver of sea where the shore should be.
    const projection = projectionFor(acrossItaly);
    const view = visibleBounds(projection, size);

    const shapes = landmassFor({
      projection,
      size,
      metresPerPoint: metresPerPoint(projection.scale),
      rings: [
        [
          [view.minLongitude - 4, view.minLatitude - 4],
          [view.minLongitude, view.minLatitude],
          [view.minLongitude - 4, view.minLatitude],
          [view.minLongitude - 4, view.minLatitude - 4],
        ],
      ],
    });

    expect(shapes).toHaveLength(1);
  });
});

describe('the shapes it produces', () => {
  it('closes every ring, so land is filled rather than outlined', () => {
    for (const shape of shapesFor(acrossItaly)) {
      expect(shape.d.endsWith(' Z')).toBe(true);
    }
  });

  it('gives each one a stable id, so React keys on the ring and not the index', () => {
    const ids = shapesFor(acrossItaly).map((shape) => shape.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drops a ring too small to enclose anything', () => {
    // Simplification can reduce a small island below three corners, and an
    // unclosable ring renders as a stray line across the sea.
    const projection = projectionFor(acrossItaly);
    const shapes = landmassFor({
      projection,
      size,
      metresPerPoint: metresPerPoint(projection.scale),
      rings: [
        [[12, 42]],
        [
          [12, 42],
          [13, 42],
        ],
      ],
    });

    expect(shapes).toEqual([]);
  });

  it('draws nothing before the canvas has been measured', () => {
    expect(
      landmassFor({
        projection: projectionFor(acrossItaly),
        size: { width: 0, height: 0 },
        metresPerPoint: 5_000,
      }),
    ).toEqual([]);
  });
});

describe('the asset itself', () => {
  it('was built at the tolerance the script records', () => {
    // If this changes, the file was regenerated at a different resolution and
    // the bundle size claim in ADR-0028 needs re-measuring.
    expect(LANDMASS_TOLERANCE_DEGREES).toBe(0.05);
  });
});
