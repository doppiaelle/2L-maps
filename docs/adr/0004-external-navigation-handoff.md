# ADR-0004 — External navigation handoff instead of in-app turn-by-turn

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Product owner, architecture
**Implements decisions:** D4

---

## Context

The brief asked for navigation to happen inside the app if Google's APIs permit it, and to
fall back to deep links into Google Maps or Apple Maps otherwise. Investigating both halves
of that sentence produced findings that reshape the feature.

### In-app navigation is possible, and was seriously considered

Turn-by-turn guidance requires the **Navigation SDK**, a separately-priced Google Maps
Platform product — the Routes and Directions APIs do not license real-time guidance. An
official React Native wrapper exists, `@googlemaps/react-native-navigation-sdk`, currently
Beta at approximately v0.16.x. Navigation SDK pricing was cut by more than half, to roughly
$2.00 CPM per navigation request with 1,000 free destinations per month, which puts a courier
doing 660 destinations a month at about $1.32. Affordable, and a genuine differentiator.

It was rejected for a reason discovered during evaluation: **the Navigation SDK and the Maps
SDK cannot coexist in one application.** On Android the Navigation SDK replaces the Maps SDK's
functionality outright; on iOS the `GoogleNavigation` pod already embeds `GoogleMaps`, so
linking both produces duplicate-symbol and version conflicts. Choosing the Navigation SDK
therefore **excludes `react-native-maps`** — and with it the mature ecosystem for marker
clustering, custom markers and polylines that the product's map requirements depend on. The
entire planning map would have to be rebuilt on a Beta pre-1.0 component.

### The deep-link fallback cannot carry a multi-stop route

The fallback is not a one-line escape hatch. Verified capabilities:

| Provider | Stops per handoff | Mechanism |
|---|---|---|
| Google Maps universal link | **~9 waypoints**, 2,048-character URL ceiling | `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=A\|B\|C` |
| Google Maps iOS URL scheme | 1 destination | `comgooglemaps://?daddr=…` |
| Waze | **1 destination** | `waze://?ll=…&navigate=yes` |
| Apple Maps | **1 destination** | `maps://?saddr=…&daddr=…&dirflg=d` |

No external application accepts a complete 25-stop route. Handoff is structurally
**leg-by-leg** or, for Google Maps only, chunked into groups of about nine.

## Decision

**The app performs no in-app turn-by-turn navigation.** It hands off to whichever navigation
application the user prefers among those installed — Google Maps, Waze, Apple Maps, or the
platform default.

**`HandoffStrategy` is a first-class architectural component**, not a URL builder. One
strategy per provider, selected from a versioned capability matrix:

- *Chunked* for the Google Maps universal link: batches of ~9 stops, respecting the URL
  length ceiling.
- *Leg-by-leg* for Waze, Apple Maps and the Google Maps iOS scheme: one destination at a
  time, with the app orchestrating progression.

**Installed-application detection is a build-time configuration requirement**, not a runtime
lookup: iOS requires every queried scheme to be declared in `LSApplicationQueriesSchemes` in
`Info.plist` (50-scheme ceiling); Android requires a `<queries>` element in the manifest to
satisfy Android 11+ package visibility.

**Stop progression is specified at three levels**, of which the first two ship in the MVP:

1. **Manual** — baseline, always available, requires no permissions. The user returns and
   marks the stop done.
2. **Live Activity (iOS 16.1+) / persistent notification (Android)** — the primary
   experience. "Stop 3 of 12 — tap for next", with no background location permission.
3. **Geofence with background location** — opt-in only. Automatic arrival detection,
   requiring `UIBackgroundModes: location` and an App Review justification.

## Consequences

**Positive.** The Navigation SDK / Maps SDK conflict disappears, and `react-native-maps`
returns with its mature clustering, custom marker and polyline support — precisely what the
map requirements need.

**Positive.** Navigation costs **nothing**. The guidance session is billed to Google by the
user's own navigation app, not to us. This is a material line in
[`31_COST_MODEL.md`](../31_COST_MODEL.md).

**Positive.** "Navigate with the app you already use" is a legitimate feature. Couriers have
strong preferences, often for Waze; forcing an inferior in-house navigator on them would be
a downgrade, not an upgrade.

**Positive.** The app avoids depending on a Beta pre-1.0 library for its most important
screen.

**Negative.** The user leaves the app at every stop. Ownership of the driving experience, and
of the telemetry that would come with it, is forfeited. This is the real cost of the decision.

**Negative.** Leg-by-leg orchestration — handoff, return, arrival, next stop, app killed
mid-route — is a genuine flow that must be designed and tested, not a fallback branch.
Specified in [`16_INTERNAL_NAVIGATION.md`](../16_INTERNAL_NAVIGATION.md).

**Negative.** Deep-link URL formats are not contractual. Providers can change them without
notice. Mitigated by a versioned capability matrix and a web universal-link fallback.

**Reopening condition.** This decision should be revisited when
`@googlemaps/react-native-navigation-sdk` reaches 1.0 **and** its map component demonstrably
supports clustering, custom markers and polylines at parity with `react-native-maps` — or if
in-app guidance becomes the basis of a higher-priced plan.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Navigation SDK from day one | Best experience; strong differentiator; monetizable; genuinely affordable at ~$2 CPM | Excludes `react-native-maps` entirely because the two SDKs cannot coexist. Rebuilds the whole planning map on a Beta pre-1.0 component, and materially increases binary size and build complexity. |
| Deep link in the MVP, Navigation SDK in phase 2 | Lowest technical risk now, upside later | Still ends at the same SDK conflict when phase 2 arrives, forcing a map rewrite at that point instead of now. Deferring the conflict does not resolve it. |
| Build navigation in-house on MapLibre + Valhalla | Full ownership; legal offline maps; near-zero marginal cost | Waze's moat is crowd-sourced traffic from over 100 million drivers, not software. Day-one probe coverage is zero, so ETAs would be free-flow estimates — systematically wrong in urban peak hours, undermining the product's core promise. 6–12 months of work in the commodity layer rather than the differentiator. Retained as a long-term target in [ADR-0012](0012-long-term-osm-exit-path.md). |
| Google Maps only, no provider choice | Simplest handoff; only provider supporting multiple waypoints | Ignores strong user preference for Waze in the target segment, and fails outright when Google Maps is not installed. |

## References

- [`docs/16_INTERNAL_NAVIGATION.md`](../16_INTERNAL_NAVIGATION.md) — handoff orchestration
- [`docs/18_PERMISSIONS.md`](../18_PERMISSIONS.md) — scheme declaration and location permissions
- [ADR-0005](0005-map-engine-and-route-preview.md) — the map engine this decision unblocks
- [ADR-0012](0012-long-term-osm-exit-path.md) — conditions for owning the stack
