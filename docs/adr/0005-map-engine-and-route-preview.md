# ADR-0005 — Map engine: `react-native-maps` behind an `<AppMap>` facade

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Product owner, architecture
**Implements decisions:** D5

---

## Context

With in-app turn-by-turn removed ([ADR-0004](0004-external-navigation-handoff.md)), the app
still needs a map — and a good one. The in-app **route preview** is the product's moment of
truth: it is where the user sees their stops reordered and understands what they are paying
for. The map requirements are demanding: numbered custom markers, a selected-marker state,
marker clustering for dense lists, the route polyline, camera fitting, gestures, a light and
a dark map style, traffic layer, and a shareable snapshot.

Three candidate engines exist for React Native:

**`react-native-maps`** renders Google Maps on both platforms and has the mature ecosystem —
clustering libraries, custom marker components, polyline support, `takeSnapshot()`. Its
weakness is real and current: it has active breakage against recent Expo SDKs. Reported
failures include the config plugin breaking `npx expo prebuild` on SDK 56 by importing
internal `@expo/config-plugins` paths, and Google Maps on iOS failing under SDK 55 with the
recommended and latest versions alike.

**`expo-maps`** is first-party and tracks Expo SDK releases directly. It is **alpha, subject
to breaking changes**, and — decisively — it renders Google Maps on Android but **Apple Maps
on iOS by design**. Google Maps on iOS is explicitly not supported. Since the route polyline
is Google Maps Content, rendering it on Apple Maps would violate the Google Maps Platform
"No Use With Non-Google Maps" clause. This is a legal exclusion, not merely a preference.

**The Navigation SDK's own map component** is excluded by ADR-0004 and would in any case bind
the product's most important screen to a Beta pre-1.0 library.

## Decision

**`react-native-maps` is the map engine**, rendering Google Maps on both platforms.

**All map usage goes through an `<AppMap>` facade.** No screen imports `react-native-maps`
directly. The facade exposes only the capabilities the product actually needs — markers,
selection, clustering, polyline, camera, style, snapshot — expressed in the product's own
vocabulary (stops, routes, legs) rather than the library's.

**Expo SDK and `react-native-maps` versions are pinned together and upgraded as a pair**,
never independently. The compatible pairing is recorded in
[`25_DEPLOYMENT.md`](../25_DEPLOYMENT.md) and verified by a build on both platforms before any
Expo SDK upgrade is merged.

**The pairing is verified by running `expo prebuild`, not by reading peer ranges.** Risk C6 was
a config plugin breaking `prebuild` by importing internal `@expo/config-plugins` paths — a
failure dependency resolution cannot see, because the peer range was satisfied when it fired.
Android `prebuild` is pure Node, so the check runs in CI on every commit without a Mac
([`../36_IMPLEMENTATION_PLAN.md`](../36_IMPLEMENTATION_PLAN.md)).

### Verified pairing

Established 2026-08-07 by executing that gate, not by inspection:

| Package | Version | Note |
|---|---|---|
| `expo` | 57.0.11 | |
| `react-native` | **0.86.2** | See below — not the 0.86.0 the CLI recommends |
| `react` | 19.2.3 | `react-dom` must be pinned to match, or it resolves ahead of it |
| `react-native-maps` | **1.27.2** | The version Expo SDK 57 lists in `bundledNativeModules.json`, **not** the newer 1.29.0 on npm |
| `react-native-reanimated` | 4.5.1 | Its Babel plugin now lives in `react-native-worklets` |
| `react-native-worklets` | 0.10.1 | |

Two findings from that run are worth recording, because both contradict what the obvious source
says:

1. **`react-native-maps` 1.29.0 is published and its peer range accepts this React Native, but
   Expo SDK 57 verifies 1.27.2.** Taking the newer version means leaving the combination Expo
   tested, which is the exact class of drift this ADR exists to prevent.
2. **`expo prebuild` recommends `react-native@0.86.0`, and that recommendation cannot be
   followed.** `jest-expo@57` requires `@react-native/jest-preset@^0.86.2`, while
   `react-native@0.86.0` requires `@react-native/jest-preset@0.86.0`; the two are mutually
   exclusive. The coherent pair is 0.86.2, so the CLI warning is stale rather than actionable.

**The "paper" map style is delivered through Cloud-based Map Styling**, with one Map ID per
theme (light and dark). Map styles are configured in the Google Cloud console, outside the
codebase and outside the release cycle — which is both a convenience and a hazard, since a
console change alters the shipped app with no code review. Map IDs and their versioning are
specified in [`14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md), and a
fallback to the default style is mandatory if a Map ID fails to resolve.

## Consequences

**Positive.** Every map requirement in the brief is satisfiable with library support that
already exists and is documented. Google-derived polylines are drawn on a Google map, which
is what the platform terms require.

**Positive.** The facade makes the map mockable. Native maps are notoriously hostile to
end-to-end testing; a facade with a test implementation lets flows be exercised without a
real map surface. See [`22_TESTING.md`](../22_TESTING.md).

**Positive.** The facade is also the migration seam. If `react-native-maps` becomes
untenable, or if the OSM path in [ADR-0012](0012-long-term-osm-exit-path.md) is ever taken,
the change is confined to one adapter rather than distributed across every screen.

**Negative and active.** `react-native-maps` compatibility with new Expo SDKs is a live risk,
not a theoretical one. Expo SDK upgrades are therefore not routine maintenance for this
project; each is a change requiring a build verification on both platforms. Tracked as risk
C6 in [`35_RISK_REGISTER.md`](../35_RISK_REGISTER.md).

**Negative.** `react-native-maps` is a native module, so **Expo Go can never be used** for
this project. A development build is required from the first day, and CI must produce one.
See [`25_DEPLOYMENT.md`](../25_DEPLOYMENT.md).

**Negative.** Map styling lives in the Cloud console, outside version control. Mitigated by
recording Map IDs and their intended appearance in the documentation and treating a style
change as a reviewable event.

**Constraint inherited.** The shareable route snapshot contains Google imagery and therefore
carries attribution obligations. Specified in
[`14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md).

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| `expo-maps` | First-party, tracks Expo SDK releases, no config-plugin fragility | Alpha and explicitly breaking-change-prone. Renders Apple Maps on iOS by design, which makes drawing a Google-derived polyline on it a terms violation, not just an inconsistency. |
| Navigation SDK map component | One native SDK for map and guidance; resolves the Expo compatibility problem | Excluded by ADR-0004. Would bind the product's most important screen to a Beta pre-1.0 component whose clustering and custom-marker support is unproven. |
| MapLibre + OSM tiles | Total styling control; legal offline maps; no Google terms constraints | Cannot display Google-derived routes or geocodes — the "No Use With Non-Google Maps" clause applies per API. Adopting it means adopting the whole OSM stack, which is [ADR-0012](0012-long-term-osm-exit-path.md), not a map-layer swap. |
| Direct `react-native-maps` use without a facade | Less indirection; faster initial development | Leaves every screen coupled to a library with known upgrade fragility, makes end-to-end testing require a real map, and eliminates the migration seam. The facade costs little and buys all three. |

## References

- [`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md) — map styling, markers, layers
- [`docs/09_COMPONENT_LIBRARY.md`](../09_COMPONENT_LIBRARY.md) — `<AppMap>` facade contract
- [`docs/25_DEPLOYMENT.md`](../25_DEPLOYMENT.md) — version pinning and upgrade policy
- [ADR-0004](0004-external-navigation-handoff.md) — why the Navigation SDK is excluded
