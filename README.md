# 2L Maps

**A multi-stop route optimizer for the single mobile professional.**

You have a disordered list of stops and need a usable visiting order in seconds. 2L Maps resolves
the addresses, optimizes the route, saves the confirmed result, and is evolving toward a branded
map with focused in-app guidance.

> **The user pays for the order and for getting through it with less friction—not for a generic
> map feature list.**

---

## Status: implemented system and approved migration

### Current on `main`

The Expo/React Native application, Supabase backend, automated tests, CI-built Android APK, and
product documentation are implemented. Address search, geocoding, routing, and optimization are
currently proxied to Google from Supabase Edge Functions. The route preview is a local synthetic
SVG scene rather than a Google map. Driving currently uses external navigator handoff.

Every push to `main` starts `.github/workflows/android-preview.yml`. Download the
`2l-maps-standalone` artifact from that run and validate the physical Android build against
[`docs/40_UI_IMPLEMENTATION_AUDIT.md`](docs/40_UI_IMPLEMENTATION_AUDIT.md).

### Approved target, spike prerequisites partially provisioned

The approved target is a disaggregated stack: **OpenRouteService/VROOM** orders 5–25 stops,
**HERE SDK Explore** renders the branded map, and **HERE Routing API v8** calculates the final route
through those already ordered stops. The target client is Flutter; HERE SDK Navigate is excluded.
The provisioned package is HERE Explore Flutter `4.27.2.0.309975`; ORS reports 500 Optimization
requests/day. Credentials shared during setup must be rotated before use, and ordered-via billing
and retention remain measured gates. Supabase remains the server-side control plane and system of
record. Google OAuth may remain
initially because authentication is independent of location services.

2L Maps will build a conservative online guidance kernel from operating-system location updates
and HERE Routing API v8 polylines, route handles, and `turnByTurnActions`. The first scope is
position/route progress, current and next maneuver, distance/ETA, visual/TTS prompts, sustained
deviation rerouting, arrival, restoration, and one minimal external-navigation control for the
**current leg only**.

The target does **not** promise offline maps/routing/guidance, HERE Positioning, road-network map
matching, lanes, junction views, speed/road-sign warnings, tunnel extrapolation, or parity with
HERE Navigate.

HERE is never used to optimize stop order: no Matrix, Waypoints Sequence, or Tour Planning call.
ORS/VROOM is heuristic and uses its own routing-cost model, so the product does not claim an exact
optimum or an order optimized against HERE live traffic. HERE traffic affects the final route and
ETA for the fixed ORS order. “Zero cost” remains conditional on the ORS account's actual
Optimization quota/terms and the HERE account's ordered-via eligibility and billing.

See [`docs/41_HERE_MIGRATION_PROGRAM.md`](docs/41_HERE_MIGRATION_PROGRAM.md) for capabilities,
blockers, risks, cost gates, data design, spike acceptance, and pull-request sequence.

---

## Product boundary

| Current | Approved target |
|---|---|
| Planner for one professional, one vehicle, 5–25 stops | Planner plus essential online guidance |
| Google server APIs behind Supabase | ORS Optimization + authorized HERE APIs behind Supabase |
| Local SVG route preview | Branded HERE SDK Explore map |
| External app drives the route | 2L guidance kernel drives; external app can open the current leg |
| Local + Supabase History | Local + Supabase History, provider-neutral |
| Expo/React Native client | Flutter after the Explore/guidance spike |
| No in-app GPS route following | OS location + pure-Dart conservative route following |
| No offline map | Still no offline map; Navigate is not in scope |

Fleet dispatch, multiple vehicles, driver management, and a web dashboard remain out of scope.

---

## Architecture

### Current

```mermaid
flowchart TD
  A["Expo / React Native"] -->|JWT and app contracts| B["Supabase"]
  A -->|local SVG preview| C["RouteCanvas"]
  B -->|search, geocode, route, optimize| D["Google location APIs"]
  A -->|route or legs| E["External navigator"]
```

### Target

