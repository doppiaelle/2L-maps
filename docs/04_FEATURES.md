# 04 — Features

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md) · [`28_ROADMAP.md`](28_ROADMAP.md) · [`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md)

---

## 1. Purpose

This document is the feature inventory: what the product does, what each feature costs to run,
what it depends on, and — for everything excluded — the specific reason it is not here.

The exclusion list is as important as the inclusion list. Most of this product's risk comes
from plausible features that would break its economics, its terms compliance, or its focus.

It does not describe screens ([`08`](08_SCREEN_SPECIFICATIONS.md)), components
([`09`](09_COMPONENT_LIBRARY.md)) or mechanisms (area documents).

## 2. Goals

1. Enumerate every feature with its priority, dependencies and running cost.
2. Make the cost of each feature visible at the point where scope is decided.
3. Record every excluded feature with a reason precise enough to re-decide later.
4. Group features so a release can be cut along a clean line.

**Non-goals.** No implementation, no design, no schedule.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Feature inventory and priority | Product owner | Priority changes require a decision-log entry |
| Cost annotation | Architecture | Sourced from [`31_COST_MODEL.md`](31_COST_MODEL.md) |
| Exclusion rationale | Product owner | An exclusion without a reason will be re-litigated forever |

---

## 4. Text diagrams

### Feature groups and dependencies

```
   ┌─────────────┐
   │  Account    │  auth · entitlement · quota
   └──────┬──────┘
          │ required by everything metered
   ┌──────▼──────────────────────────────────────┐
   │  Stops                                      │
   │  search · address book · import · edit      │
   └──────┬──────────────────────────────────────┘
          │
   ┌──────▼──────────────────────────────────────┐
   │  Optimization        ◀── the product        │
   │  T0–T2 cascade · round trip · re-optimize   │
   └──────┬──────────────────────────────────────┘
          │
   ┌──────▼───────────┐        ┌─────────────────┐
   │  Preview         │        │  Persistence    │
   │  map · markers   │        │  save · history │
   │  polyline · ETA  │        │  favourites     │
   └──────┬───────────┘        └─────────────────┘
          │
   ┌──────▼───────────┐
   │  Handoff         │  provider choice · chunking · progression
   └──────────────────┘

   Cross-cutting: Offline · Settings · Paywall
```

### Cost legend

Used in the tables below. Full derivation in [`31_COST_MODEL.md`](31_COST_MODEL.md).

```
  ○  free            no upstream call
  ◔  low             cached or amortised; a fraction of a cent
  ◑  metered         ~$0.01 per use
  ●  expensive       scales with stop count — quota-critical
```

---

## 5. Features — MVP

### Account

| Feature | Priority | Cost | Depends on |
|---|---|---|---|
| Sign in with Apple | MUST | ○ | Supabase Auth |
| Google Sign-In | MUST | ○ | Supabase Auth |
| 7-day trial, auto-converting | MUST | ○ | RevenueCat, [`20`](20_SUBSCRIPTIONS.md) |
| Server-side entitlement | MUST | ○ | [ADR-0011](adr/0011-server-side-quota-enforcement.md) |
| Restore purchases | MUST | ○ | RevenueCat |
| Account deletion with full data erasure | MUST | ○ | GDPR, Apple requirement |

### Stops

| Feature | Priority | Cost | Notes |
|---|---|---|---|
| Places autocomplete search | MUST | ◑ | **The largest single COGS line.** Session tokens mandatory, 300 ms debounce, 3-character minimum |
| Address book: recents | MUST | ○ | `place_id` reuse is free — always offered before search |
| Current location as origin | MUST | ○ | Device GPS, no upstream call |
| Manual reorder by drag | MUST | ○ | Local only |
| Remove stop with undo | MUST | ○ | Local only |
| User label per stop | MUST | ○ | User content, stored indefinitely |
| 2–25 stop range with the limit stated in advance | MUST | ○ | Enforced client and server |
| Favourites | SHOULD | ○ | `place_id` reuse |
| List import: pasted text or CSV | SHOULD | ◔ | **Geocoding batch, never autocomplete** — materially cheaper |
| Stop notes | COULD | ○ | — |

### Optimization

| Feature | Priority | Cost | Notes |
|---|---|---|---|
| One-action optimize | MUST | ◑ | Tier chosen server-side, invisible to the user |
| Tier T1 — Routes API `optimizeWaypointOrder` | MUST | ◑ | The default path; ~$0.01 regardless of stop count |
| Tier T2 — Route Optimization API | MUST | ● | Above 25 stops or with constraints; bills per stop |
| Tier T0 — local heuristic | MUST | ○ | Offline or upstream failure, ≤8 stops, always labelled |
| Traffic-aware ETA | MUST | ◑ | Second call with `TRAFFIC_AWARE_OPTIMAL` |
| Round trip / one way | MUST | ○ | Request shape only |
| Re-optimize after edits | MUST | ◑ | Same cost as the first |
| Unreachable stop reporting | MUST | ○ | Derived from the response |
| Per-leg distance and duration | MUST | ○ | Included in the response |
| Shared result cache | MUST | ○ *(saves)* | Content-keyed; the main lever against COGS |
| Pinned stop, excluded from reordering | COULD | ◑ | Supported by T1 |
| Time windows | WON'T | ● | Forces T2 on every route — see §7 |

### Preview and map

| Feature | Priority | Cost | Notes |
|---|---|---|---|
| Route polyline | MUST | ○ | Decoded from the optimization response |
| Numbered ordinal markers | MUST | ○ | — |
| Selected marker state and detail | MUST | ○ | — |
| Marker clustering | MUST | ○ | Above 15 markers |
| Camera fit to route | MUST | ○ | — |
| Light and dark map styles | MUST | ○ | Cloud-based Map Styling, one Map ID per theme |
| Pan, zoom, gestures | MUST | ○ | — |
| Traffic layer toggle | SHOULD | ○ | Native SDK layer |
| Satellite toggle | COULD | ○ | — |
| Route snapshot export | COULD | ○ | Attribution obligations apply |

### Handoff

| Feature | Priority | Cost | Notes |
|---|---|---|---|
| Installed-provider detection | MUST | ○ | Build-time scheme declarations required |
| Provider choice with a remembered default | MUST | ○ | — |
| Chunked handoff, Google Maps, ~9 stops | MUST | ○ | Only provider accepting multiple waypoints |
| Leg-by-leg handoff — Waze, Apple Maps | MUST | ○ | Single destination each |
| Done / Skip progression | MUST | ○ | — |
| Progress survives process death | MUST | ○ | — |
| Live Activity / persistent notification | COULD | ○ | — |
| Geofenced arrival detection | COULD | ○ | Opt-in; background location, App Review scrutiny |

### Persistence and offline

| Feature | Priority | Cost | Notes |
|---|---|---|---|
| Save and reopen a route | MUST | ○ | — |
| History of completed routes | MUST | ○ | — |
| Transparent coordinate re-hydration | MUST | ◔ | Batched Place Details after 30 days |
| Offline read of own data | MUST | ○ | — |
| Offline mutation queue | MUST | ○ | — |
| Offline explicit states | MUST | ○ | Never a blank screen or an endless spinner |
| Duplicate a route | SHOULD | ○ | — |
| Time saved on completion | SHOULD | ○ | Computed difference, never estimated |

---

## 6. Features — deferred

| Feature | Phase | Blocked by |
|---|---|---|
| Live Activity route progress | 1.1 | MVP stability |
| Geofenced arrival | 1.2 | Permission-acceptance data; App Review preparation |
| CSV column mapping | 1.1 | Import usage data |
| Stop notes and photos | 1.2 | Storage cost model |
| Route sharing | 1.2 | Attribution and privacy review |
| Time windows | 2.0 | Requires T2 by default; needs a pricing tier that supports it |
| Multi-vehicle | 3.0 | A different product — [ADR-0002](adr/0002-target-segment-and-monetization.md) |
| Web companion | 3.0 | [ADR-0010](adr/0010-mobile-only-scope.md) |
| Self-hosted matrix, tier T3 | 3.0 | A trigger in [ADR-0012](adr/0012-long-term-osm-exit-path.md) |

---

## 7. Features — excluded, with reasons

**These are not "later". They are decided against.** Each entry records what would have to
change for the decision to be revisited.

| Feature | Why excluded | Would be reconsidered if |
|---|---|---|
| **In-app turn-by-turn navigation** | Requires the Navigation SDK, which cannot coexist with the Maps SDK — adopting it would force rebuilding the entire planning map on a Beta pre-1.0 component ([ADR-0004](adr/0004-external-navigation-handoff.md)) | The RN wrapper reaches 1.0 with clustering and custom markers at parity |
| **Offline downloadable maps** | Tile caching and bulk pre-fetch are prohibited by the Google Maps Platform terms ([ADR-0008](adr/0008-offline-scope.md)) | Only under the OSM stack in [ADR-0012](adr/0012-long-term-osm-exit-path.md) |
| **Permanent free tier** | Each free user costs $0.30–0.80 every month indefinitely; at a 10:1 ratio the free base consumes the paid base's margin ([ADR-0002](adr/0002-target-segment-and-monetization.md)) | COGS per user falls by an order of magnitude — i.e. tier T3 |
| **Time windows in the MVP** | Forces tier T2 on every optimization, changing cost from $0.01 per route to $0.01 per stop | A higher-priced tier exists to carry it |
| **Multi-vehicle assignment** | A dispatcher product: needs a web dashboard, driver accounts, roles, B2B invoicing | Deliberate strategic pivot, not a feature request |
| **Advertising** | Per-user COGS is real and recurring; ad revenue at this scale would not cover Places alone, and advertising to a driver is user-hostile | Never |
| **Social features, sharing routes publicly** | No user need in the target segment; adds privacy surface around customer addresses | Never for customer addresses |
| **Non-Google map rendering** | Prohibited per API — Google-derived content may not be shown on a non-Google map | Only as part of a full stack migration |
| **Storing coordinates permanently** | Direct terms violation; risks account termination ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)) | Never |
| **Email/password sign-up** | An extra form on first launch costs more users than it serves, and adds password-reset surface | Demonstrated demand from users without Apple or Google accounts |
| **CarPlay / Android Auto** | The app is a planner, not a navigator; the handoff target already provides in-car navigation | Only alongside in-app navigation |

---

## 8. Edge cases

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|
| 1 | Import exceeds 25 stops | First 25 accepted, limit explained, remainder offered as a second route | [`08`](08_SCREEN_SPECIFICATIONS.md) |
| 2 | Import contains duplicates | Kept — a repeat visit is legitimate; flagged so the user can decide | [`15`](15_ROUTE_OPTIMIZATION.md) |
| 3 | Favourite's `place_id` no longer resolves | Row flagged as needing attention; the user's label is preserved | [`12`](12_DATABASE.md) |
| 4 | No navigation app installed | Web universal link, which always works | [`16`](16_INTERNAL_NAVIGATION.md) |
| 5 | Traffic layer enabled offline | Toggle disabled with the reason shown | [`17`](17_OFFLINE_MODE.md) |
| 6 | Optimization returns the entry order unchanged | Stated positively: "already the fastest order" — not silence | [`08`](08_SCREEN_SPECIFICATIONS.md) |
| 7 | Cache hit on optimize | Result returned without an upstream call; the user perceives only speed | [`13`](13_BACKEND.md) |

## 9. Error handling

| Failure | Feature | Result | Fallback |
|---|---|---|---|
| Autocomplete unavailable | Stop search | Search disabled with reason; address book still works | Address book, manual entry |
| Geocoding fails for some rows | Import | Split into resolved and needs-attention | Proceed with what resolved |
| Optimization upstream fails | Optimize | Order preserved; retry offered | T0 if ≤8 stops |
| Map style ID fails | Preview | Default Google style silently | Default style |
| Provider scheme rejected | Handoff | Provider hidden from the list | Web universal link |
| Snapshot fails | Export | Named error; route unaffected | Retry |

## 10. Best practices

1. **Annotate every new feature with its cost class** before it is accepted. A feature whose
   running cost is unknown at decision time is a future surprise.
2. **Prefer `place_id` reuse over search.** The address book is free; autocomplete is the
   largest cost line. Design flows so reuse is the default path.
3. **Import uses Geocoding, never autocomplete.** The difference is substantial at scale.
4. **Every metered feature passes through the Edge Function pipeline.** No exceptions.
5. **An exclusion needs a reason precise enough to re-decide later.** "Out of scope" is not a
   reason; §7 is the format.

## 11. Checklist

- [ ] Every MUST feature implemented and verified against [`01`](01_PRODUCT_REQUIREMENTS.md).
- [ ] Every metered feature has a quota check and a usage record.
- [ ] Import verified to use Geocoding, not autocomplete.
- [ ] Session tokens confirmed active on every autocomplete session.
- [ ] Address book offered before search in every add-stop flow.
- [ ] Every excluded feature in §7 still has a valid reason at release review.
- [ ] Shared cache hit rate measured after launch against the assumption in [`31`](31_COST_MODEL.md).

## 12. Roadmap

Detailed in [`28_ROADMAP.md`](28_ROADMAP.md). Summary:

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All MUST features | — |
| 1.1 | SHOULD features: import, favourites, duplicate, time saved | MVP stable |
| 1.2 | COULD features: Live Activity, geofence, notes, snapshot | Usage data |
| 2.0 | Time windows, pinned stops, priorities | A pricing tier that carries T2 |
| 3.0 | Multi-vehicle, web, T3 | Strategic decision or an [ADR-0012](adr/0012-long-term-osm-exit-path.md) trigger |

## 13. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Inventory created with cost annotations | Project inception | Product owner |
| 2026-08-06 | Time windows moved from SHOULD to WON'T for MVP | Would force T2 on every optimization | Product owner |
| 2026-08-06 | Import specified as Geocoding rather than autocomplete | Cost difference at 25 addresses is material | Architecture |

## 14. Rationale

Features are annotated with cost because in this product **cost is a design constraint, not an
operational detail.** A feature that triples Places calls is not a small feature no matter how
small its interface. Making the cost class visible in the same table as the priority means
that trade-off is made when the feature is accepted, rather than discovered in a billing
statement.

The exclusion list is deliberately long and specific. Every item on it is something a
reasonable person would propose — in-app navigation, offline maps, a free tier, time windows —
and every one would damage the product in a way that is not obvious from the feature
description alone. Recording the reason at the same fidelity as the decision means the
conversation happens once.

The address-book-before-search rule appears in several places because it is the single
highest-leverage cost decision in the product. The target segment revisits the same customers;
every reused `place_id` is a search that costs nothing. A flow that puts search first would
roughly triple the dominant COGS line for no user benefit.

## 15. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Feature list without cost annotations | Simpler table; separation of concerns | Cost is decided when a feature is accepted, not later. Separating them means deciding blind. |
| Autocomplete for import | One code path for all address entry | Far more expensive for bulk entry, and a worse experience — the user has the addresses already and does not want to type them one at a time. |
| Ship all SHOULD features in the MVP | More complete product at launch | Delays the only thing that matters at launch: whether anyone pays to have their stops reordered. |
| Keep excluded features as "backlog" | Nothing is ever refused; flexible | A backlog of decided-against items gets re-litigated every planning cycle. §7 records the decision and its reopening condition instead. |
