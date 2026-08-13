# 00 — Project Overview

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`INDEX.md`](INDEX.md) · [`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md) · [`adr/`](adr/)

---

## 1. Purpose

This document is the entry point to the specification set. It states what the product is,
what it deliberately is not, the shape of the system that delivers it, and the vocabulary
every other document uses.

A reader who finishes this document should be able to open any other file in `/docs` and
understand its terms without further context.

It does **not** contain requirements ([`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md)),
feature detail ([`04_FEATURES.md`](04_FEATURES.md)) or any implementation specification. Where
this document states a decision, the reasoning lives in the referenced ADR, not here.

## 2. Goals

1. State the product thesis in terms that can be argued with.
2. Fix the glossary. Every term defined here means exactly this in every other document.
3. Present the system architecture at one level of detail — enough to orient, not to build.
4. Record the twelve binding decisions and point to their ADRs.
5. Make the document set navigable.

**Non-goals.** This is not a business plan, a pitch, or a project schedule. It contains no
numbers that are not defined elsewhere, because a number restated is a number that will
drift.

---

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Product thesis and scope | Product owner | Changes require an ADR |
| Glossary | This document | The single source; other documents use these terms exactly |
| Architecture overview | Architecture | Must match [`13_BACKEND.md`](13_BACKEND.md) |
| Decision index | [`adr/`](adr/) | Referenced by ID, never summarised divergently |

## 4. The product

### The problem

An independent driver with a message or manifest containing twelve addresses has no fast path
from that unstructured list to a route they can drive.

**Google Maps** accepts up to ten stops and routes them **in the order they were entered**. It
will not reorder them. A user who wants an efficient order must work it out themselves, on a
phone, in a van.

**Waze** and **Apple Maps** accept one destination at a time.

**Fleet software** — OptimoRoute, Circuit for Teams, Routific — solves the ordering problem
properly, and is priced and shaped for dispatchers managing drivers, not for the driver.

The gap is specific: **a single driver, with their own list of 10–25 stops, who needs the order
computed and then wants to drive it with the navigation app they already use.**

### The thesis

> The user does not pay for a map. They pay for the order.

Everything follows from that sentence. The map is a preview surface, not a navigation
product. Navigation is handed off to Google Maps, Waze or Apple Maps, because those are
already better than anything we would build and the user already trusts one of them
([ADR-0004](adr/0004-external-navigation-handoff.md)).

What we own is the part nobody else does well for this user: taking a list and returning the
right sequence, with a truthful ETA, in four taps.

### What it is not

- **Not a navigation app.** No turn-by-turn guidance, no voice, no rerouting.
- **Not a competitor to Google Maps** on search, coverage or traffic data.
- **Not fleet software.** One user, one vehicle. No dispatchers, no driver management, no web
  dashboard ([ADR-0002](adr/0002-target-segment-and-monetization.md)).
- **Not an offline map.** Offline means your own data and your last computed route, never
  downloadable tiles ([ADR-0008](adr/0008-offline-scope.md)).

### The user

The design centre is an independent or subcontracted last-mile driver visiting 10–25 stops in one
vehicle. Local retail delivery is included. Field technicians are secondary and sales agents are
adjacent. Detailed in [`02_USER_PERSONAS.md`](02_USER_PERSONAS.md) and
[ADR-0029](adr/0029-single-driver-wedge-and-subscription-first-freemium.md).

### The business model

Advertising-free, subscription-first freemium: a bounded Free allowance, an occasional Day pass
and Pro for regular working use. Server quotas bound acquisition cost; exact store prices and any
introductory offer remain provisional until checkout is configured and validated. Confirmed routes
remain the user's data and can be reopened without paying for the same optimization twice
([ADR-0029](adr/0029-single-driver-wedge-and-subscription-first-freemium.md)).

---

## 5. Text diagrams