```mermaid
flowchart TD
  A["Flutter app"] -->|map render/style| B["HERE SDK Explore"]
  A -->|GPS samples| C["OS location"]
  A -->|route state| D["2L guidance kernel"]
  A -->|JWT contracts| E["Supabase"]
  E -->|optimize order| F["ORS / VROOM"]
  E -->|search/final route/reroute| G["HERE APIs"]
  E -->|history/quota| I["Postgres"]
  A -->|current leg| H["External navigator"]
```

No server-service credential ships in the client. GPS samples are processed locally; they do not
generate one upstream request each. Provider SDK/API types never become persisted product
contracts.

---

## Migration decisions

- [ADR-0030](docs/adr/0030-here-platform-and-navigation-target.md) accepts ORS/VROOM ordering,
  HERE Explore/final routing, and app-owned essential guidance; HERE optimization and Navigate are
  explicitly excluded.
- [ADR-0031](docs/adr/0031-spike-before-flutter-migration.md) requires a seven-day Android+iOS
  hybrid-routing and guidance spike before the Flutter rewrite.
- ORS Optimization terms/quota and HERE ordered-via routing/billing are hard account gates.
- Existing Google-era ADRs continue to describe the current implementation until their cutovers.
- Test data may be reset; there is no production-data preservation requirement.
- Android remains first for delivery, while iOS viability is proved during the spike.
- Google OAuth stays initially; it is not a Google location-service dependency.

---

## Documentation

| Document | Purpose |
|---|---|
| [`docs/41_HERE_MIGRATION_PROGRAM.md`](docs/41_HERE_MIGRATION_PROGRAM.md) | Explore/custom-guidance target, eligibility, gates, waves, risks |
| [`docs/INDEX.md`](docs/INDEX.md) | Reading paths and area ownership |
| [`docs/00_PROJECT_OVERVIEW.md`](docs/00_PROJECT_OVERVIEW.md) | Current product and binding glossary |
| [`CLAUDE.md`](CLAUDE.md) | Development constitution |
| [`docs/36_IMPLEMENTATION_PLAN.md`](docs/36_IMPLEMENTATION_PLAN.md) | Implemented work and migration status |
| [`docs/31_COST_MODEL.md`](docs/31_COST_MODEL.md) | Current Google baseline and ORS/HERE verification gates |
| [`docs/38_QUICK_START_SETTINGS.md`](docs/38_QUICK_START_SETTINGS.md) | Current setup; HERE onboarding replaces location secrets later |

Documentation that names Google describes the implemented system unless it explicitly says
**Target**. The HERE program controls future changes until each owning document is migrated.

---

## Working in this repository

Read [`CLAUDE.md`](CLAUDE.md) and the document owning the area before writing code.

- Start every new program wave from the latest `main` and use a new pull request.
- Do not combine runtime rewrite, provider cutover, schema reset, and guidance into one merge.
- Do not commit HERE SDK archives, populated `.env` files, credentials, account pricing, or
  contracts publicly. Keys exposed in chat are rotated before use.
- Keep provider access behind facades and all metered server calls behind Supabase quota.
- A GPS sample never directly triggers a paid request.
- Do not present essential guidance as equivalent to HERE Navigate.
- Keep current-leg external fallback reachable in ambiguous and degraded states.
- Use the current CI standalone APK for Android checks until the Flutter delivery wave replaces it.

---

## Stack

**Current:** React Native · Expo · TypeScript · Expo Router · React Query · Zustand · NativeWind ·
Supabase · Google Places/Geocoding/Routes/Route Optimization server APIs · RevenueCat · Firebase ·
Sentry · GitHub Actions

**Approved target:** Flutter · Dart · ORS Optimization/VROOM · HERE SDK Explore · authorized HERE REST APIs · OS location ·
2L guidance kernel · Supabase · RevenueCat · Sentry · GitHub Actions. Exact analytics/crash tooling
is revalidated during the Flutter plan.

---

## Attribution, terms, and cost

The current implementation remains subject to Google Maps Platform terms until Google-derived
location content and services are removed.

Before code, the ORS account must confirm commercial use and the actual `/optimization`
daily/minute quota; the documented 2,000/day ORS figure applies to Directions and is not assumed for
Optimization. The HERE account must confirm Explore access, ordered-via final routing, guidance and
reroute use, retention/overlay rights, transaction definitions, free caps, RPS, and spending
controls. One final-route HTTP request is not assumed to equal one billed transaction until measured.
