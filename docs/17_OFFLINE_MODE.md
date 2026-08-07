# 17 — Offline Mode

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0008](adr/0008-offline-scope.md) · [`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md) · [`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)

---

> **Scope warning.** Offline here means **access to your own data and your last computed route**.
> It does **not** mean offline maps. Tile caching and bulk pre-fetching are prohibited by the
> Google Maps Platform terms, and coordinates expire after 30 days
> ([ADR-0008](adr/0008-offline-scope.md)). Any store listing, screenshot or copy implying
> downloadable maps is both a terms violation and a false claim.

---

## 1. Purpose

This document specifies exactly what the product does and does not do without a network, and how
each unavailable capability is communicated.

Offline is not an edge case for this product. Elena works in basements and boiler rooms; Marco
drives through rural Lombardy and underground car parks. Signal loss is a daily condition, not a
failure.

## 2. Goals

1. Keep the user's list, order and last ETA available at all times.
2. Make every unavailable capability explicit rather than silently broken.
3. Queue mutations so no work is lost.
4. Offer a degraded but honest optimization where it is defensible.

**Non-goals.** No offline maps. No offline address search. No pretence of traffic data.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Connectivity detection | Client | Debounced; flapping must not thrash the UI |
| Offline data availability | Persisted React Query cache + Zustand | [`11`](11_STATE_MANAGEMENT.md) |
| Mutation queue | `mutationQueueStore` | Drains in order on reconnection |
| T0 optimization | Shared pure code, client-side | [`15`](15_ROUTE_OPTIMIZATION.md) |

---

## 4. Text diagrams

### The offline contract

```
  ┌──────────── AVAILABLE OFFLINE ─────────────────────────────┐
  │  saved routes, stop order, labels, notes                    │
  │  address book: recents and favourites                       │
  │  route history                                              │
  │  last computed route: order, per-leg distance and duration  │
  │  last ETA — SHOWN WITH ITS AGE                              │
  │  add, reorder, rename, delete stops (queued)                │
  │  T0 optimization, ≤8 stops, labelled degraded               │
  │  navigation handoff — the external app has its own offline  │
  └─────────────────────────────────────────────────────────────┘

  ┌──────────── UNAVAILABLE OFFLINE ───────────────────────────┐
  │  map tiles beyond whatever the OS happens to hold           │
  │  address search and autocomplete                            │
  │  T1 and T2 optimization                                     │
  │  fresh traffic and ETA                                      │
  │  coordinate re-hydration for expired stops                  │
  │  subscription purchase and restore                          │
  └─────────────────────────────────────────────────────────────┘

  Each unavailable item has a DESIGNED STATE. None shows a
  spinner, a blank screen, or a generic error.
```

### Degradation ladder

```
  online, fresh          T1/T2 optimization · live traffic · full search
        │
        │ network lost
        ▼
  offline, ≤8 stops      T0 optimization, labelled "estimated without traffic"
        │                own data fully available · edits queued
        │
        │ more than 8 stops
        ▼
  offline, >8 stops      no new optimization. Last result shown with its age.
                         Request queued to run on reconnection.
```

---

## 5. Behaviour

### Detection

Connectivity changes are **debounced**. A brief drop while driving under a bridge must not flip
the interface into and out of offline state repeatedly — that flicker is worse than either steady
state.

The indicator is **persistent but unobtrusive**: a small element in the sheet header, never a
banner that consumes space every day to communicate a condition the user already knows about.

### Data

The persisted React Query cache serves saved routes, history and the address book; the persisted
Zustand stores serve the draft route and progress ([`11`](11_STATE_MANAGEMENT.md)). Both are
written continuously, not on a schedule — the network disappears without warning.

### The ETA problem

An offline ETA is the most dangerous piece of information in the product, because it looks
authoritative and the user plans their day around it.

**Every ETA older than 15 minutes shows its age:** "arriving 14:30 · calculated 2 hours ago".
Beyond 2 hours the ETA is de-emphasised to a secondary style, because rush-hour traffic makes a
two-hour-old estimate close to fiction.

The distance and the stop order remain accurate — roads do not move — so those are presented
without qualification.

### Mutations

Edits apply locally and immediately, then queue. The user sees no difference between an online
and an offline edit, which is correct: the edit *has* happened, from their perspective.

Queued mutations are visible in the sheet as a small pending count — not to worry the user, but
so that "my change did not sync" is diagnosable rather than mysterious.

### Optimization

| Stops | Offline behaviour |
|---|---|
| ≤ 8 | T0 offered, clearly labelled degraded, with dashed connectors on the map |
| > 8 | Not offered. The request is queued and runs automatically on reconnection, with the last result still shown |

The 8-stop ceiling is a **quality** boundary, not a performance one: beyond it, straight-line
ordering can be worse than the user's own arrangement
([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)).

### Handoff

Handoff works offline — it is a URL open. Whether the external app functions without a network is
its own concern, and **the app does not claim otherwise**. Google Maps and Waze both have their
own offline behaviour that the user already understands.

### Reconnection

1. The queue drains in order.
2. Entitlement refetches.
3. Any queued optimization runs.
4. The ETA refreshes.
5. The indicator disappears.

All of this is silent unless something needs the user's attention — a genuine reorder conflict,
or a queued item that failed permanently.

---

