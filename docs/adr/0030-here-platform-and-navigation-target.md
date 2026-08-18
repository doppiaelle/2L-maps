# ADR-0030 — HERE Explore and app-owned guidance target

**Status:** Accepted
**Date:** 2026-08-18
**Deciders:** Product owner
**Supersedes when implemented:** ADR-0004, ADR-0005, ADR-0007, ADR-0012, ADR-0021,
ADR-0026, ADR-0027, and ADR-0028 in the location-provider areas they govern

---

## Context

The implemented product plans and saves multi-stop routes, draws a synthetic SVG preview, and
hands driving to an external navigator. Google still supplies server-side address search,
geocoding, routing, and waypoint optimization, while Supabase owns authentication, product data,
quota, and History.

The approved product direction requires a real map in the 2L visual language and useful in-app
guidance. HERE SDK Navigate provides a complete navigation engine, but it requires a separate
commercial agreement and is not included in the Base Plan. The product owner has rejected that
dependency for the planned product.

HERE Routing API v8 can return a route polyline, route handle, and
`turnByTurnActions` designed to support visual and verbal guidance. HERE SDK Explore can render
and style the map but does not include HERE navigation, HERE Positioning, downloadable offline
maps, offline routing, or offline search.

A second commercial issue is independent of Navigate: HERE's Base Plan restrictions describe
“Optimization” as an excluded use case, with an exception for HERE Tour Planning. Because ordering
a driver's stops is the core of 2L Maps, Base Plan eligibility and the correct optimization
product must be confirmed before the migration can be treated as commercially viable.

## Decision

Use HERE SDK **Explore**, not HERE SDK Navigate.

HERE is the target provider for the online map, address/search services, route geometry,
turn-by-turn action data, and reroute calculations, subject to the Base Plan eligibility gate.

2L Maps owns a deliberately limited guidance engine in pure Dart. It consumes provider-neutral
route and maneuver contracts returned by Supabase and combines them with operating-system location
updates. Its responsibilities are:

- project the current GPS position onto the active route polyline;
- track monotonic along-route progress with confidence and hysteresis;
- select and announce upcoming maneuvers from HERE `turnByTurnActions`;
- render current position, route progress, maneuver, remaining distance, and ETA;
- detect sustained route deviation and request a bounded server-side reroute;
- restore a versioned navigation session after interruption;
- mark arrival and advance to the next stop;
- open the installed external navigator for the current leg only.

The first release is **online essential guidance**, not a replacement for a mature satellite
navigator. It excludes offline maps/routing/guidance, HERE Positioning, road-network map matching,
lane assistance, junction views, speed-limit and road-sign warnings, tunnel extrapolation,
spatial audio, and truck-specific live warners. These are not promised through imitation.

Supabase remains the product backend and system of record for authentication, profiles,
entitlements, quotas, favourites, routes, History, provider-neutral locations, usage accounting,
and retryable sync. Metered HERE REST requests remain behind Edge Functions. The Explore SDK is
used in the Flutter client for map rendering and style; its types never cross into persisted
product contracts.

The optimization implementation is not selected until HERE confirms one of these paths in writing:

1. HERE Tour Planning is permitted under the Base Plan and its billable unit/allowance fits the
   single-driver product; or
2. HERE authorizes another specific HERE service and pricing plan for the 2L optimization use
   case; or
3. HERE services can legally be combined with an independently licensed/self-hosted optimization
   stack and displayed on the HERE map.

Google location services are removed only after a gated HERE cutover. Google OAuth may remain as
an authentication provider until a separate decision replaces it.

The proprietary Explore package and credentials are not committed to this public repository. CI
receives the pinned package through an approved private artifact channel.

## Consequences

**Positive.** The product can pursue its branded HERE map and essential in-app guidance without a
Navigate contract or an opaque navigation-SDK price.

**Positive.** The app owns guidance UX, thresholds, voice timing, state restoration, analytics,
and current-leg fallback. These can match the focused single-driver workflow instead of exposing a
large generic navigation feature set.

**Positive.** Keeping Supabase prevents the provider migration from becoming an identity, billing,
History, and entitlement rewrite. Provider-neutral IDs make future changes less destructive.

**Negative.** 2L Maps becomes responsible for safety-critical route progress, maneuver timing,
deviation detection, rerouting policy, background location, voice, restoration, battery, and
physical-road validation.

**Negative.** Raw GPS projected onto a route polyline is less robust than road-network map
matching. Parallel roads, ramps, urban canyons, tunnels, roundabouts, and poor GPS can cause wrong
progress or wrong maneuver timing. Conservative confidence states and external fallback are
product requirements, not implementation details.

**Negative.** Guidance is online. Explore does not provide the downloadable offline map/search/
routing/navigation stack reserved for Navigate.

**Negative.** Free allowances are not a commercial authorization. The core stop-ordering use case
may be excluded from Base Plan except through Tour Planning, and exact current quotas must be read
from the account/contract before pricing.

## Evidence and references

Checked 2026-08-18:

- [HERE SDK Flutter licenses](https://docs.here.com/here-sdk/docs/flutter-introduction-editions)
- [HERE SDK Explore map capabilities](https://docs.here.com/here-sdk/docs/flutter-maps)
- [HERE Routing API v8 turn-by-turn actions](https://docs.here.com/routing/docs/routing-v8-guidance)
- [HERE Routing API v8 rerouting with a route handle](https://docs.here.com/routing/docs/routing-v8-adjust-route-after-deviation)
- [HERE Base Plan restrictions](https://www.here.com/get-started/pricing/base-plan-restrictions)
- [HERE excluded-use-case definitions](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases)
- [Migration program](../41_HERE_MIGRATION_PROGRAM.md)

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| HERE SDK Navigate | Complete supported guidance, positioning, warners, offline | Separate commercial agreement and price; removed from the plan |
| Explore map with external-only navigation | Lowest technical and safety risk | Does not deliver the approved focused in-app guidance experience |
| Pretend to reproduce every Navigate feature | Marketing parity without the license | Technically unsafe and misleading; many capabilities need map matching and map attributes Explore does not expose |
| Replace Supabase | Superficially one fewer vendor | HERE does not replace product identity, History, quota, or relational state |
| Assume Routing allowance permits optimization | Lets development start immediately | Usage allowance and permitted use case are different; Base Plan explicitly flags Optimization |
| Remove Google OAuth now | Complete Google exit | Couples an independent account migration to the highest-risk location change |
