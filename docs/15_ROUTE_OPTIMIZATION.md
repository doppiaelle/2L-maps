# 15 — Route Optimization

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0003](adr/0003-tiered-optimization-cascade.md) · [`31_COST_MODEL.md`](31_COST_MODEL.md) · [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)

---

## 1. Purpose

This document specifies how the product turns an unordered set of stops into an ordered route.
It is the core of the product: everything else is input collection or output presentation.

It covers the problem class, the four-tier engine cascade, tier selection, the two-phase
traffic pattern, recalculation, caching, and the behaviour of every failure mode.

It does not specify the HTTP contracts ([`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)), the
costs ([`31_COST_MODEL.md`](31_COST_MODEL.md)) or the map presentation
([`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md)).

## 2. Goals

1. Produce the best achievable stop order within the cost envelope in [`31`](31_COST_MODEL.md).
2. Make engine selection automatic and invisible to the user.
3. Always return something useful — degraded and labelled rather than nothing.
4. Never lose the user's existing order on failure.
5. Keep cost per optimization decoupled from stop count wherever possible.

**Non-goals.** Not a general VRP solver. No multi-vehicle assignment, no capacities, no skills
matching. Time windows are deferred ([`28_ROADMAP.md`](28_ROADMAP.md) phase 2.0).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Tier selection | `/optimize` Edge Function | Server-side only; the client never chooses |
| Request construction | `/optimize` Edge Function | Per-tier request shapes |
| Result normalisation | `/optimize` Edge Function | All tiers emit one `OptimizationResult` |
| T0 heuristic | Client and server, shared pure code | Runs client-side when offline |
| Cache lookup and write | `/optimize` Edge Function | Content-keyed, shared across users |
| Presentation of degraded results | Client | Labelling is mandatory |

---

## 4. The problem

### Classification

The general form is the **Vehicle Routing Problem** (VRP): assign stops to vehicles and order
each vehicle's stops, subject to constraints, minimising total cost. It is NP-hard.

The MVP solves a strict subset — the **Travelling Salesman Problem** (TSP), and specifically
the asymmetric TSP with an optional return to origin:

- **one vehicle**, so no assignment sub-problem;
- **no capacity constraints**;
- **no time windows** in the MVP;
- **asymmetric** — travel time A→B rarely equals B→A, because of one-way streets, turn
  restrictions and directional traffic;
- **open or closed** — one way ends at the last stop; round trip returns to the origin.

Asymmetry matters more than it appears. A symmetric approximation using straight-line distance
produces visibly wrong orders in cities with one-way systems, which is precisely where the
product is used. This is the main reason tier T0 is a fallback rather than the default.

### Complexity

Exact solutions are (n−1)!/2 for symmetric TSP — 25 stops is roughly 10²³ permutations.
Nobody enumerates. Every tier uses heuristics or metaheuristics; the difference between tiers
is who runs them and what data they run on.

```
  n      exact permutations        practical approach
  5      12                        exact possible, still not worth it
  10     181,440                   heuristic, near-optimal in milliseconds
  25     ~3.1 × 10²³               heuristic; Google's is better than ours because
                                   it uses the real road graph and live traffic
  100    ~4.7 × 10¹⁵⁵              metaheuristic with a time budget
```

---

## 5. Text diagrams

### Tier selection

```
                        optimize request
                               │
                    ┌──────────▼──────────┐
                    │ network available?  │
                    └──────┬───────┬──────┘
                        no │       │ yes
                           ▼       ▼
                   ┌───────────┐  ┌──────────────────────┐
                   │ stops ≤ 8?│  │ constraints present? │
                   └──┬─────┬──┘  │ (time windows,       │
                   yes│     │no   │  priorities, >1 veh) │
                      ▼     ▼     └────┬────────────┬────┘
                    ┌────┐ ┌─────┐  no │            │ yes
                    │ T0 │ │queue│     ▼            ▼
                    └────┘ └─────┘  ┌──────────┐  ┌────┐
                                    │stops ≤ 25│  │ T2 │
                                    └──┬────┬──┘  └────┘
                                    yes│    │no
                                       ▼    ▼
                                    ┌────┐ ┌────┐
                                    │ T1 │ │ T2 │
                                    └────┘ └────┘
```

### The two-phase T1 pattern

`optimizeWaypointOrder` is incompatible with `TRAFFIC_AWARE_OPTIMAL` and with `via: true`
waypoints. Accurate ETA therefore requires two calls.