## 6. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Network flapping | Debounced; the interface does not thrash |
| 2 | Offline with expired coordinates | Affected stops show a "needs connection" state; the rest of the route works |
| 3 | Offline at app launch | Full read access from persisted state; no blocking spinner |
| 4 | Offline during a route in progress | Progress and handoff both continue to work |
| 5 | Queue drains partially, then disconnects again | Successful items removed; the rest remain queued |
| 6 | Queued optimization arrives after the user edited the route | Discarded; a fresh optimization is offered |
| 7 | Offline for 30+ days, route reopened | Coordinates expired and cannot re-hydrate; stops show a needs-connection state, labels intact |
| 8 | Trial expires offline | Cached entitlement honoured; reconciled on reconnection |
| 9 | Storage full while queueing | User informed; edits continue in memory for the session |
| 10 | Airplane mode toggled mid-optimization | Request fails; order preserved; T0 offered if ≤8 stops |
| 11 | Captive portal (connected but no internet) | Requests fail; treated as offline after the first failure, not by connectivity flag alone |

Case 11 matters more than it appears: hotel and service-station Wi-Fi report "connected" while
blocking traffic, and a connectivity flag alone would leave the app waiting on requests that can
never complete.

## 7. Error handling

| Failure | User-facing result | Fallback |
|---|---|---|
| Search attempted offline | Field disabled with a reason; address book still searchable | Address book |
| Optimization attempted offline, >8 stops | Queued, with confirmation; last result retained | Queued |
| Map tiles unavailable | Explicit offline map state, **never a blank grey field** | Markers on a neutral surface |
| Queued mutation permanently fails | Surfaced with discard or retry | Manual |
| Reorder conflict on sync | Both versions presented; user chooses | Explicit resolution |
| Purchase attempted offline | Clear message that a connection is required | Retry when online |

## 8. Best practices

1. **Persist continuously**, never on a timer. The network vanishes without warning.
2. **Debounce connectivity changes.**
3. **Show the age of any stale ETA**, always.
4. **Never show a spinner for something that cannot complete.**
5. **Label degraded optimization everywhere**, including in history weeks later.
6. **Detect captive portals by request failure**, not by connectivity flag.
7. **Test in real airplane mode**, on a physical device — simulated offline states hide timing
   problems.
8. **Never imply offline maps** in the product, the store listing, or a screenshot.

## 9. Checklist

- [ ] All items in the "available offline" list verified in genuine airplane mode.
- [ ] Every unavailable capability has a designed state, verified.
- [ ] No blank screens and no indefinite spinners in any offline state.
- [ ] ETA age displayed beyond 15 minutes; de-emphasised beyond 2 hours.
- [ ] T0 offered at ≤8 stops and labelled in list, map and history.
- [ ] Queue drains in order; interrupted drains verified.
- [ ] Reorder conflicts surface; all others resolve silently.
- [ ] Captive-portal behaviour verified.
- [ ] Handoff verified to work offline.
- [ ] No product or store copy implies offline maps.

## 10. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Full contract above | — |
| 1.x | Background sync on reconnection without foregrounding | Platform capability |
| 1.x | Pre-emptive coordinate refresh when a route is likely to be used offline | Usage patterns |
| 3.0 | Genuine offline maps — **only** under the OSM stack | An [ADR-0012](adr/0012-long-term-osm-exit-path.md) trigger |

## 11. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Offline scoped to own data; no offline maps | Tile caching prohibited by platform terms | Architecture |
| 2026-08-06 | ETA age displayed beyond 15 minutes | A stale ETA presented confidently is the product's most dangerous output | Design |
| 2026-08-06 | T0 ceiling of 8 stops applies offline too | Quality boundary, not a performance one | Architecture |
| 2026-08-06 | Captive portals detected by request failure | A connectivity flag reports "connected" on blocked networks | Architecture |

## 12. Rationale

The honesty constraint drives this entire document. Every capability the product cannot deliver
offline is stated plainly, because the alternative — a spinner that never resolves, a blank map,
a confidently stale ETA — is worse than a clear limitation. The user is in a basement or a
tunnel; they know the network is gone. What they need is to know the app still holds their day.

The ETA aging rule is the most important behavioural decision here. Distance and stop order stay
true offline because roads do not move, but travel time is entirely a function of conditions that
change hourly. An ETA shown without its age invites the user to plan around a number that may be
badly wrong, and they would have no way to know.

The offline gap is also the strongest argument for the migration path in
[ADR-0012](adr/0012-long-term-osm-exit-path.md). A competitor built on OSM data can legally ship
downloadable maps, which for a courier in a rural area is a genuine advantage. Recording that
honestly here — rather than pretending the limitation is a design choice — is what makes the
trigger meaningful when it fires.

## 13. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Downloadable offline maps | The feature users expect from a map app | Prohibited by the platform terms. An exclusion, not a trade-off |
| No offline capability at all | Far simpler: no queue, no reconciliation, no degraded states | The target segment loses signal daily. An app that shows nothing in a basement is unusable |
| A second OSM map layer for offline use | Legal offline tiles alongside the Google experience | Google-derived stops and routes cannot be shown on it, so the offline map would be empty. Also doubles the native surface |
| Optimistic offline with silent degradation | Seamless; never blocks the user | The user makes driving decisions on this data. Silence about a stale ETA is a product defect |
| ETA hidden entirely when stale | Avoids showing a possibly wrong number | The user often still wants a rough figure. Showing it with its age respects their judgement |
| Connectivity flag alone for detection | Simple; built into the platform | Captive portals report connected while blocking traffic, leaving the app waiting forever |