### System at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  MOBILE APP — Expo · React Native · TypeScript · Expo Router          │
│                                                                      │
│  Screens        Plan · Optimize · Route preview · Stops sheet        │
│                 History · Settings · Paywall                         │
│  ──────────────────────────────────────────────────────────────────  │
│  Facades        <AppMap>          NavigationProvider                 │
│                 RoutingProvider   GeocodingProvider                  │
│                 — no screen imports a provider SDK directly —        │
│  ──────────────────────────────────────────────────────────────────  │
│  State          Zustand (UI, session)   React Query (server state)   │
│  ──────────────────────────────────────────────────────────────────  │
│  Data           Supabase SDK · Edge Function client · local cache    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTPS · Supabase JWT
┌───────────────────────────────▼──────────────────────────────────────┐
│  SUPABASE                                                            │
│  Auth              JWT · Sign in with Apple · Google Sign-In         │
│  Postgres + RLS    routes · stops · places_cache · jobs ·            │
│                    usage_events · user_entitlements                  │
│  Realtime          asynchronous optimization job status              │
│  Storage           list imports                                      │
│  Edge Functions    /places-autocomplete  /geocode  /routes-compute   │
│                    /optimize  /usage-quota  /revenuecat-webhook      │
│                    every one: JWT → entitlement → rate limit →       │
│                    quota → cache → upstream → record                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ server API key · service-account OAuth2
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   Routes API           Route Optimization         Places API (New)
   computeRoutes        optimizeTours              Autocomplete
   computeRouteMatrix   batchOptimizeTours         Details · Geocoding
        │
        └─ tier T1 ────────────── tier T2 ──────────────┘
```

The single Google credential in the client is the Maps SDK rendering key, restricted to the
bundle ID and signing certificate. Every other call is proxied
([ADR-0006](adr/0006-mandatory-backend-proxy.md)).

### The core loop

```
   add stops              optimize                 drive
  ┌──────────┐         ┌───────────┐          ┌───────────┐
  │ search   │         │ server    │          │ handoff   │
  │ import   ├────────▶│ picks a   ├─────────▶│ to Maps / │
  │ favourite│         │ tier      │          │ Waze /    │
  └──────────┘         │ T0…T2     │          │ Apple     │
       ▲               └─────┬─────┘          └─────┬─────┘
       │                     │                      │
       │                     ▼                      ▼
       │              ordered stops           one stop, or a
       │              polyline · ETA          chunk of ~9
       │                     │                      │
       └─────────────────────┴──────────────────────┘
                    reorder · re-optimize · next stop
```

---

## 6. Flows

The three journeys that define the product. Full detail in
[`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md).

**Flow A — first optimized route.**
Trigger: an authenticated user opens Route.
1. Add stops — by Places search, by importing a list, or from favourites.
2. Tap **Optimize**. The server selects a tier and returns the ordered route.
3. Tap **Confirm & open navigator**. The app persists the confirmed route, then hands the complete
   route to the chosen navigation application.
Terminal states: an optimized route displayed and handed off (success); a quota or entitlement
block (402/429, designed states); a degraded T0 result, clearly labelled (partial success).

**Flow B — driving the route.**
Trigger: the confirmed route has been saved.
1. The app opens the preferred external navigator with the complete supported route or its
   compatibility handoff.
2. The navigation app owns turn-by-turn driving. 2L Maps does not show fake progress, arrival,
   duration or in-app completion controls ([ADR-0027](adr/0027-the-drive-happens-elsewhere.md)).
Terminal state: the route is already present in History before 2L Maps backgrounds.

**Flow C — reuse.**
Trigger: the user opens a saved route from history.
1. The saved optimized order opens locally without another optimize request.
2. Coordinates that require navigation are re-hydrated under the cache policy when needed
   ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).
3. The user can hand off the saved route immediately. Editing its stops creates a new draft and
   requires a new optimization.

This flow is why the product retains users: the target segment revisits the same customers,
so the second month is faster than the first.

---

## 7. Architectural decisions

Accepted ADRs are binding. This table is the foundation; later amendments are indexed in
[`INDEX.md`](INDEX.md).

