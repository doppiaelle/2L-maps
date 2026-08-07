# ADR-0008 — Offline means your own data, never offline maps

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Architecture
**Implements decisions:** C4 (see [`35_RISK_REGISTER.md`](../35_RISK_REGISTER.md))

---

## Context

The brief lists an offline mode among the required documents. For a tool used by drivers —
in vans, in industrial areas, in rural Italy, in underground car parks — offline capability
is not a luxury feature. The natural reading of "offline mode" for a map application is
downloadable offline maps, as Google Maps itself offers.

That reading is not available to us. Three constraints compound:

1. **Map tile caching and bulk pre-fetching are prohibited** by the Google Maps Platform
   terms. There is no compliant path to storing a map area for offline display.
2. **Coordinates expire after 30 days** ([ADR-0007](0007-place-id-durable-coordinates-perishable.md)),
   so even the geometry of saved stops is not permanently available locally.
3. **Every optimization tier except T0 requires the network**
   ([ADR-0003](0003-tiered-optimization-cascade.md)).

Writing an offline specification that promises downloadable maps would produce a document
that reads well and cannot be implemented — the worst possible outcome for a specification
whose purpose is to direct future development.

## Decision

**Offline capability is defined as uninterrupted access to the user's own data and to the
last computed result — never as offline map rendering.**

The offline contract, stated positively, is what the app guarantees without a network:

| Available offline | Mechanism |
|---|---|
| Saved routes and their stop order | Local persistence of user-owned rows |
| The address book: favourites, recents, labels | Local persistence, keyed by `place_id` |
| Route history | Local persistence |
| The most recently computed route: order, per-leg distance and duration, ETA | Cached optimization result |
| The last rendered map view, until the OS evicts it | Incidental SDK behaviour — **never presented as a feature** |
| Adding, reordering, renaming and deleting stops | Queued mutations |
| T0 optimization for ≤8 stops | Local heuristic over a haversine matrix |

The offline contract, stated negatively — what the app must say plainly rather than fail
silently at:

| Unavailable offline | User-facing behaviour |
|---|---|
| Map tiles outside what the OS happens to hold | Map surface shows an explicit offline state, not a blank grey field |
| Address search and autocomplete | Search field disabled with an explanation; the local address book remains searchable |
| T1 and T2 optimization | Offer T0 if ≤8 stops, clearly labelled as degraded; otherwise queue the request and tell the user it will run on reconnection |
| Traffic-aware ETA | Show the last known ETA with its age, e.g. "calculated 3 hours ago" |
| Navigation handoff | External apps have their own offline behaviour; the app states it is handing off and does not pretend to guarantee anything beyond that |

**Mutations made offline are queued and reconciled on reconnection**, with last-write-wins on
a per-field basis and an explicit conflict surface only when the same route was edited on two
devices. Specified in [`11_STATE_MANAGEMENT.md`](../11_STATE_MANAGEMENT.md).

**Degraded results are always labelled.** A T0 result carries a visible marker in the UI and
a flag in its stored record, so a user never mistakes a straight-line heuristic for a
traffic-aware optimization.

## Consequences

**Positive.** The specification is implementable exactly as written, and the app is honest
about its limits. A driver who loses signal keeps their list, their order and their ETA —
which is most of the practical value.

**Positive.** The offline states become a design surface rather than an error surface. The
map's offline appearance is specified in [`08_SCREEN_SPECIFICATIONS.md`](../08_SCREEN_SPECIFICATIONS.md)
as a deliberate state, in keeping with the visual direction.

**Negative.** The app is measurably weaker than Google Maps on this axis, and a competitor
built on OSM data could offer genuine offline maps legally. This is a real competitive gap
and it is the strongest single argument for the migration path in
[ADR-0012](0012-long-term-osm-exit-path.md).

**Negative.** Store listings and marketing must avoid implying offline maps. A screenshot or
description that suggests it invites both a review rejection and a terms complaint. Noted in
[`26_APP_STORE.md`](../26_APP_STORE.md) and [`27_PLAY_STORE.md`](../27_PLAY_STORE.md).

**Negative.** Queued mutations and reconciliation add genuine complexity to state management
for a feature most users will exercise rarely. Accepted because the users who do exercise it
are exactly the target segment, at exactly the moment they most need the app to work.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Downloadable offline maps, as Google Maps offers | The feature users actually expect from a map application | Prohibited by the platform terms. Not a trade-off — an exclusion. |
| No offline capability at all | Simplest; no queue, no reconciliation, no degraded states | The target segment loses signal routinely. An app that shows nothing without a network is unusable in a van, and would be judged so in reviews. |
| Offline maps via a second, OSM-based map layer | Legal offline tiles alongside the Google experience | The "No Use With Non-Google Maps" clause forbids showing Google-derived stops or routes on it, so the offline map would be an empty map — and shipping two map engines doubles the native surface. |
| Optimistic offline with silent degradation | Never blocks the user; feels seamless | A user acting on a stale ETA or an unlabelled straight-line order makes real driving decisions on bad data. Silence here is a product defect, not a convenience. |

## References

- [`docs/17_OFFLINE_MODE.md`](../17_OFFLINE_MODE.md) — full offline specification
- [`docs/11_STATE_MANAGEMENT.md`](../11_STATE_MANAGEMENT.md) — mutation queue and reconciliation
- [ADR-0007](0007-place-id-durable-coordinates-perishable.md) — the 30-day coordinate rule
- [ADR-0003](0003-tiered-optimization-cascade.md) — T0, the offline optimization tier
