# ADR-0012 — MapLibre + Valhalla recorded as the long-term exit path

**Status:** Accepted (as a documented target, not a commitment)
**Date:** 2026-08-06
**Deciders:** Product owner, architecture

---

## Context

The product is entirely dependent on the Google Maps Platform for rendering, geocoding,
routing and optimization. That dependency carries a specific, demonstrated risk: Google
changes pricing and terms unilaterally. In March 2025 the flat $200 monthly credit was
replaced with per-SKU free caps, and Places, Directions and Distance Matrix were designated
Legacy. Any of the assumptions in [`31_COST_MODEL.md`](../31_COST_MODEL.md) can be invalidated
by an announcement.

The question was raised directly during planning: if the constraint is Google's, why not
build the navigation and routing stack ourselves, as Waze did?

The honest answer has two halves, and both belong in the record.

**Technically, it is possible.** The open-source stack exists and is proven: **MapLibre GL**
for rendering, the **MapLibre Navigation SDK** (an open fork of the Mapbox Navigation SDK from
before it became proprietary) for guidance, and **Valhalla** for routing over OpenStreetMap
data. Valhalla produces turn-by-turn maneuver narratives natively, does map matching, and
supports time-dependent routing and matrices. Organic Maps, OsmAnd and Magic Earth are real
products built this way.

**Strategically, it does not replicate Waze.** Waze's moat was never its software — it was a
map corrected by hundreds of thousands of volunteer editors and, decisively, real-time traffic
derived from over 100 million drivers sending probe data. Google paid $1.1 billion for that
dataset, not for the application. On day one our probe coverage is zero, so ETAs would be
free-flow estimates: systematically wrong in urban peak hours. Traffic feeds can be bought
from HERE, TomTom or INRIX, but those are enterprise contracts costing thousands per month —
worse economics than Google's per-call pricing at our scale.

The decisive point is one of focus: the product's promise is *minimise time and traffic*.
Building navigation in-house would spend 6–12 months on the commodity layer while weakening
the differentiator.

There is also a hard constraint that makes this a fork rather than a blend. The Google Maps
Platform terms forbid, **per API**, using Google Maps Content with a non-Google map — the
clause recurs for Directions, Distance Matrix and Geocoding. Drawing a Google-computed
polyline on a MapLibre map is a violation. Google-derived coordinates cannot be plotted on an
OSM map either. You choose one house.

## Decision

**The Google stack is the MVP architecture.** No OSM component ships in phase 1 or 2.

**MapLibre + Valhalla + OSM is recorded as the documented target architecture for phase 3**,
and the codebase is shaped so the migration is an adapter swap rather than a rewrite. Four
provider facades are mandatory from day one:

| Facade | Google implementation | OSM implementation (phase 3) |
|---|---|---|
| `MapProvider` (`<AppMap>`) | `react-native-maps` + Google Maps SDK | MapLibre GL |
| `RoutingProvider` | Routes API `computeRoutes` | Valhalla `/route` |
| `MatrixProvider` | Routes API `computeRouteMatrix` | Valhalla `/sources_to_targets` |
| `GeocodingProvider` | Places API (New) + Geocoding | Commercial geocoder, or Photon/Nominatim |
| `NavigationProvider` | External handoff ([ADR-0004](0004-external-navigation-handoff.md)) | MapLibre Navigation SDK, or unchanged |

**No screen, store or hook may import a provider SDK directly.** This is the single rule that
keeps the option open, and it is enforced in [`30_CLAUDE_RULES.md`](../30_CLAUDE_RULES.md) and
[`CLAUDE.md`](../../CLAUDE.md) as a review-blocking violation. Its cost today is one layer of
indirection; its value is that the exit remains available.

**Migration triggers — any one is sufficient to reopen this decision:**

1. Google Maps Platform pricing rises to where COGS exceeds 25% of net subscription revenue.
2. Terms change in a way that blocks a shipped feature.
3. Offline maps become a demonstrated requirement for retention — the capability Google
   forbids and OSM permits ([ADR-0008](0008-offline-scope.md)).
4. Monthly optimization volume makes a self-hosted Valhalla matrix (tier T3 in
   [ADR-0003](0003-tiered-optimization-cascade.md)) cheaper than Google's, including
   operations.

## Consequences

**Positive.** The dependency risk is named, quantified and given a route out, rather than
discovered during a pricing announcement.

**Positive.** Tier T3 becomes reachable: a self-hosted matrix has near-zero marginal cost,
which is what would make large stop counts economically viable and reopen the courier segment
rejected in [ADR-0002](0002-target-segment-and-monetization.md).

**Positive.** The facades pay for themselves before any migration, by making the whole data
layer mockable in tests ([`22_TESTING.md`](../22_TESTING.md)).

**Negative.** Five facades add indirection to a codebase that does not yet need it. Justified
only because the rule is cheap to follow from the start and expensive to retrofit.

**Negative.** Migration would forfeit real-time traffic and degrade Italian address quality,
which is why it is an exit path and not a plan. Any migration must budget for a commercial
geocoder and, if traffic matters, a paid feed.

**Negative.** A documented alternative can become an excuse to defer solving problems within
the current stack. This ADR is explicitly not a commitment, and no roadmap item depends on it.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Adopt the OSM stack immediately | Own the whole stack; legal offline maps; near-zero marginal cost; no terms constraints | No real-time traffic on day one, against a product promising traffic-aware ordering. Worse Italian address quality. 6–12 months added before launch, plus a routing server and OSM data pipeline to operate indefinitely. |
| Hybrid: Google for search and routing, MapLibre for rendering | Best of both; escapes the map-styling constraint | Prohibited. The "No Use With Non-Google Maps" clause applies per API — Google-derived routes and coordinates cannot be displayed on a non-Google map. **Partly overtaken by [ADR-0028](0028-a-coastline-under-the-route.md)**: no map service and no tiles, but a bundled public-domain coastline is drawn under the route, which is this row's prohibition in a smaller form. Taken knowingly, with the risk recorded. |
| Build in-house navigation like Waze | Full ownership of the driving experience and its telemetry | Waze's asset is crowd-sourced traffic from 100M+ drivers, unreplicable at our scale. Invests a year in the commodity layer while the differentiator — stop ordering — goes unimproved. |
| Accept the Google dependency with no exit documented | Less indirection; simpler code; nothing speculative | Leaves a single supplier able to invalidate the business model with an announcement, with no analysis on hand when it happens. The facades cost little; the analysis costs nothing to keep. |

## References

- [`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md) — current integration
- [`docs/31_COST_MODEL.md`](../31_COST_MODEL.md) — the economics that would trigger migration
- [`docs/28_ROADMAP.md`](../28_ROADMAP.md) — phase 3 positioning
- [ADR-0003](0003-tiered-optimization-cascade.md) — tier T3
- [ADR-0004](0004-external-navigation-handoff.md) — why in-house navigation was declined
