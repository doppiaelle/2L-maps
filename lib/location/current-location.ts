import type { LatLng } from '@/lib/geo/haversine';

/**
 * Where the device is, as a decision rather than as a reading.
 *
 * The permission timeline in [`docs/18_PERMISSIONS.md`](../../docs/18_PERMISSIONS.md)
 * §4 has always specified this — "first stop added → location, when in use → to
 * set your starting point. Denied → origin becomes a searched address. Nothing
 * is blocked." — and nothing implemented it. The draft route carried
 * `originIsCurrentLocation` from the first commit with no way to ever set it,
 * and the map opened on a fixed rectangle of northern Italy regardless of where
 * the phone was.
 *
 * Two rules live here, and both are the kind that go wrong silently if they live
 * in a component instead:
 *
 * **A fix is not a location.** A GPS reading arrives before the receiver has
 * settled, and the first one is routinely a kilometre or more out. Starting a
 * route from it sends the driver the wrong way out of their own street.
 * `isUsable` is what keeps that reading out of the origin.
 *
 * **A location goes stale.** The device is in a moving van. A fix from four
 * minutes ago is a place the driver has left, and using it as the origin is
 * worse than asking them to pick an address — it is confidently wrong.
 */

/** What the operating system has been asked, and what it answered. */
export type LocationPermission = 'undetermined' | 'granted' | 'denied';

export interface DeviceLocation {
  readonly coordinate: LatLng;
  /**
   * Degrees clockwise from north, or null when the device will not say.
   *
   * Null is common and not an error: a stationary phone has no course, and the
   * marker draws as a plain disc rather than a triangle pointing at a direction
   * nobody is travelling in.
   */
  readonly headingDegrees: number | null;
  /** Radius of uncertainty in metres, or null when unreported. */
  readonly accuracyMeters: number | null;
  /** Epoch milliseconds, from the device's clock. */
  readonly at: number;
}

/**
 * The port. Implemented once, against `expo-location`, in
 * `lib/location/expo-location-adapter.ts`.
 *
 * It speaks the product's vocabulary — permission, a location, a subscription —
 * and never the SDK's accuracy enumerations or task names (`CLAUDE.md` §1). The
 * seam is what lets every rule above be tested with no device and no permission
 * dialog.
 */
export interface LocationPort {
  /** What the OS says right now, without prompting. */
  check: () => Promise<LocationPermission>;
  /** Prompts if it has not been asked before. Resolves to the answer either way. */
  request: () => Promise<LocationPermission>;
  /**
   * Follows the device until the returned function is called.
   *
   * A subscription rather than repeated reads: polling a GPS from a timer is the
   * most reliable way to flatten a battery, and the platform already coalesces
   * updates across every subscriber on the device.
   */
  watch: (onChange: (location: DeviceLocation) => void) => () => void;
}

/**
 * Beyond this, a fix is a guess.
 *
 * 200 m is roughly a city block. A reading that vague can still centre a map —
 * the user sees their neighbourhood and that is the point — but it must not
 * become the origin of a route, because the first turn would be computed from
 * the wrong side of the block.
 */
export const LOCATION_ACCURACY_LIMIT_METERS = 200;

/**
 * Beyond this, a fix describes somewhere the van has left.
 *
 * Two minutes at 50 km/h is about 1.7 km. The number is deliberately generous:
 * the cost of rejecting a good fix is a prompt the user has already answered,
 * and the cost of accepting a stale one is a route that starts in the wrong
 * place without saying so.
 */
export const LOCATION_STALE_AFTER_MS = 120_000;

/** Whether this reading may be used as a route origin. */
export function isUsable(location: DeviceLocation | null, now: Date): boolean {
  if (location === null) return false;
  if (
    location.accuracyMeters !== null &&
    location.accuracyMeters > LOCATION_ACCURACY_LIMIT_METERS
  ) {
    return false;
  }
  const age = now.getTime() - location.at;
  // A fix stamped in the future is a clock disagreement, not a fresh reading.
  // Treated as usable rather than rejected: the coordinate is still the last
  // thing the receiver saw, and refusing it would strand a user whose phone has
  // a skewed clock with no way to start from where they are.
  if (age < 0) return true;
  return age <= LOCATION_STALE_AFTER_MS;
}

/**
 * What the interface should say about location, in one value.
 *
 * Every state is designed rather than left to fall out of the data
 * (`CLAUDE.md` §7 rule 5), which for this feature means naming the difference
 * between "not asked yet", "asked and refused", and "granted but the receiver
 * has not answered yet". Those three look identical from a null coordinate and
 * need three different sentences.
 */
export type LocationState =
  /** Never asked. The control is offered and the prompt comes on first use. */
  | { readonly kind: 'available' }
  /** Asked and refused. The control stays, and explains itself. */
  | { readonly kind: 'denied' }
  /** Granted, nothing usable yet — the receiver is still settling. */
  | { readonly kind: 'locating' }
  | { readonly kind: 'ready'; readonly location: DeviceLocation };

export function locationStateOf(inputs: {
  readonly permission: LocationPermission;
  readonly location: DeviceLocation | null;
  readonly now: Date;
}): LocationState {
  if (inputs.permission === 'denied') return { kind: 'denied' };
  if (inputs.permission === 'undetermined') return { kind: 'available' };
  if (!isUsable(inputs.location, inputs.now) || inputs.location === null) {
    return { kind: 'locating' };
  }
  return { kind: 'ready', location: inputs.location };
}

/**
 * How wide a view of the surroundings to open on, in degrees of latitude.
 *
 * About 1.5 km across: near enough to recognise the street, wide enough to show
 * which way the ring road runs. The map opens here when there is no route to
 * fit, which is what "the neighbourhood, before there is an itinerary" means in
 * camera terms.
 */
export const SURROUNDINGS_SPAN_DEGREES = 0.014;