```
  ┌─ Phase 1 ─ ordering ──────────────────────────────────────┐
  │  computeRoutes                                            │
  │    optimizeWaypointOrder: true                            │
  │    routingPreference:     TRAFFIC_AWARE                    │
  │    fieldMask: optimizedIntermediateWaypointIndex           │
  │  ────────────────────────────────────────────────────────  │
  │  ▶ the visiting order                                      │
  └────────────────────────┬──────────────────────────────────┘
                           │ reorder stops
  ┌─ Phase 2 ─ accuracy ───▼──────────────────────────────────┐
  │  computeRoutes                                            │
  │    intermediates:        stops in the phase-1 order        │
  │    routingPreference:    TRAFFIC_AWARE_OPTIMAL             │
  │    fieldMask: duration, distanceMeters, polyline, legs     │
  │  ────────────────────────────────────────────────────────  │
  │  ▶ accurate ETA, per-leg detail, encoded polyline          │
  └───────────────────────────────────────────────────────────┘
```

Phase 2 is skipped when the phase-1 order matches the current order and a cached phase-2
result is still fresh — a common case on re-optimization after a trivial edit.

### Normalisation

Every tier produces the same shape, so the client never branches on tier except to render the
degraded label.

```
  T0 heuristic  ─┐
  T1 Routes API ─┼──▶  OptimizationResult
  T2 RO API     ─┤       order[]          stop ids in visiting order
  T3 (phase 3)  ─┘       legs[]           distance, duration per leg
                         totalDistance
                         totalDuration
                         eta
                         polyline         null for T0
                         tier             T0 | T1 | T2 | T3
                         degraded         true only for T0
                         unreachable[]    stops excluded, with reasons
                         computedAt
                         cacheHit
```

---

## 6. Flows

**Tier selection, end to end.** This runs on the server; the client never chooses an engine.

```
  request ──▶ constraints present? ──yes──▶ T2  (Route Optimization, per-stop billing)
                    │ no
                    ▼
              stops > 25? ──yes──▶ T2
                    │ no
                    ▼
              upstream reachable? ──no──▶ stops ≤ 8? ──yes──▶ T0, labelled degraded
                    │ yes                      │ no
                    ▼                          ▼
                   T1                    named failure + retry, order preserved
```

**The two-phase T1 pattern.** `optimizeWaypointOrder` is incompatible with
`TRAFFIC_AWARE_OPTIMAL`, so one call cannot both order the stops and produce an accurate ETA:

```
  phase 1  computeRoutes, TRAFFIC_AWARE, optimizeWaypointOrder: true   ──▶ the order
  phase 2  computeRoutes on that fixed order, TRAFFIC_AWARE_OPTIMAL    ──▶ the ETA
```

Skipping phase 2 ships an order that is right and a time that is wrong, which the user
discovers only by being late.

**Failure never reorders.** Every failure path preserves the stop order the user entered.
An optimization that fails and also scrambles the list has destroyed work while doing nothing.

## 7. The tiers

### T0 — local heuristic

**Used when:** offline, or every upstream attempt failed, **and** stops ≤ 8.

**Algorithm:** nearest neighbour to build an initial tour, then 2-opt and Or-opt improvement
until no move improves the tour or a 200 ms budget expires.

**Distance metric:** haversine great-circle distance. This is the weakness — it ignores the
road network, one-way streets, turn restrictions and traffic entirely. In a city with a
one-way system the result can be materially worse than the user's own guess.

**Why 8 and not 25:** the quality gap between a straight-line heuristic and real road routing
widens sharply with stop count. At 8 stops the result is usually defensible; at 20 it is often
embarrassing. The ceiling is a quality decision, not a performance one.

**Mandatory labelling.** A T0 result carries `degraded: true` and the UI states plainly that
it was calculated without traffic or road data. Presenting it as equivalent to T1 would be
dishonest, and the user is making driving decisions on it.

**No polyline.** T0 produces an order, not a route geometry. The map draws straight connectors
in a visually distinct style rather than a fake road-following line.

---

### T1 — Routes API with waypoint optimization · **the default**

**Used when:** online, stops ≤ 25, single vehicle, no constraints. This is the overwhelming
majority of requests from the target segment.

**Mechanism:** the two-phase pattern in §5. Phase 1 obtains the order; phase 2 obtains accurate
traffic-aware detail.

**Hard limits** (authoritative values in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)):

