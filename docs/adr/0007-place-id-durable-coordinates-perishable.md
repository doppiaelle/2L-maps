# ADR-0007 — `place_id` is the durable key; coordinates are a 30-day cache

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Architecture
**Implements decisions:** C4 (see [`35_RISK_REGISTER.md`](../35_RISK_REGISTER.md))

---

## Context

A route planner's most natural schema stores each stop with its latitude and longitude, and
keeps them forever. That schema is not permitted.

The Google Maps Platform Service Specific Terms draw a sharp line between two kinds of
content:

- **`place_id` is exempt from the caching restrictions and may be stored indefinitely.** It
  is the identifier Google intends applications to persist.
- **Latitude and longitude may be cached for at most 30 consecutive calendar days**, after
  which the cached values must be deleted. The same 30-day limit recurs across the Places,
  Geocoding and Directions terms.

Bulk pre-fetching and caching of map tiles are separately prohibited.

The product stores saved routes, a customer address book and history — all long-lived by
design. A naive schema would put us in continuous violation from the first saved route, and
the violation would be invisible until an audit.

## Decision

**`place_id` is the durable identity of every location.** It is the foreign key that routes,
stops, favourites and history all point at. It never expires and is never purged.

**Coordinates are modelled explicitly as a perishable cache**, not as attributes of the
place. The `places_cache` table carries:

```sql
place_id            text primary key   -- durable, never purged
formatted_address   text               -- perishable, refreshed with coordinates
lat                 double precision   -- perishable
lng                 double precision   -- perishable
coords_refreshed_at timestamptz not null
```

**A scheduled job enforces the 30-day boundary.** Rows whose `coords_refreshed_at` is older
than 30 days have `lat`, `lng` and `formatted_address` set to `NULL`; `place_id` is retained.
The job runs daily, well inside the window, and its execution is monitored — a silently
failed purge job is a compliance breach, so its failure is an alert, not a log line.

**Missing coordinates are a normal state, not an error.** Any code path that needs
coordinates must handle `NULL` by re-resolving the `place_id` through Place Details. The
resolution is transparent to the user: a saved route opened after two months re-hydrates its
coordinates on load.

**The user's own typed text is ours, not Google's.** A stop's user-assigned label, notes and
ordering are original content, stored indefinitely, and unaffected by the purge. What expires
is Google-derived content only. This distinction is what makes saved routes durable at all.

## Consequences

**Positive.** Compliance is structural rather than procedural. The schema makes the correct
behaviour the default one, instead of relying on developers remembering a terms clause.

**Positive.** Re-hydration on demand keeps saved routes useful indefinitely without storing
prohibited data.

**Negative.** Opening an old route may require a burst of Place Details calls, which cost
money and add latency. Mitigated by batching the re-resolution, by the shared cache in
[ADR-0006](0006-mandatory-backend-proxy.md) — another user may have refreshed the same place
recently — and by a skeleton state while re-hydration runs.

**Negative.** Every query touching coordinates must tolerate `NULL`. This is a real burden
spread across the codebase. Made explicit in [`12_DATABASE.md`](../12_DATABASE.md) and
enforced by types: the coordinate fields are nullable in the generated TypeScript, so the
compiler refuses to let a caller ignore the case.

**Negative and important.** Offline mode cannot mean offline maps. Tile caching is prohibited
and coordinates expire. What "offline" can honestly mean for this product is defined in
[ADR-0008](0008-offline-scope.md).

**Constraint inherited.** The 30-day rule applies to any Google-derived coordinate anywhere —
including analytics payloads and crash-report breadcrumbs. Covered in
[`21_ANALYTICS.md`](../21_ANALYTICS.md) and [`32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md).

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Store coordinates permanently | Simplest schema; no purge job; no `NULL` handling; instant route loads | Direct violation of the platform terms. Risks account termination, which would end the product. Not a trade-off. |
| Store only `place_id`, resolve every time | Unambiguously compliant; no purge job needed | Every route open becomes N Place Details calls. Places already dominates COGS ([`31_COST_MODEL.md`](../31_COST_MODEL.md)); this multiplies the dominant cost and makes the app unusable offline. |
| Re-geocode from the address string instead of `place_id` | Avoids storing an opaque Google identifier | Geocoding a free-text address is lossy and non-deterministic — it can resolve to a different building. `place_id` is stable and is the mechanism Google provides for exactly this purpose. |
| Own geocoding via OSM/Nominatim to escape the restriction | Coordinates become ours to keep forever | Mixing OSM coordinates with a Google map violates the "No Use With Non-Google Maps" clause, and Italian address quality from Nominatim is materially worse. This is the whole-stack fork in [ADR-0012](0012-long-term-osm-exit-path.md), not a storage tactic. |

## References

- [`docs/12_DATABASE.md`](../12_DATABASE.md) — full schema, indexes, RLS, purge job
- [`docs/32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md) — terms analysis and obligations
- [ADR-0008](0008-offline-scope.md) — what offline can mean given this constraint