| ID | Decision | Governs |
|---|---|---|
| [0001](adr/0001-documentation-language-and-structure.md) | English documentation, 41 files, 14-section template | Every document |
| [0002](adr/0002-target-segment-and-monetization.md) | Single professional, 5–25 stops; 7-day trial to paid | Product scope, pricing |
| [0003](adr/0003-tiered-optimization-cascade.md) | Cost-aware cascade T0–T3, not one engine | Optimization |
| [0004](adr/0004-external-navigation-handoff.md) | No in-app navigation; multi-provider handoff | Navigation |
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps` behind an `<AppMap>` facade | Map |
| [0006](adr/0006-mandatory-backend-proxy.md) | All web-service calls proxied through Edge Functions | Security, cost |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | `place_id` durable, coordinates a 30-day cache | Data model |
| [0008](adr/0008-offline-scope.md) | Offline is your own data, never offline maps | Offline |
| [0009](adr/0009-visual-direction.md) | Monochrome base, single mint accent, red for alerts only | Design |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only; stop list is a sheet, never a sidebar | Scope, IA |
| [0011](adr/0011-server-side-quota-enforcement.md) | Entitlements and quotas enforced server-side only | Backend, billing |
| [0012](adr/0012-long-term-osm-exit-path.md) | MapLibre + Valhalla documented as the exit path | Long-term risk |
| [0029](adr/0029-single-driver-wedge-and-subscription-first-freemium.md) | Single-driver wedge; advertising-free Free / Day pass / Pro | Product focus, monetization |

---

## 8. Glossary

**These definitions are binding.** Where a document uses one of these words, it means this.

| Term | Definition |
|---|---|
| **Stop** | One place the user intends to visit. Identified durably by `place_id`; carries a user label, notes and a position in the route. Not the same as a waypoint. |
| **Waypoint** | A Google Routes API concept: an origin, destination or intermediate in a request. A stop becomes a waypoint when a request is built. |
| **Leg** | The segment between two consecutive stops. Carries its own distance, duration and polyline. |
| **Route** | An ordered set of stops with an origin, an optional return to origin, and the computed legs between them. The user-facing unit that is saved and reused. |
| **Round trip** | A route whose final destination is its origin. |
| **One way** | A route ending at its last stop. |
| **Optimization** | Computing the order of stops that minimises total travel time. One optimization is one billable operation regardless of tier. |
| **Tier (T0–T3)** | Which engine served an optimization. T0 local heuristic, T1 Routes API, T2 Route Optimization API, T3 self-hosted. See [ADR-0003](adr/0003-tiered-optimization-cascade.md). |
| **Degraded optimization** | A T0 result. Ignores road network and traffic. Always labelled as such in the UI and flagged in storage. |
| **Handoff** | Passing navigation to an external application. Never "navigation" unqualified — the app does not navigate. |
| **Chunked handoff** | Passing about nine stops at once, possible only with the Google Maps universal link. |
| **Leg-by-leg handoff** | Passing one destination at a time. The only mode Waze and Apple Maps support. |
| **Job** | A server-side asynchronous optimization, used when T2 batch mode is required. Has a lifecycle and a Realtime status channel. |
| **Entitlement** | The server-held fact that a user may use metered features. Derived from RevenueCat webhooks, never from the client ([ADR-0011](adr/0011-server-side-quota-enforcement.md)). |
| **Trial** | The 7-day introductory period at €0. Metered exactly like a paid subscription. |
| **Quota** | The monthly per-user ceiling on metered operations. Distinct from rate limit. |
| **Rate limit** | The short-window ceiling on request velocity. Distinct from quota. |
| **`place_id`** | Google's stable place identifier. Storable indefinitely. The durable key for every location in the system. |
| **Coordinate cache** | Latitude, longitude and formatted address derived from Google. Deletable after 30 days by platform terms; nullable everywhere in the schema. |
| **Facade** | An internal interface isolating an external SDK — `<AppMap>`, `RoutingProvider`, `GeocodingProvider`, `NavigationProvider`. No screen imports a provider SDK directly. |
| **Dock** | The bar at the bottom of every screen holding the three sections — Route, History, Settings — and the close control that appears when one is open (ADR-0018). |
| **Section** | One of the dock's three destinations, opened full-screen above a map that stays mounted underneath. Replaced the bottom sheet. |
| **Accent** | Mint green. Marks the active route, the primary action, the selected marker and completed stops. Red is never an accent — it means error or warning only. |

---

## 9. Edge cases

Cases that shape the architecture rather than any single screen. Per-area edge cases live in
each document.

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|
| 1 | Saved route opened after >30 days | Coordinates silently re-hydrated from `place_id`; skeleton shown while resolving | [`12_DATABASE.md`](12_DATABASE.md) |
| 2 | Network lost mid-planning | Local address book still searchable; T0 offered if ≤8 stops; mutations queued | [`17_OFFLINE_MODE.md`](17_OFFLINE_MODE.md) |
| 3 | Route exceeds 25 stops | Server escalates to T2 automatically; user sees no engine change, only a longer wait | [`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md) |
| 4 | Preferred navigation app not installed | Provider list reflects only installed apps; falls back to the web universal link | [`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md) |
| 5 | App killed mid-route | Progress restored on next launch; the user resumes at the next incomplete stop | [`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md) |
| 6 | Trial expires mid-session | Metered calls return 402; saved routes, address book and T0 remain available | [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md) |
| 7 | Two devices edit the same route offline | Per-field last-write-wins; explicit conflict surface only on true divergence | [`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md) |
| 8 | Google returns no route between two stops | Stop flagged unreachable, excluded from ordering, surfaced to the user rather than dropped silently | [`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md) |

## 10. Error handling