- at most 25 intermediate waypoints;
- `optimizeWaypointOrder` incompatible with `TRAFFIC_AWARE_OPTIMAL`;
- `optimizeWaypointOrder` incompatible with waypoints marked `via: true`;
- field masks are mandatory and determine the billing SKU — requesting more fields than needed
  moves the request to a higher-priced tier for no benefit.

**Why this is the default rather than the Route Optimization API:** T1 bills per request, T2
bills per stop. On a 25-stop route T1 costs roughly one twenty-fifth of T2. The full analysis
is in [ADR-0003](adr/0003-tiered-optimization-cascade.md).

---

### T2 — Route Optimization API

**Used when:** stops > 25, **or** any constraint is present (time windows, priorities,
capacities, multiple vehicles). All of those except stop count are post-MVP.

**Mechanism:** the stop set is expressed as a `ShipmentModel` with one vehicle and one shipment
per stop, then solved by `optimizeTours`.

**Synchronous or asynchronous.** Small problems return synchronously. Above a threshold the
request becomes a job. The two modes have materially different latencies, which is risk C13 in
[`35_RISK_REGISTER.md`](35_RISK_REGISTER.md) and the reason the waiting experience is
specified rather than left to a spinner:

```
  client ──▶ /optimize ──▶ creates job row ──▶ returns job id immediately
                              │
                              ├──▶ batchOptimizeTours (async)
                              │
  client subscribes to Supabase Realtime on the job row
                              │
                              ▼
                     job completes ──▶ row updated ──▶ client notified
```

The threshold is set so a synchronous request never appears to hang; it is tuned against
observed latency and recorded in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md).

**Cost warning.** T2 bills per stop. A 60-stop route optimized three times in a day is 180
billable units. Quota enforcement ([ADR-0011](adr/0011-server-side-quota-enforcement.md))
matters most here.

**Hierarchical chunking** — a phase-2.0 mitigation, specified but not built: cluster stops
geographically, solve each cluster in T1, then order the clusters and stitch. Reduces a 60-stop
optimization from ~$0.60 to ~$0.03 at a measurable, bounded loss of optimality.

---

### T3 — self-hosted matrix · phase 3 only

Not built. Recorded so the cascade has a defined growth path: a self-hosted OSRM or Valhalla
instance produces the travel-time matrix at near-zero marginal cost, and OR-Tools solves the
TSP over it. Conditions in [ADR-0012](adr/0012-long-term-osm-exit-path.md).

---

## 8. Behaviour

### Round trip and one way

| Mode | Request shape | Notes |
|---|---|---|
| One way | origin, intermediates, destination = last stop | The optimizer chooses which stop is last |
| Round trip | origin, intermediates, destination = origin | Every stop is an intermediate; the return leg is included in the total |

The user toggles this before optimizing. Changing it invalidates the cached result, since the
optimal order genuinely differs between the two.

### Fixed origin, free destination

The origin is always fixed — the user starts where they are. In one-way mode the destination is
free and the optimizer selects it. A user who needs to end somewhere specific pins that stop
(phase 1.x, FR-19).

### Recalculation

Recalculation is triggered by: adding or removing a stop, changing the origin, toggling round
trip, or an explicit re-optimize.

**It is never automatic on every edit.** Optimizing after each stop addition would multiply
cost by the stop count and would reorder the list under the user's finger while they are still
adding to it. The user asks, explicitly, once.

**Mid-route recalculation** (phase 1.x): when stops remain and the user has deviated, the
remaining stops are re-optimized from the current position. Completed stops are excluded;
skipped stops are included at the end unless the user removed them.

### ETA

ETA is `departureTime + totalDuration`, where duration is traffic-aware at the moment of
calculation.

**Server time is authoritative**, never device time — a device with a wrong clock would
otherwise produce a confidently wrong arrival time.

**ETA ages.** A result carries `computedAt`, and the UI shows the age once it exceeds a
threshold: "calculated 2 hours ago". Silent staleness in an ETA is a defect, because the user
is planning their day around it.

### Traffic

Phase 1 uses `TRAFFIC_AWARE` — traffic-informed but cheaper and faster, and compatible with
waypoint optimization. Phase 2 uses `TRAFFIC_AWARE_OPTIMAL` for the highest-quality duration.

Historical traffic prediction for a future departure time is available from the API and is
deferred to phase 1.x, where a user planning tomorrow's route can get a realistic ETA.

### Caching

