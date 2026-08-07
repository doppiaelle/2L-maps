# ADR-0003 — Tiered, cost-aware optimization cascade (T0–T3)

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Product owner, architecture
**Implements decisions:** D3

---

## Context

The originating brief named the **Google Route Optimization API** as the optimization engine.
That API is a genuine Vehicle Routing Problem solver: it handles multiple vehicles, time
windows, capacities, priorities and skills. It is also billed **per shipment** — that is, per
stop — rather than per request.

Measuring the three available approaches against the same problem produces a result that
inverts the intuition behind the brief.

| Stops | `computeRoutes` + `optimizeWaypointOrder` | Route Optimization API | `computeRouteMatrix` + local solver |
|---|---|---|---|
| 10 | **~$0.010** (1 request) | ~$0.100 | ~$0.605 (121 elements) |
| 25 | **~$0.010** (1 request) | ~$0.250 | ~$3.38 (676 elements) |
| 50 | not supported (25-stop ceiling) | **~$0.500** | ~$13.00 (2,601 elements) |
| 100 | not supported | **~$1.000** | ~$51.00 (10,201 elements) |

*Figures derived from published rates: Route Optimization ≈ $10 per 1,000 single-vehicle
shipments; Routes API tiered at roughly $5/$10/$15 CPM for Essentials/Pro/Enterprise; Route
Matrix billed per element (origins × destinations). Confidence: medium-high — see the
sourcing note in [`33_API_CONTRACTS.md`](../33_API_CONTRACTS.md).*

Two conclusions follow, both counterintuitive:

1. For a 25-stop route, `optimizeWaypointOrder` costs **about one twenty-fifth** of the
   Route Optimization API, because it is one request rather than 25 billable units.
2. **Building the distance matrix with Google and solving the TSP in-house is the most
   expensive option of the three** — the opposite of the usual "roll your own to save money"
   instinct. A matrix is O(n²) billable elements; a route is one.

Against the target segment of 5–25 stops (ADR-0002), the brief's chosen engine is the wrong
one for essentially every real request.

## Decision

Optimization is performed by a **cascade of four tiers**, selected by the server according to
problem shape. There is no single engine.

| Tier | Selected when | Engine | Cost |
|---|---|---|---|
| **T0** | ≤8 stops **and** (offline or upstream API failure) | Local heuristic: nearest neighbour + 2-opt / Or-opt over a haversine matrix | $0 |
| **T1** | ≤25 stops, single vehicle, no constraints — **the default path** | Routes API `computeRoutes` with `optimizeWaypointOrder: true` | ~$0.01 per route |
| **T2** | >25 stops **or** time windows / capacities / priorities present | Route Optimization API `optimizeTours` | ~$0.01 per stop |
| **T3** | High volume, phase 3 only | Self-hosted OSRM or Valhalla matrix + OR-Tools | ~$0 marginal, plus operations |

Tier selection is a **server-side decision** made in the `/optimize` Edge Function. The client
requests an optimization; it does not choose an engine.

**T0 results are always labelled in the UI** as a degraded optimization. A straight-line
heuristic ignores road geometry, one-way streets and traffic; presenting its output as
equivalent to T1 would be dishonest.

### Mandatory two-phase pattern for T1

`optimizeWaypointOrder` carries two hard constraints, both verified:

- It is **incompatible with `routingPreference: TRAFFIC_AWARE_OPTIMAL`**.
- It is **incompatible with waypoints marked `via: true`**.

Since accurate ETA is a core product promise, T1 is therefore two calls, not one:

```
Phase 1 ── computeRoutes(optimizeWaypointOrder: true, TRAFFIC_AWARE)
           └─▶ returns optimizedIntermediateWaypointIndex[]  → the visiting order

Phase 2 ── computeRoutes(ordered waypoints, TRAFFIC_AWARE_OPTIMAL)
           └─▶ returns accurate per-leg duration, ETA, encoded polyline
```

Both calls sit in the Essentials/Pro price band; the pair still costs roughly $0.01–0.02,
leaving T1 an order of magnitude cheaper than T2 at any stop count it supports.

## Consequences

**Positive.** The dominant use case costs about one cent per optimization regardless of
whether the user has 6 stops or 25. Cost is decoupled from stop count precisely where the
target segment lives. T2 remains available for the cases that genuinely need a VRP solver,
so no capability is lost — only the default changes.

**Positive.** T0 gives the app a truthful answer when the network is gone, which matters for
a tool used in vans and rural areas, and costs nothing.

**Negative.** Three engines mean three response shapes to normalise, three error taxonomies,
and a tier-selection rule that must be tested at its boundaries. This is the principal
implementation complexity introduced by this ADR. Mitigated by a single internal
`OptimizationResult` contract that all tiers produce, specified in
[`33_API_CONTRACTS.md`](../33_API_CONTRACTS.md).

**Negative.** The 25-stop boundary is now visible to users as a product limit. Presented as a
plan boundary rather than an apology.

**Negative.** T2's asynchronous batch mode has materially different latency from its
synchronous mode. The switch threshold and the waiting UX are specified in
[`15_ROUTE_OPTIMIZATION.md`](../15_ROUTE_OPTIMIZATION.md).

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Route Optimization API for everything (the brief's proposal) | One engine, one response shape, all constraints available from day one, simplest to document and build | 10–25× more expensive on the dominant case: $0.25 versus $0.01 for a 25-stop route. At target volumes this alone would consume the subscription margin. |
| Routes API only | Cheapest and simplest possible implementation | Hard 25-stop ceiling with no escape hatch, and no support for time windows, capacities or priorities. Closes the door on the courier and B2B segments permanently. |
| Google matrix + in-house OR-Tools solver | Full algorithmic control; familiar to anyone who has solved a TSP | The most expensive option measured. O(n²) billable matrix elements: $3.38 for 25 stops against $0.01. Attractive only if the matrix is free, which is the T3 case. |
| Cascade plus self-hosted OSRM from day one | Near-zero marginal cost at scale; unlocks legal offline maps | Adds a routing server, OSM data pipeline and its ongoing operations to an MVP, and forfeits Google's real-time traffic. Deferred to T3 and to [ADR-0012](0012-long-term-osm-exit-path.md). |
| Client-side heuristic as the default | Zero API cost | Ignores road network, one-ways and traffic. Produces visibly worse orders than Google Maps' unoptimized list on dense urban routes, which destroys the product's entire premise. Retained only as the T0 fallback. |

## References

- [`docs/15_ROUTE_OPTIMIZATION.md`](../15_ROUTE_OPTIMIZATION.md) — full algorithm specification
- [`docs/31_COST_MODEL.md`](../31_COST_MODEL.md) — the cost figures above
- [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) — request/response contracts per tier
- [ADR-0002](0002-target-segment-and-monetization.md) — why 5–25 stops is the target band
- [ADR-0012](0012-long-term-osm-exit-path.md) — T3 and the exit path
