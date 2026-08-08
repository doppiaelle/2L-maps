import { haversineMeters, tourLengthMeters, type LatLng } from './haversine';

const MILAN_DUOMO: LatLng = { latitude: 45.4642, longitude: 9.19 };
const MILAN_CENTRALE: LatLng = { latitude: 45.4863, longitude: 9.204 };
const ROME_COLOSSEUM: LatLng = { latitude: 41.8902, longitude: 12.4922 };

describe('haversineMeters', () => {
  it('is zero for a point against itself', () => {
    // The naive law-of-cosines form returns NaN here through rounding, so this
    // is a real guard rather than a triviality.
    expect(haversineMeters(MILAN_DUOMO, MILAN_DUOMO)).toBe(0);
  });

  it('matches a known short distance within 1%', () => {
    // Duomo to Centrale: Δlat 0.0221° ≈ 2456 m, Δlng 0.0140° at latitude 45.5
    // ≈ 1092 m, so the great-circle distance is about 2689 m.
    const meters = haversineMeters(MILAN_DUOMO, MILAN_CENTRALE);
    expect(meters).toBeGreaterThan(2_660);
    expect(meters).toBeLessThan(2_720);
  });

  it('matches a known long distance within 1%', () => {
    // Milan to Rome is about 477 km great-circle.
    const km = haversineMeters(MILAN_DUOMO, ROME_COLOSSEUM) / 1000;
    expect(km).toBeGreaterThan(472);
    expect(km).toBeLessThan(482);
  });

  it('is symmetric', () => {
    expect(haversineMeters(MILAN_DUOMO, ROME_COLOSSEUM)).toBeCloseTo(
      haversineMeters(ROME_COLOSSEUM, MILAN_DUOMO),
      6,
    );
  });

  it('handles a meridian crossing without sign error', () => {
    const west: LatLng = { latitude: 51.5, longitude: -0.1 };
    const east: LatLng = { latitude: 51.5, longitude: 0.1 };
    expect(haversineMeters(west, east)).toBeGreaterThan(13_000);
    expect(haversineMeters(west, east)).toBeLessThan(14_500);
  });

  it('handles the antimeridian without taking the long way round', () => {
    const west: LatLng = { latitude: 0, longitude: 179.9 };
    const east: LatLng = { latitude: 0, longitude: -179.9 };
    // 0.2° at the equator is roughly 22 km. A naive longitude subtraction would
    // give 359.8° and a distance most of the way around the planet.
    expect(haversineMeters(west, east)).toBeLessThan(25_000);
  });
});

describe('tourLengthMeters', () => {
  it('is zero for fewer than two points', () => {
    expect(tourLengthMeters([], false)).toBe(0);
    expect(tourLengthMeters([MILAN_DUOMO], false)).toBe(0);
    expect(tourLengthMeters([MILAN_DUOMO], true)).toBe(0);
  });

  it('sums the legs of an open tour', () => {
    const expected =
      haversineMeters(MILAN_DUOMO, MILAN_CENTRALE) +
      haversineMeters(MILAN_CENTRALE, ROME_COLOSSEUM);
    expect(tourLengthMeters([MILAN_DUOMO, MILAN_CENTRALE, ROME_COLOSSEUM], false)).toBeCloseTo(
      expected,
      6,
    );
  });

  it('adds the return leg when closed', () => {
    const points = [MILAN_DUOMO, MILAN_CENTRALE, ROME_COLOSSEUM];
    const open = tourLengthMeters(points, false);
    const closed = tourLengthMeters(points, true);
    expect(closed - open).toBeCloseTo(haversineMeters(ROME_COLOSSEUM, MILAN_DUOMO), 6);
  });

  it('a closed tour is the same length whichever direction it is walked', () => {
    const points = [MILAN_DUOMO, MILAN_CENTRALE, ROME_COLOSSEUM];
    const reversed = [...points].reverse();
    expect(tourLengthMeters(points, true)).toBeCloseTo(tourLengthMeters(reversed, true), 6);
  });
});