**Key:** a hash of `(ordered set of place_id, origin place_id, round-trip flag, departure time
bucket)`. The stop set is order-independent for the phase-1 key, because the whole point is
that the order is the output.

**Shared across users.** The key contains no personal data — only public place identifiers —
so two users optimizing the same stop set in the same time bucket share one upstream call.
This is the primary cost lever for a segment whose routes repeat.

**TTL** is short enough that traffic changes invalidate it and long enough to catch
re-optimization after a trivial edit. The value lives in
[`33_API_CONTRACTS.md`](33_API_CONTRACTS.md).

**A cache hit is invisible to the user** except as speed, and is recorded in `usage_events`
with `cacheHit: true` so the cost model can be verified.

---

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0003](adr/0003-tiered-optimization-cascade.md) | Cost-aware cascade T0–T3 | Everything in this document |
| [0011](adr/0011-server-side-quota-enforcement.md) | Quota server-side | Why tier selection cannot live in the client |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates perishable | Re-hydration before an optimization request |
| [0012](adr/0012-long-term-osm-exit-path.md) | OSM exit path | Tier T3, and why the tier boundary is an interface |

**Decided here:** a degraded T0 result is always labelled, and never presented as equivalent to
T1. A heuristic on straight-line distances is genuinely useful when the network is gone and
genuinely worse when it is not; hiding the difference would make the good result
indistinguishable from the compromise.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Fewer than 2 stops | No optimization; the UI does not offer it |
| 2 | Exactly 2 stops | Order is trivially fixed; skip phase 1, run phase 2 only for geometry and ETA |
| 3 | 26th stop attempted | Blocked before the attempt with the limit explained; never a failed request |
| 4 | Duplicate `place_id` in one route | Allowed — a legitimate repeat visit. Treated as distinct stops; the optimizer may place them apart |
| 5 | A stop is unreachable by road (island, pedestrian zone, bad geocode) | Excluded from ordering, returned in `unreachable[]` with a reason, surfaced in the list. **Never silently dropped** |
| 6 | Origin equals the only stop | Route is complete on creation; the app moves straight to handoff |
| 7 | All stops unreachable | Optimization fails with a specific message naming the cause, not a generic error |
| 8 | Optimized order equals the entry order | Stated positively — "already the fastest order" — never presented as a failure or as silence |
| 9 | Departure time in the past | Clamped to now, server-side |
| 10 | Stop coordinates expired | Re-hydrated from `place_id` before the request is built ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)) |
| 11 | Phase 1 succeeds, phase 2 fails | Return the phase-1 order with phase-1 duration, flagged as a lower-precision ETA. The order is the valuable part |
| 12 | Network lost between phases | As above; the order is preserved |
| 13 | Two optimizations requested concurrently | The earlier is cancelled; only the latest result is applied |
| 14 | Stops span an implausible distance (e.g. two countries) | Optimization proceeds — it may be intentional — but the UI notes the unusual total |

## 11. Error handling

| Failure | Detection | User-facing result | Retry | Fallback |
|---|---|---|---|---|
| Upstream 5xx | Edge Function | "Couldn't optimize just now", retry action | Exponential backoff, bounded | T0 if ≤8 stops |
| Upstream timeout | Deadline exceeded | As above | One retry | T0, or queue as a job |
| Upstream 4xx (malformed request) | Edge Function | Generic failure to the user; **full detail to Sentry** — this is our defect | No | None; alert |
| Quota exhausted | Pre-flight check | Limit, reset time, what still works | No | T0, saved routes |
| No entitlement | Pre-flight check | Paywall with restore | No | Read-only own data |
| Some stops unreachable | Response inspection | Partial success; unreachable stops flagged individually | No | Optimize the reachable subset |
| All stops unreachable | Response inspection | Specific failure naming the cause | No | User edits the stops |
| T2 job fails after acceptance | Job status | Job row marked failed; client notified via Realtime | Manual | T1 if the set fits under 25 |
| T0 budget exceeded | Local timer | Best tour found so far is returned | No | Return the current best |

**Universal rule:** on any failure the existing stop order is preserved exactly. A failure that
also destroys the user's manual arrangement is the worst outcome available and is treated as a
severity-one defect.

## 12. Best practices

1. **Never let the client choose a tier.** Tier selection is a cost decision and belongs where
   cost is controlled.
2. **Always use a field mask, and request only what is used.** Field masks determine the
   billing SKU; over-requesting silently raises the price of every call.
