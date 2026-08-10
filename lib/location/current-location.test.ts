import {
  LOCATION_ACCURACY_LIMIT_METERS,
  LOCATION_STALE_AFTER_MS,
  SURROUNDINGS_SPAN_DEGREES,
  isUsable,
  locationStateOf,
} from './current-location';
import type { DeviceLocation } from './current-location';

/**
 * The two rules that keep a bad fix out of a route.
 *
 * Both fail silently if they are wrong: an inaccurate fix and a stale one both
 * produce a route that looks completely normal and starts in the wrong street.
 * There is no error state to notice, which is exactly why these are tested
 * rather than eyeballed on a device.
 */

const now = new Date('2026-08-10T09:00:00.000Z');

const fix = (overrides: Partial<DeviceLocation> = {}): DeviceLocation => ({
  coordinate: { latitude: 45.6983, longitude: 9.6773 },
  headingDegrees: null,
  accuracyMeters: 12,
  at: now.getTime(),
  ...overrides,
});

describe('whether a fix may be routed from', () => {
  it('accepts a fresh, accurate one', () => {
    expect(isUsable(fix(), now)).toBe(true);
  });

  it('refuses nothing at all', () => {
    expect(isUsable(null, now)).toBe(false);
  });

  it('refuses a fix vaguer than the limit', () => {
    // The first GPS reading after a cold start is routinely a kilometre out.
    // Starting a route from it sends the driver the wrong way out of their own
    // street, and nothing on screen would say so.
    expect(isUsable(fix({ accuracyMeters: LOCATION_ACCURACY_LIMIT_METERS + 1 }), now)).toBe(false);
  });

  it('accepts one exactly at the limit', () => {
    expect(isUsable(fix({ accuracyMeters: LOCATION_ACCURACY_LIMIT_METERS }), now)).toBe(true);
  });

  it('accepts one whose accuracy the device would not report', () => {
    // Unreported is not the same as bad, and refusing it would strand a device
    // that simply does not publish the figure.
    expect(isUsable(fix({ accuracyMeters: null }), now)).toBe(true);
  });

  it('refuses one older than the staleness window', () => {
    const stale = fix({ at: now.getTime() - LOCATION_STALE_AFTER_MS - 1 });
    expect(isUsable(stale, now)).toBe(false);
  });

  it('accepts one exactly at the window', () => {
    expect(isUsable(fix({ at: now.getTime() - LOCATION_STALE_AFTER_MS }), now)).toBe(true);
  });

  it('accepts one stamped in the future', () => {
    // A clock disagreement between the receiver and the OS, not a fresh reading
    // from tomorrow. The coordinate is still the last thing the receiver saw,
    // and refusing it would strand a user whose phone has a skewed clock.
    expect(isUsable(fix({ at: now.getTime() + 30_000 }), now)).toBe(true);
  });
});

describe('what the interface should say about location', () => {
  it('offers it before anything has been asked', () => {
    expect(locationStateOf({ permission: 'undetermined', location: null, now })).toEqual({
      kind: 'available',
    });
  });

  it('reports a refusal as its own state, not as an absent fix', () => {
    // The three no-coordinate states need three different sentences: not asked,
    // refused, and granted-but-still-settling all look identical from a null.
    expect(locationStateOf({ permission: 'denied', location: null, now })).toEqual({
      kind: 'denied',
    });
  });

  it('stays denied even if a stale fix is still in hand', () => {
    expect(locationStateOf({ permission: 'denied', location: fix(), now }).kind).toBe('denied');
  });

  it('reports locating while the receiver settles', () => {
    expect(locationStateOf({ permission: 'granted', location: null, now }).kind).toBe('locating');
  });

  it('reports locating rather than ready for an unusable fix', () => {
    const vague = fix({ accuracyMeters: 5_000 });
    expect(locationStateOf({ permission: 'granted', location: vague, now }).kind).toBe('locating');
  });

  it('carries the fix once there is one worth carrying', () => {
    const state = locationStateOf({ permission: 'granted', location: fix(), now });
    expect(state).toEqual({ kind: 'ready', location: fix() });
  });
});

describe('the surroundings the map opens on', () => {
  it('is a neighbourhood rather than a country', () => {
    // About 1.5 km across: near enough to recognise the street, wide enough to
    // show which way the ring road runs.
    expect(SURROUNDINGS_SPAN_DEGREES).toBeGreaterThan(0.005);
    expect(SURROUNDINGS_SPAN_DEGREES).toBeLessThan(0.05);
  });
});
