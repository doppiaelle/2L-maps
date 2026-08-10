import { fitProjection, pathThrough } from './projection';
import type { LatLng } from '@/lib/geo/haversine';

/**
 * The maths that decides whether a drawn route looks like the day it describes.
 *
 * Every failure here is silent and plausible. An unscaled longitude stretches
 * every route sideways by half and still draws a route; a forgotten inversion
 * puts north at the bottom and, on a symmetric route, looks fine. Neither throws
 * and neither is obvious in a screenshot.
 */

const bergamo: LatLng = { latitude: 45.6983, longitude: 9.6773 };
const size = { width: 400, height: 400 };

describe('fitting a route inside the canvas', () => {
  const square: readonly LatLng[] = [
    { latitude: 45.0, longitude: 9.0 },
    { latitude: 46.0, longitude: 9.0 },
    { latitude: 46.0, longitude: 10.0 },
    { latitude: 45.0, longitude: 10.0 },
  ];

  it('keeps every point on the canvas', () => {
    const projection = fitProjection(square, size, 20);
    for (const coordinate of square) {
      const point = projection.project(coordinate);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(size.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(size.height);
    }
  });

  it('keeps every point inside the padding, where the markers live', () => {
    // A stop drawn exactly on the edge of its own bounding box has half its pin
    // off the canvas — and the first and last stop are always on that edge.
    const padding = 40;
    const projection = fitProjection(square, size, padding);
    for (const coordinate of square) {
      const point = projection.project(coordinate);
      expect(point.x).toBeGreaterThanOrEqual(padding - 0.001);
      expect(point.x).toBeLessThanOrEqual(size.width - padding + 0.001);
    }
  });

  it('puts north at the top', () => {
    // Latitude grows northward, a canvas grows downward. Forgetting this draws
    // every route upside down and looks entirely fine on a symmetric one.
    const projection = fitProjection(square, size, 20);
    const north = projection.project({ latitude: 46.0, longitude: 9.5 });
    const south = projection.project({ latitude: 45.0, longitude: 9.5 });
    expect(north.y).toBeLessThan(south.y);
  });

  it('puts east to the right', () => {
    const projection = fitProjection(square, size, 20);
    const west = projection.project({ latitude: 45.5, longitude: 9.0 });
    const east = projection.project({ latitude: 45.5, longitude: 10.0 });
    expect(east.x).toBeGreaterThan(west.x);
  });

  it('scales longitude by the cosine of the latitude', () => {
    // One degree each way at 45° is about 111 km north-south and 79 km
    // east-west. Drawn with the same scale on both axes, the east-west edge must
    // come out roughly 70% of the north-south one — not equal, which is what
    // plotting raw degrees would give.
    const projection = fitProjection(square, size, 0);
    const width =
      projection.project({ latitude: 45, longitude: 10 }).x -
      projection.project({ latitude: 45, longitude: 9 }).x;
    const height =
      projection.project({ latitude: 45, longitude: 9 }).y -
      projection.project({ latitude: 46, longitude: 9 }).y;

    expect(width / height).toBeCloseTo(Math.cos((45.5 * Math.PI) / 180), 2);
  });

  it('uses one scale for both axes, so the route keeps its shape', () => {
    // Fitting each axis independently fills the canvas and destroys the drawing:
    // a route running mostly north would be squashed sideways until it looked
    // like a route running in every direction.
    const tall: readonly LatLng[] = [
      { latitude: 41.9, longitude: 12.5 },
      { latitude: 45.5, longitude: 12.5 },
    ];
    const projection = fitProjection(tall, size, 20);
    const top = projection.project(tall[1] as LatLng);
    const bottom = projection.project(tall[0] as LatLng);

    // Nothing spans east-west, so both must land on the same column.
    expect(top.x).toBeCloseTo(bottom.x, 6);
  });

  it('centres what it draws rather than pinning it to a corner', () => {
    const tall: readonly LatLng[] = [
      { latitude: 41.9, longitude: 12.5 },
      { latitude: 45.5, longitude: 12.5 },
    ];
    const projection = fitProjection(tall, size, 0);
    expect(projection.project(tall[0] as LatLng).x).toBeCloseTo(size.width / 2, 6);
  });
});

describe('the cases with no extent', () => {
  it('places a single stop in the middle', () => {
    const projection = fitProjection([bergamo], size, 20);
    const point = projection.project(bergamo);
    expect(point.x).toBeCloseTo(size.width / 2, 6);
    expect(point.y).toBeCloseTo(size.height / 2, 6);
  });

  it('places several stops at one address in the middle', () => {
    // A morning delivery and an afternoon collection at the same door is a real
    // route, and a zero span would otherwise make the scale infinite.
    const projection = fitProjection([bergamo, bergamo, bergamo], size, 20);
    const point = projection.project(bergamo);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(point.x).toBeCloseTo(size.width / 2, 6);
  });

  it('survives a route with no stops at all', () => {
    const projection = fitProjection([], size, 20);
    expect(projection.project(bergamo)).toEqual({ x: 200, y: 200 });
  });

  it('survives a canvas smaller than its own padding', () => {
    // A first render before layout has measured, which is one frame of every
    // mount.
    const projection = fitProjection([bergamo], { width: 0, height: 0 }, 40);
    expect(Number.isFinite(projection.project(bergamo).x)).toBe(true);
  });

  it('survives a route that spans a pole', () => {
    // Nobody delivers there. A divide-by-zero does not care.
    const projection = fitProjection(
      [
        { latitude: 89.9, longitude: 0 },
        { latitude: 89.9, longitude: 180 },
      ],
      size,
      20,
    );
    expect(Number.isFinite(projection.project({ latitude: 89.9, longitude: 90 }).x)).toBe(true);
  });
});

describe('the path string', () => {
  it('moves to the first point and lines to the rest', () => {
    expect(
      pathThrough([
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ]),
    ).toBe('M0 0 L10 20 L30 40');
  });

  it('is empty for no points, rather than a path that draws nothing visible', () => {
    expect(pathThrough([])).toBe('');
  });

  it('rounds, because a hundredth of a point is below anything a screen shows', () => {
    // A 500-point path at full float precision carries thousands of characters
    // of meaningless digits.
    expect(pathThrough([{ x: 1.23456789, y: 9.87654321 }])).toBe('M1.23 9.88');
  });
});