3. **Cache before calling, record after.** Every optimization writes a usage event, cache hit
   or not, or the cost model cannot be verified.
4. **Label degraded results everywhere they appear** — list, map, saved route, history. A T0
   result that looks like a T1 result in history will be trusted later.
5. **Preserve order on failure.** Stated twice deliberately.
6. **Test the boundaries, not the middle.** The defects live at 8/9 stops, 25/26 stops,
   sync/async threshold, and cache hit/miss.
7. **Treat an upstream 4xx as our bug.** A malformed request is never the user's fault and must
   alert.

## 13. Checklist

- [ ] Tier selection tested at every boundary: 8, 9, 25, 26 stops; online and offline; with and
      without constraints.
- [ ] Two-phase T1 verified — phase 1 never uses `TRAFFIC_AWARE_OPTIMAL`.
- [ ] Field masks minimal and verified against the intended SKU.
- [ ] `OptimizationResult` identical in shape across all tiers.
- [ ] T0 labelled in the list, on the map, in saved routes and in history.
- [ ] Unreachable stops surfaced individually, never dropped.
- [ ] Order preserved on every failure path, verified by test.
- [ ] Cache key verified order-independent for phase 1.
- [ ] ETA computed from server time.
- [ ] Every optimization recorded in `usage_events`.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | T0, T1, T2 sync and async; round trip and one way; shared cache | — |
| 1.x | Mid-route recalculation; future departure time; pinned stops | Usage data |
| 2.0 | Time windows and priorities (forces T2); hierarchical chunking above 25 stops | Gate D3 in [`28_ROADMAP.md`](28_ROADMAP.md) |
| 3.0 | T3 self-hosted matrix with OR-Tools | An [ADR-0012](adr/0012-long-term-osm-exit-path.md) trigger |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Cascade T0–T3 specified | Cost analysis inverted the brief's single-engine choice | Architecture |
| 2026-08-06 | T0 ceiling set at 8 stops | Quality gap between haversine and road routing widens sharply beyond it | Architecture |
| 2026-08-06 | Two-phase T1 pattern adopted | `optimizeWaypointOrder` is incompatible with `TRAFFIC_AWARE_OPTIMAL` | Architecture |
| 2026-08-06 | Automatic re-optimization on edit rejected | Multiplies cost by stop count; reorders the list under the user's finger | Architecture |

## 16. Rationale

The cascade exists because **engine selection is a cost decision disguised as a technical one**.
Both T1 and T2 solve the user's problem correctly; they differ by a factor of twenty-five in
price on the dominant case. Hard-coding either would be wrong — T2 alone would make the product
unprofitable, T1 alone would cap it permanently at 25 stops.

Tier selection sits on the server because that is where cost is controlled and where the client
cannot be trusted. The user never learns which engine ran, because it does not affect any
decision they make — with the single exception of T0, which does affect their decisions and is
therefore labelled prominently.

T0's 8-stop ceiling deserves its own justification. It would be technically simple to run the
heuristic on 25 stops. It is not offered because a straight-line optimization of 25 urban stops
can be worse than the order the user typed, and shipping a feature that makes the product worse
than not using it is a trap. The ceiling is set where the output is still defensible.

The order-preservation rule is stated in three places in this document because it is the
failure that would most damage trust. A user who has spent two minutes arranging stops by hand
and loses that work to a network error will not spend two minutes again.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Route Optimization API for every request | One engine, one code path, all constraints available | 10–25× more expensive on the dominant case. See [ADR-0003](adr/0003-tiered-optimization-cascade.md). |
| Build the matrix with Google, solve TSP locally | Full algorithmic control; familiar approach | The most expensive option measured: O(n²) billable elements. $3.38 for 25 stops against $0.01. |
| T0 as the default with T1 as an upgrade | Near-zero cost; instant results | Haversine ordering ignores one-way systems and traffic — visibly wrong in exactly the dense urban cases the product targets. |
| Automatic re-optimization after every edit | Always current; removes a tap | Multiplies cost by stop count and reorders the list while the user is still building it. |
| Exposing tier choice to the user | Transparency; user control over cost | Nobody can make this decision usefully. It would surface an implementation detail as a product decision. |
| Single-phase T1 accepting `TRAFFIC_AWARE` ETA | One call instead of two; simpler and cheaper | The ETA is the product's core promise. The second call costs about a cent and materially improves the number the user plans their day around. |
