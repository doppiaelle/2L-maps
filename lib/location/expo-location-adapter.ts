import * as Location from 'expo-location';

import type { DeviceLocation, LocationPermission, LocationPort } from './current-location';

/**
 * The one module that imports `expo-location`.
 *
 * Same arrangement as `components/map/AppMap.tsx` and `react-native-maps`, and
 * for the same reason (`CLAUDE.md` §0 rule 2): a native module is the part of
 * the tree an Expo SDK upgrade breaks, and confining it to one file is what
 * makes risk C6 a one-file problem rather than a search across the app. Every
 * rule about accuracy, staleness and permission states lives next door in
 * `current-location.ts`, where it is tested without a device.
 *
 * **Foreground only.** Background location is the most scrutinised permission in
 * App Review (risk C7, [`docs/18_PERMISSIONS.md`](../../docs/18_PERMISSIONS.md))
 * and the product does not need it: the map follows the driver while they are
 * looking at it, and the handoff hands navigation to an app that has its own
 * permission. `requestForegroundPermissionsAsync` is the only request made here,
 * and adding the background one would be a store-review decision rather than a
 * code change.
 */
export function createLocationPort(): LocationPort {
  return {
    check: async () => toPermission(await Location.getForegroundPermissionsAsync()),

    request: async () => toPermission(await Location.requestForegroundPermissionsAsync()),

    watch: (onChange) => {
      let cancelled = false;
      let stop: (() => void) | null = null;

      void Location.watchPositionAsync(
        {
          // Balanced rather than best: metre-level precision costs battery the
          // product has no use for. The origin needs the right side of the
          // street, and `LOCATION_ACCURACY_LIMIT_METERS` is what enforces that.
          accuracy: Location.Accuracy.Balanced,
          // Updates on movement, not on a timer. A parked van produces no
          // callbacks at all, which is the behaviour a phone in a cradle needs.
          distanceInterval: 20,
          timeInterval: 5_000,
        },
        (reading) => {
          onChange(toDeviceLocation(reading));
        },
      ).then(
        (subscription) => {
          // Unsubscribed before the promise settled — the screen was closed
          // while the receiver was starting. Without this the subscription
          // outlives the component and keeps the GPS awake.
          if (cancelled) {
            subscription.remove();
            return;
          }
          stop = () => {
            subscription.remove();
          };
        },
        () => {
          // A refused or unavailable receiver resolves as no updates rather than
          // as a crash. The permission state is the thing that explains it to
          // the user, and it is read separately.
        },
      );

      return () => {
        cancelled = true;
        stop?.();
      };
    },
  };
}

function toPermission(response: {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}): LocationPermission {
  if (response.granted) return 'granted';
  // "Can ask again" is the OS saying the dialog has not been answered, which is
  // a different state from a refusal and gets a different sentence on screen.
  return response.canAskAgain ? 'undetermined' : 'denied';
}

function toDeviceLocation(reading: Location.LocationObject): DeviceLocation {
  return {
    coordinate: { latitude: reading.coords.latitude, longitude: reading.coords.longitude },
    // The SDK reports -1 for "no course", which would draw the marker pointing
    // due north on a stationary phone. Null is the honest value and the marker
    // renders as a disc for it.
    headingDegrees:
      reading.coords.heading === null || reading.coords.heading < 0 ? null : reading.coords.heading,
    accuracyMeters: reading.coords.accuracy ?? null,
    at: reading.timestamp,
  };
}