The product-wide principle: **no silent failure, and no failure without a next action.**
Every error state tells the user what happened, what they can still do, and what will happen
next. Per-endpoint handling is in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md).

| Failure | Detection | User-facing result | Retry | Fallback |
|---|---|---|---|---|
| Upstream Google 5xx | Edge Function | "Couldn't optimize just now" with a retry action | Exponential backoff, bounded | T0 if ≤8 stops |
| Upstream timeout | Edge Function deadline | Same as above | One retry, then fail | T0, or queue as a job |
| Quota exhausted (429) | Edge Function | Limit named, reset date given, unmetered features listed | No | Saved routes, address book, T0 |
| No entitlement (402) | Edge Function | Paywall with restore path | No | Read-only access to own data |
| Network unavailable | Client | Offline state on affected surfaces only | On reconnection | Queued mutations, T0 |
| Map style ID fails | Map SDK | Default Google style, no user-visible error | No | Default style |
| Navigation app missing | Client, at handoff | Provider absent from the list | No | Web universal link |

## 11. Best practices

1. **Cite, never restate.** A number that appears in two documents will diverge. API limits
   live in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md), costs in
   [`31_COST_MODEL.md`](31_COST_MODEL.md), schema in [`12_DATABASE.md`](12_DATABASE.md),
   tokens in [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md).
2. **Use glossary terms exactly.** "Navigation" means handoff to an external app. If a
   document needs a term that is not here, add it here first.
3. **Reference ADRs by ID, never summarise them.** A summary drifts from its source; a link
   cannot.
4. **Date and source every external claim.** Google changes pricing and terms unilaterally.
   An unsourced number is a future incident.
5. **Specify the failure alongside the success.** A flow without its error states is half a
   specification.

## 12. Checklist

- [ ] The reader can state the product thesis in one sentence after this document.
- [ ] Every glossary term used in `/docs` is defined here.
- [ ] All twelve ADRs exist and are linked from §7.
- [ ] No cost figure, API limit, schema definition or design token is restated here.
- [ ] The architecture diagram matches [`13_BACKEND.md`](13_BACKEND.md).
- [ ] Every "not" in §4 is enforced by at least one ADR.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| **1 — MVP** | Fast stop entry, optimization T0–T2, preview, confirmed-save-before-handoff, reusable History, plan comparison | — |
| **2 — Retention** | Photo/list import at scale, richer address book, checkout after provider validation | MVP shipped, retention measured |
| **3 — Expansion** | Multi-vehicle, time windows, web companion, T3 self-hosted matrix | Segment demand, or a trigger in [ADR-0012](adr/0012-long-term-osm-exit-path.md) |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Document created; D1–D10 recorded as ADR-0001…0012 | Project inception | Product owner |
| 2026-08-13 | Single last-mile driver made primary; ads removed; History made a reuse and cost-control surface | ADR-0029 | Product owner |

## 15. Rationale

The architecture follows from one observation: **the expensive part of this product is not
the hard part.** Computing a good stop order for 25 places is a solved problem available for
about a cent. What is genuinely hard is everything around it — keeping API costs below the
subscription price, staying inside platform terms that forbid the obvious data model, and
handing off to navigation apps that cannot accept a multi-stop route.

So the architecture optimises for those three, not for algorithmic sophistication. The
cascade exists because engine choice is a cost decision. The proxy exists because credentials,
quotas and caching all need a server. The `place_id` model exists because the terms forbid the
natural schema. The handoff strategy exists because Apple Maps takes one destination.

The visual direction follows the same logic. A professional opens this app many times a day
in a vehicle. Calm, high-contrast, one-handed and three taps to the answer beats feature
density every time.

## 16. Rejected alternatives

Product-level alternatives. Technical ones are in the ADRs.

| Alternative | Attraction | Why rejected |
|---|---|---|
| Compete with Google Maps on navigation | Larger market; owns the whole experience | Google's traffic data comes from hundreds of millions of drivers. Competing there means losing at the thing we would be judged on, while the actual gap — stop ordering — goes unaddressed. |
| Fleet/dispatcher product | Higher contract values; justifies the expensive optimizer | A different product: web dashboard, driver management, roles, B2B invoicing. See [ADR-0002](adr/0002-target-segment-and-monetization.md). |
| Free app with advertising | No paywall friction; larger install base | Per-user COGS is real and recurring. Ad revenue at this scale would not cover Places alone, and advertising in a tool used while driving is user-hostile. |
| One-time purchase | No subscription fatigue; no renewal disclosure risk | Recurring per-use costs against a single payment is structurally loss-making for exactly the users who value the product most. |
