# ADR-0030 — ORS/VROOM optimization, HERE Explore, and app-owned guidance

**Status:** Accepted  
**Date:** 2026-08-20  
**Deciders:** Product owner  
**Supersedes when implemented:** ADR-0004, ADR-0005, ADR-0007, ADR-0012, ADR-0021,
ADR-0026, ADR-0027, and ADR-0028 in the location-provider areas they govern

---

## Context

The implemented Expo application uses Google server APIs for address search, geocoding, routing,
and stop optimization, draws a synthetic preview, and hands driving to an external navigator.
The target requires a branded real map, 5–25-stop ordering, and focused in-app guidance without a
HERE Navigate contract.

HERE Base Plan restrictions exclude the Optimization use case except through the named HERE Tour
Planning product. Using HERE Matrix Routing or Waypoints Sequence and solving or requesting the
order elsewhere inside HERE would not change the product use case. Those paths are therefore
forbidden in the approved Base Plan architecture.

OpenRouteService (ORS) exposes an Optimization endpoint backed by the open-source VROOM solver.
Its published public-service request restriction accommodates this product's 5–25-stop, one-vehicle
scope. VROOM is heuristic: it returns a high-quality feasible order, not a guaranteed mathematical
optimum. ORS uses its own OpenStreetMap-derived routing costs; its order is not optimized against
HERE live traffic.

HERE SDK Explore can render and style the map. HERE Routing API v8 can calculate the final route
through an already ordered list and return polyline, summary, route handle, and
`turnByTurnActions`. A traffic-aware final route gives current geometry and ETA, but does not
retroactively make the ORS stop order optimal for HERE live traffic.

## Decision

Adopt a provider-separated architecture:

1. **ORS/VROOM orders stops.** A Supabase Edge Function sends one vehicle and 5–25 validated jobs,
   with fixed start and optional fixed return, to ORS Optimization. It validates that every input
   stop appears exactly once and treats unassigned, duplicate, missing, or unknown stop IDs as a
   failed optimization.
2. **HERE supplies location presentation and the final ordered route.** HERE provides search and
   geocoding, HERE SDK Explore map rendering, and Routing v8 route geometry, summary, route handle,
   traffic-aware ETA, and `turnByTurnActions` for the ORS order.
3. **2L owns essential guidance.** A pure-Dart kernel combines provider-neutral route/maneuver
   contracts with operating-system location updates for route progress, visual/TTS prompts,
   bounded rerouting, restoration, arrival, and current-leg external handoff.
4. **Supabase remains the control plane and system of record.** It owns auth, entitlements, quota,
   provider credentials, request validation, usage accounting, routes, History, and retryable sync.
   No server credential ships in Flutter.

The architecture must not call HERE Matrix Routing, Waypoints Sequence, Tour Planning, or any HERE
service to calculate stop order. Routing through client-supplied ordered vias is allowed only after
the HERE account/contract confirms this exact use and its billing unit.

The ORS public service is allowed only after the account dashboard/terms confirm commercial product
use and expose the actual `/optimization` daily/minute quota. The documented 2,000/day allowance
for ORS Directions must not be copied onto Optimization. Independent server-side circuit breakers
cap ORS optimization and HERE search/routing/rerouting; a GPS sample never directly triggers an
upstream request.

The product language is “optimized route” or “best order found,” never “exact optimum.” Quality is
benchmarked against exact solutions for small fixtures and representative real routes before
release. If ORS quota, terms, availability, or solution quality fail the gate, the fallback is
manual ordering/external navigation or a self-hosted VROOM/ORS decision—not silent use of HERE
Optimization.

HERE-derived geocoding fields are perishable. Unless a Permanent Storage Plan or other written
right is obtained, they expire under HERE's published storage window. Durable user-authored labels,
route membership, notes, and ordering are stored separately from provider-derived coordinates and
identifiers; reopening a saved route refreshes expired coordinates before optimization.

The first navigation release is online essential guidance, not HERE Navigate parity. It excludes
offline maps/routing/guidance, HERE Positioning, road-network map matching, lanes, junction views,
speed/road-sign warnings, tunnel extrapolation, and truck warners. Ambiguous states suppress unsafe
prompts and keep the minimal current-leg external-navigation button reachable.

Google location services are removed only after the gated cutover. Google OAuth may remain because
authentication is a separate dependency. Test data may be reset.

## Consequences

**Positive.** Stop ordering no longer asks HERE to perform or enable an excluded Optimization use
case, while HERE remains the map and final-route provider.

**Positive.** Provider-specific responsibilities are narrow and replaceable. Supabase can enforce
quota and normalize contracts without rewriting identity, billing, or History.

**Positive.** HERE Explore enables the approved branded map, and the owned Dart kernel enables a
focused navigation experience without a Navigate agreement.

**Negative.** “Zero cost” is conditional on verified public quotas and has no public-service SLA.
ORS availability, policy, or quota changes can block optimization.

**Negative.** The stop order uses ORS costs rather than HERE live traffic. The final HERE route and
ETA may reveal that another order would now be faster; the product must not claim otherwise.

**Negative.** VROOM may return a suboptimal solution, and HERE may split ordered vias or time-aware
routing into more than one billable transaction. Both are measured gates, not assumptions.

**Negative.** 2L owns safety-sensitive progress, maneuver timing, deviation, rerouting, background
location, voice, restoration, and battery behavior without road-network map matching.

## Evidence and references

Checked 2026-08-20:

- [HERE Base Plan restrictions](https://www.here.com/get-started/pricing/base-plan-restrictions)
- [HERE Routing API v8 request and response fields](https://docs.here.com/routing/reference/routing-api-v8-calculateroutespost)
- [HERE traffic-aware routing](https://docs.here.com/routing/docs/routing-v8-traffic-in-routing)
- [HERE geocoding storage rules](https://docs.here.com/here-kb/docs/permanent-geocoding-overview-licensing-and-usage-rules)
- [HERE SDK Explore/Navigate feature matrix](https://docs.here.com/here-sdk/docs/flutter-introduction-feature-list)
- [ORS public-service restrictions](https://openrouteservice.org/restrictions/)
- [ORS Optimization service](https://openrouteservice.org/services/)
- [ORS FAQ and documented Directions quota](https://giscience.github.io/openrouteservice/frequently-asked-questions.html)
- [VROOM solver](https://github.com/VROOM-Project/vroom)
- [Migration program](../41_HERE_MIGRATION_PROGRAM.md)

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| HERE Matrix + local TSP | Still implements the excluded HERE Optimization use case; transaction count also scales with matrix dimensions |
| HERE Waypoints Sequence or Tour Planning | WPS does not remove the restriction; Tour Planning/paid exception is outside the approved plan |
| Claim VROOM is exact or HERE-traffic-optimal | VROOM is heuristic and ORS does not optimize against HERE live traffic |
| HERE SDK Navigate | Requires a separate commercial agreement and removes control over the approved cost boundary |
| Explore with external-only navigation | Does not deliver focused in-app guidance |
| React Native native bridges | Splits HERE integration and guidance across Dart-equivalent logic, Kotlin, Swift, and JavaScript |
| Replace Supabase | Does not replace product auth, entitlements, History, quotas, or relational state |
