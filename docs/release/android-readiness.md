# Android release-readiness checklist

## CI artifact

- android-preview workflow is green.
- Download twolmaps-android-preview.
- Install the debug APK on a physical Android device.
- Confirm package id is com.doppiaelle.twolmaps.

## Device smoke test

- HERE map renders with Mint/Clay light and dark themes.
- Tilted camera and 3D buildings are checked where the Explore edition supports them.
- GPS permission is requested and a real position updates the marker.
- A 2, 5, 15 and 25-stop itinerary can be planned.
- Turn-by-turn navigation advances through sections and stops.
- Voice instructions play, and mute/unavailable-engine states are safe.
- Google OAuth deep link returns to the app.
- External navigation opens only the current stop and returns without losing state.
- History save/reopen refreshes expired coordinates and reoptimizes.

## Security checks

- HERE SDK client credentials are injected only at build/runtime configuration.
- HERE REST and ORS provider keys are not embedded in the APK.
- No Google Maps/geocoding key is present.
- Supabase RLS and authenticated Edge Function calls are verified with a test user.

## iOS

The iOS build remains intentionally excluded from this release PR until Apple signing certificates and provisioning are available.
