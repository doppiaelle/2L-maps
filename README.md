# 2L Maps

**A multi-stop route optimizer for the single mobile professional.**

You have twelve addresses to visit today. Google Maps will route them — in the order you typed
them. It will not work out a better order, and it stops at ten. Waze and Apple Maps take one
destination at a time. Fleet software solves the problem properly and is priced and shaped for
dispatchers managing drivers, not for the driver.

> **The user does not pay for a map. They pay for the order.**

Add your stops, tap once, and the app returns the fastest sequence with a real ETA — then hands
off to Google Maps, Waze or Apple Maps, whichever you already use.

---

## Status

**The Expo application, Supabase backend, automated tests, CI-built Android APK, and product
documentation are implemented in this repository.** The current interface follows the approved
2L Maps mobile direction: minimal black/white surfaces, mint navigation actions, a two-item
Route/History dock, top-right Settings, inline address autocomplete, and a route-conditioned
procedural navigation environment.

Every push to `main` starts `.github/workflows/android-preview.yml`. Download the
`2l-maps-standalone` artifact from that run, unzip it, and install the contained ARM64 APK on the
physical Android phone. Final visual/device acceptance is recorded only after that exact artifact
is checked against [`docs/40_UI_IMPLEMENTATION_AUDIT.md`](docs/40_UI_IMPLEMENTATION_AUDIT.md).

The documentation in [`docs/`](docs/) describes the implemented product and the remaining release
work. Start with
[`docs/00_PROJECT_OVERVIEW.md`](docs/00_PROJECT_OVERVIEW.md), then read
[`CLAUDE.md`](CLAUDE.md) before writing any code.

---

## What it is, and what it is not

| It is | It is not |
|---|---|
| A route **planner** — computes the visiting order | A navigation app. No turn-by-turn, no voice |
| A preview of that order on a quiet map | A competitor to Google Maps on search or traffic data |
| For one professional with one vehicle, 5–25 stops a day | Fleet software. No dispatchers, no driver management, no web dashboard |
| Offline for **your own data** — saved routes, address book, last result | An offline map. Tile caching is prohibited by the platform terms |

Each exclusion is a decision with a recorded reason, not an omission. See
[`docs/04_FEATURES.md`](docs/04_FEATURES.md) §8.

---

## Architecture at a glance

```
  MOBILE APP  Expo · React Native · TypeScript · Expo Router · NativeWind
      │       Drawn route preview · RoutingProvider · GeocodingProvider
      │                NavigationProvider · BillingProvider
      │       State:   Zustand (client) · React Query (server)
      │
      │ HTTPS + JWT
      ▼
  SUPABASE    Auth · Postgres + RLS · Realtime · Edge Functions
      │       Every metered function: JWT → entitlement → rate limit →
      │       quota → cache → upstream → record
      │
      ▼
  GOOGLE      Routes API · Route Optimization API · Places API (New)
```

**No Google web-service credential ships in the client.** Calls are proxied because the Route
Optimization API requires a service account that cannot exist on a device, and because quotas
enforced in a client are not enforced at all. The preview renderer is local SVG: real route
geometry and numbered stops over deterministic anonymous scenery generated around the route.

---

## Three decisions worth knowing before you read further

Each of these inverted an assumption in the original brief, and each is documented in full with
its rejected alternatives.

**Optimization uses a cost-aware cascade, not one engine**
([ADR-0003](docs/adr/0003-tiered-optimization-cascade.md)). The Route Optimization API bills per
*stop*; `computeRoutes` with `optimizeWaypointOrder` bills per *request*. On a 25-stop route that
is roughly a 25× difference, so the default path is the cheap one and the expensive engine is
reserved for problems that genuinely need it. Building the distance matrix yourself and solving
the TSP locally — the instinctive "cheaper" option — turns out to be the most expensive of all.

**There is no in-app navigation**
([ADR-0004](docs/adr/0004-external-navigation-handoff.md)). Turn-by-turn requires the Navigation
SDK, which cannot coexist with the Maps SDK — adopting it would mean rebuilding the entire
planning map on a Beta pre-1.0 component. Handoff is the delivery mechanism instead, and since no
external app accepts a full multi-stop route, it is structurally chunked or leg-by-leg.

**`place_id` is permanent; coordinates expire in 30 days**
([ADR-0007](docs/adr/0007-place-id-durable-coordinates-perishable.md)). The platform terms forbid
caching latitude and longitude beyond 30 consecutive days, which makes the natural schema a
violation. Coordinates are therefore nullable everywhere and purged on a schedule, while the
user's own labels and stop order are permanent.

---

## Documentation

[`docs/INDEX.md`](docs/INDEX.md) is the map: reading paths, area ownership, and a traceability
matrix from every requirement to the document that covers it.

| Start here | For |
|---|---|
| [`00_PROJECT_OVERVIEW.md`](docs/00_PROJECT_OVERVIEW.md) | The product, the architecture, and the binding glossary |
| [`CLAUDE.md`](CLAUDE.md) | The rules all development follows — read before writing code |
| [`docs/adr/`](docs/adr/) | Twelve decisions, each with its rejected alternatives |
| [`31_COST_MODEL.md`](docs/31_COST_MODEL.md) | What every action costs and whether the price works |
| [`29_DEFINITION_OF_DONE.md`](docs/29_DEFINITION_OF_DONE.md) | When a change is actually finished |

**A note on the numbers.** Google pricing and API limits throughout the documentation were
gathered from secondary sources because `developers.google.com` was unreachable from the
authoring environment. They are marked with a confidence level and must be verified against the
official pages before any pricing decision. See
[`docs/33_API_CONTRACTS.md`](docs/33_API_CONTRACTS.md) §8.

---

## Working in this repository

**Read before writing code:** [`CLAUDE.md`](CLAUDE.md) §0 — the five rules — then the document
owning the area you are changing.

Two practical constraints that catch people out:

- **Use the CI standalone APK for phone checks.** No local Android Studio is assumed; the APK is
  emitted as a GitHub Actions artifact ([`docs/25_DEPLOYMENT.md`](docs/25_DEPLOYMENT.md)).
- **Development happens in ephemeral containers.** Push after every meaningful unit of work; a
  commit that exists only locally is not saved work.

---

## Stack

React Native · Expo · TypeScript · Expo Router · React Query · Zustand · NativeWind · Supabase ·
Google Maps SDK · Google Places API · Google Routes API · Google Route Optimization API ·
RevenueCat · Firebase Analytics · Crashlytics · Sentry · Fastlane · GitHub Actions

---

## Attribution and terms

This product uses the Google Maps Platform and is bound by its Service Specific Terms. Google
attribution is displayed wherever Google content appears, coordinates are never cached beyond 30
days, map tiles are never cached or pre-fetched, and Google-derived content is never rendered on
a non-Google map. Full analysis in
[`docs/32_LEGAL_COMPLIANCE.md`](docs/32_LEGAL_COMPLIANCE.md).
