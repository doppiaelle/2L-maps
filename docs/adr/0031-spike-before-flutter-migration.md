# ADR-0031 — Hybrid-routing and guidance spike before Flutter migration

**Status:** Accepted  
**Date:** 2026-08-20  
**Deciders:** Product owner  
**Related:** ADR-0010, ADR-0013, ADR-0014, ADR-0030

---

## Context

HERE officially supports Flutter but not React Native. The target also combines two independent
online services—ORS/VROOM for ordering and HERE for the final ordered route—with an app-owned
guidance kernel. The migration must prove provider contracts, quota behavior, solution quality,
map integration, and route following before replacing the implemented Expo client.

The largest product limitation is intentional: ORS orders against its own travel-cost model and
VROOM is heuristic. HERE then calculates the final route and live-traffic ETA for that fixed order.
The spike must measure this seam rather than label it an exact, live-traffic optimum.

## Decision

Run a disposable, seven-engineering-day Flutter vertical-slice spike after all prerequisites exist.

### Prerequisites

- an ORS account/key whose dashboard and terms confirm commercial product use, actual
  `/optimization` daily/minute quota, and request-size limits for one vehicle and 5–25 jobs;
- a HERE Base Plan account confirming Explore package access, ordered-via Routing v8 eligibility,
  response fields, geocoding retention, and billing units;
- a private CI delivery path for the proprietary, pinned HERE SDK package;
- server-only test credentials and independent ORS/HERE circuit-breaker budgets.

### Spike scope

1. Send one vehicle and 5, 15, and 25 jobs through a Supabase ORS adapter with fixed start and
   optional fixed return.
2. Validate stable internal IDs, every job exactly once, and explicit handling of unassigned,
   duplicate, missing, malformed, timeout, quota, and upstream-error responses.
3. Benchmark VROOM's best order against exact solutions for small fixtures and representative
   routes. Record the gap; never make exactness a pass criterion or product claim.
4. Send the returned order to one HERE Routing v8 HTTP request and request supported polyline,
   summary, route handle, and `turnByTurnActions`. Measure actual account transactions rather than
   equating one HTTP request with one billed transaction.
5. Prove that HERE is never called for Matrix, Waypoints Sequence, Tour Planning, or stop ordering.
6. Render the route with HERE SDK Explore and the first custom 2L style on Android and iOS.
7. Replay traces covering normal travel, GPS noise, parallel roads, missed turns, roundabouts,
   pauses, jumps, app interruption, and stale/changed route versions.
8. Exercise pure-Dart projection, monotonic progress, confidence/hysteresis, maneuver selection,
   staged visual/TTS prompts, sustained deviation, bounded rerouting, arrival, next-leg transition,
   restoration, and current-leg external handoff.
9. Measure binary size, cold start, first map frame, CPU, memory, battery, GPS cadence, ORS/HERE
   calls and transactions, reroute loops, and false/late/missed maneuvers.
10. Prove circuit breakers, cache/retry policy, visible degraded states, and that GPS frequency does
    not determine upstream-call frequency.

### Passing conditions

Numeric thresholds are committed in the spike PR before implementation. The spike fails if:

- ORS terms/quota do not support the intended product, or 25-stop requests are not accepted;
- solution-quality measurements exceed the predeclared gap/failure threshold;
- any input job is lost, duplicated, or silently unassigned;
- HERE does not authorize ordered-via final routing or actual billing breaks the free-plan budget;
- a supported platform cannot reproducibly render the styled Explore map;
- guidance advances on a nearby parallel road without ambiguity suppression;
- GPS noise causes reroute loops, or a missed turn produces neither safe reroute nor degradation;
- restoration silently resumes a different route/version;
- both in-app guidance and current-leg external fallback can become unavailable;
- the implementation requires a Navigate-exclusive feature or HERE optimization service.

If it passes, Flutter becomes the production runtime. If it fails, reduce the guidance/optimization
promise, retain manual/external flow, self-host an approved solver stack, or change the commercial
plan/provider. Do not hide the failed scenario or build an unsupported React Native bridge.

## Consequences

The spike validates the real cross-provider seam and safety risks before a rewrite. Pure Dart
geometry/state machines and replay fixtures can be promoted deliberately; the disposable UI and
provider wiring are not production code.

Passing simulations is necessary but insufficient. Production still requires controlled road tests
on Android and iOS, quota/availability monitoring, and an honest degraded mode. Public ORS has no
product SLA, Explore has no HERE Positioning/map matching, and the final order is not HERE
live-traffic-optimal.

## Evidence and references

Checked 2026-08-20:

- [ORS public-service restrictions](https://openrouteservice.org/restrictions/)
- [ORS Optimization service](https://openrouteservice.org/services/)
- [VROOM solver](https://github.com/VROOM-Project/vroom)
- [HERE SDK examples](https://github.com/heremaps/here-sdk-examples)
- [HERE SDK Flutter editions](https://docs.here.com/here-sdk/docs/flutter-introduction-editions)
- [HERE Routing API v8](https://docs.here.com/routing/reference/routing-api-v8-calculateroutespost)
- [Migration program and gates](../41_HERE_MIGRATION_PROGRAM.md)

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Rewrite immediately | Commits before quota, contract, billing, provider seam, and guidance evidence |
| Test only the map | Ignores optimizer correctness, cross-provider mismatch, and safety-critical route following |
| React Native bridge comparison | HERE has no official RN SDK; it adds two native surfaces without reducing kernel risk |
| Ideal traces only | Misses ambiguity and reroute failure modes |
| Exact/live-traffic marketing claim | Unsupported by VROOM's heuristic and ORS/HERE cost-model split |
