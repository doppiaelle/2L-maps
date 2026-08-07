# 31 — Cost Model and Unit Economics

> **Status:** Approved — figures require verification before pricing is finalised
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0003](adr/0003-tiered-optimization-cascade.md) · [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md) · [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)

---

> ⚠️ **Sourcing note.** `developers.google.com` was unreachable from the environment where this
> analysis was performed (403 from the egress proxy), so the figures below come from web
> research and secondary sources rather than the primary pricing pages. Each carries a
> confidence level. **Every figure must be verified against the official pricing page before
> subscription pricing is finalised**, and re-verified at each phase gate. Google changes
> pricing unilaterally — in March 2025 the flat $200 monthly credit was replaced with per-SKU
> free caps and three APIs were designated Legacy.

---

## 1. Purpose

This document is the single source for what the product costs to run and whether the price
works. Every cost figure in the specification set lives here; other documents cite it.

It answers four questions: what we pay and when, what a user costs, what the user pays, and at
what point the business closes.

## 2. Goals

1. Attribute every unit of cost to the user action that causes it.
2. Establish per-user COGS for the target profile, with and without mitigations.
3. Verify the subscription price against market comparables and store commission.
4. Set quota values from evidence rather than intuition.
5. Define the triggers at which the model must be revisited.

**Non-goals.** Not a financial plan. No revenue projections, no headcount, no runway.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Figure accuracy and re-verification | Architecture | Re-verified at each phase gate |
| Actuals reconciliation | Architecture | Monthly, against `usage_events` |
| Pricing decisions | Product owner | Informed by this document, decided by them |
| Quota values | Architecture | Server configuration, adjustable without a release |

---

## 4. Text diagrams

### Where money is spent

```
  USER ACTION                        UPSTREAM CALL              COST CLASS
  ─────────────────────────────────────────────────────────────────────────
  types an address        ────────▶  Places Autocomplete   ────▶  ◑ ~$0.02
                                     + Place Details              per address

  picks from address book ────────▶  none                  ────▶  ○ free
                                                                  ← the lever

  imports a list          ────────▶  Geocoding (batch)     ────▶  ◔ ~$0.005
                                                                  per address

  taps Optimize, ≤25      ────────▶  computeRoutes ×2      ────▶  ◑ ~$0.01
                                     (order + accurate ETA)       per route

  taps Optimize, >25      ────────▶  optimizeTours         ────▶  ● ~$0.01
                                                                  per STOP

  views the map           ────────▶  Maps SDK              ────▶  ○ not
                                                                  metered per view

  taps Start (navigate)   ────────▶  external app          ────▶  ○ free
                                                                  ← Google pays
```

### The counterintuitive shape

```
  Cost of one optimization, by approach and stop count

  $3.38 ┤                                        ╭─ matrix + local solver
        │                                    ╭───╯   (O(n²) billable elements)
  $1.00 ┤                            ╭───────╯
        │                    ╭───────╯
  $0.25 ┤            ╭───────╯  ← Route Optimization API (per stop)
        │    ╭───────╯
  $0.10 ┤╭───╯
        ││
  $0.01 ┼┴────────────────────────────────────────  ← computeRoutes
        └────┬────────┬────────┬────────┬────────      (per request — flat)
            10       15       20       25

  Two conclusions that invert the obvious:
    1. computeRoutes is ~25x cheaper than Route Optimization at 25 stops
    2. building your own matrix is the MOST expensive option, not the least
```

---

## 5. Fixed costs

What we pay regardless of users.

| Service | Free tier | When it becomes payable | Cost | Confidence |
|---|---|---|---|---|
| **Apple Developer Program** | None | Immediately, to use TestFlight or publish | **$99/year** | High |
| **Google Play Developer** | None | Before publishing | **$25 once** | High |
| Supabase | 500 MB DB · 50k auth MAU · 500k Edge Function invocations · 2 projects | ⚠️ **Free projects pause after 7 days of inactivity** — unacceptable in beta | $25/month (Pro) | Medium-high |
| Expo EAS | 15 iOS + 15 Android builds/month · 1,000 MAU on Updates | More builds, or queue priority | $19/month (Starter) | Medium-high |
| GitHub Actions | 2,000 min/month on private repos | macOS runners consume 10× → ~200 effective minutes | Usage-based | High |
| Sentry | 5,000 errors/month | Above that | ~$26/month | Medium |
| Firebase Analytics + Crashlytics | Unlimited for our usage | — | $0 | High |
| RevenueCat | Free below $2,500/month tracked revenue | Above that | 1% of tracked revenue | Medium-high |

**Fixed cost at MVP scale: roughly $50/month** (Supabase Pro + EAS Starter), plus $99/year and
$25 once.

**The one unavoidable cost is the Apple Developer Program.** Everything else has a free tier
sufficient for development and early beta.

### Development and testing on a physical device

| Path | Cost | Constraints |
|---|---|---|
| **With a Mac**, free Apple ID via Xcode | **$0** | App expires and must be reinstalled every 7 days; no TestFlight |
| Without a Mac, EAS Build in the cloud | **$99/year** | Device provisioning requires the paid programme; gains TestFlight and 90-day builds |
| Android first | **$25 once** | No expiry on the APK |

`react-native-maps` is a native module, so **Expo Go is never usable** — a development build is
required from day one ([`25_DEPLOYMENT.md`](25_DEPLOYMENT.md)).

---

## 6. Variable costs

### Unit prices

| SKU | Price | Billing unit | Confidence |
|---|---|---|---|
| Places Autocomplete | ~$2.83 per 1,000 requests, capped at 12 per session | Request, within a session | Medium |
| Place Details Essentials | ~$5 per 1,000 | Request | Medium |
| Geocoding | ~$5 per 1,000 | Request | Medium |
| Routes — Compute Routes, Essentials | ~$5 per 1,000 | Request, ≤10 intermediates, basic features | Medium |
| Routes — Compute Routes, Pro | ~$10 per 1,000 | Request, with `optimizeWaypointOrder` or 11–25 intermediates or traffic-aware | Medium |
| Routes — Compute Route Matrix | ~$5 per 1,000 | **Element** (origins × destinations) | Medium |
| Route Optimization, single vehicle | ~$10 per 1,000 | **Shipment (stop)** | Medium |
| Route Optimization, fleet | ~$30 per 1,000 | Shipment | Medium |
| Maps SDK rendering | Not metered per view for our usage | — | Medium |

**Free tier since March 2025:** approximately 10,000 free calls per month per Essentials SKU,
5,000 per Pro SKU, 1,000 per Enterprise SKU. This covers all of development and a meaningful
part of early production.

### Why field masks matter

Routes API SKU selection is driven by the fields requested. Requesting toll information or
traffic-aware routing moves a request from Essentials to Pro or Enterprise. **Over-requesting
fields silently doubles the price of every call** — which is why minimal field masks are a rule
in [`../CLAUDE.md`](../CLAUDE.md) §6, not a suggestion.

---

## 7. Per-user cost

### Target profile — Marco, the sales agent

8 stops per day, 22 working days, 1 optimization per day.

| Line | Without mitigations | With mitigations | Mechanism |
|---|---|---|---|
| Address entry | $3.52/month | **$0.80/month** | Address-book reuse, session tokens, 300 ms debounce, 3-character minimum |
| Optimization (T1) | $0.22/month | **$0.22/month** | Flat per route |
| Shared cache saving | — | −$0.05 | Content-keyed cross-user cache |
| Navigation | $0 | $0 | External handoff |
| **Total COGS** | **~$3.74** | **~$1.02** | |

**Address entry dominates.** Routing is 6% of the total; address search is 78%. Every cost
decision in the product follows from this single fact (risk C2,
[`35_RISK_REGISTER.md`](35_RISK_REGISTER.md)) — which is why the address book is
offered before search in every add-stop flow ([`04_FEATURES.md`](04_FEATURES.md)).

### Elena, the technician

12 stops, imported daily rather than typed.

| Line | Cost |
|---|---|
| Import via Geocoding, 12 × 22 × $0.005 | $1.32/month |
| Optimization, 22 × $0.01 | $0.22/month |
| **Total** | **~$1.54/month** |

Import is more than three times cheaper than typing the same addresses through autocomplete.

### Sofia, the courier — out of scope, shown for contrast

35 stops, twice-daily optimization. Above 25 stops, tier T2 bills per stop.

| Line | Cost |
|---|---|
| Import, 35 × 22 × $0.005 | $3.85/month |
| Optimization T2, 35 × 2 × 22 × $0.01 | **$15.40/month** |
| **Total** | **~$19.25/month** |

Against a €9.99 subscription this is a loss on every user. This is the quantitative basis for
excluding the segment ([ADR-0002](adr/0002-target-segment-and-monetization.md)) and for the
hierarchical chunking mitigation in phase 2.0.

### Trial cost

Seven days of full use at the target profile: **~$0.25 per trial user**. At a 20% conversion
rate, each acquired subscriber carries roughly **$1.25 of trial API cost** — recovered in the
first month.

This is the structural advantage of trial-to-paid over freemium, where a free user costs
$0.30–0.80 **every month, indefinitely**.

---

## 8. Pricing and margin

### Market comparables

| Product | Price | What it does |
|---|---|---|
| Google Maps | Free | Up to 10 stops, **no reordering** |
| Waze | Free | One destination |
| RoadWarrior | from ~$14.99/month | Multi-stop optimization |
| OptimoRoute | from ~$35/month | Fleet-oriented |
| Circuit | from ~$200/month (team tier) | B2B |

The prosumer band is roughly **$15–35/month**. Google Maps being free is not the competitive
problem it appears: it does not solve the problem, since it will not reorder stops.

### Margin at €9.99/month

Under the Apple Small Business Program — 15% commission below $1M annual revenue, rather than
30%.

```
  List price                        €9.99
  − store commission (15%)         −€1.50
  ────────────────────────────────────────
  Net revenue                       €8.49
  − COGS                           −€1.02
  ────────────────────────────────────────
  Gross margin                      €7.47      75%
```

At the standard 30% commission, gross margin is €5.97 (60%) — still healthy.

### Break-even

| Price | Net per user | Fixed costs | Break-even |
|---|---|---|---|
| €9.99/month | €8.49 | ~$50/month | **~7 subscribers** |
| €14.99/month | €12.74 | ~$50/month | **~4 subscribers** |

An annual plan should be offered at roughly a 30% discount — around €79.99 — because it
improves cash flow and materially reduces churn, at a margin still well above cost.

---

## 9. Quota values

Derived from the usage profiles above with generous headroom. **Quotas exist to catch abuse and
defects, not to inconvenience a professional using the product as intended**
([ADR-0011](adr/0011-server-side-quota-enforcement.md)).

| Limit | Value | Derivation |
|---|---|---|
| Optimizations per month | 300 | Target profile uses ~22; 13× headroom |
| Autocomplete sessions per month | 1,200 | Target profile uses ~176; ~7× headroom |
| Geocoding requests per month | 1,500 | Covers daily import of 25 stops with headroom |
| Optimizations per hour (rate limit) | 20 | No legitimate use exceeds this; catches retry loops |
| Autocomplete requests per session | 12 | Matches the Places session billing cap |

Values are **server configuration, adjustable without an app release** — essential when a cost
surprise appears mid-month. Every quota event is alerted on: in normal operation these should
never fire, so an occurrence is a probable defect rather than a user problem.

---

## 10. Edge cases

| # | Condition | Cost impact | Handling |
|---|---|---|---|
| 1 | User optimizes repeatedly without editing | Near zero after the first — cache hit | Content-keyed cache |
| 2 | User adds a 26th stop | Would jump from $0.01 to $0.26 | Blocked at 25 |
| 3 | Autocomplete session abandoned without selection | Up to 12 requests billed, no Place Details | Debounce and character minimum reduce the request count |
| 4 | Same route optimized by two users in one city | One upstream call, two results | Shared cache |
| 5 | Coordinates expire on a large saved route | Batched Place Details on open | Batched; shared cache often absorbs it |
| 6 | Retry loop from a client defect | Potentially unbounded | Rate limit caps it; alert fires |
| 7 | Google free tier exhausted mid-month | Costs begin at the metered rate | Expected at scale; the model assumes no free tier |
| 8 | Field mask widened by a change | Silent SKU escalation, up to 2× | Review rule; field masks are reviewed on every Routes change |

## 11. Error handling

| Failure of the model | Detection | Response |
|---|---|---|
| Actuals exceed the model | Monthly reconciliation against `usage_events` | Identify the diverging line; correct the model before adjusting price |
| A figure here is stale | Phase gate re-verification | Update with source and date; reassess margin |
| Google changes pricing | Announcement, or a billing surprise | Reassess against the [ADR-0012](adr/0012-long-term-osm-exit-path.md) migration triggers |
| Cache hit rate below assumption | Gate D2 metric | Investigate key construction; the cache is the main cost lever |
| A quota fires in normal use | Alert | Probable defect; investigate before raising the limit |

## 12. Best practices

1. **Attribute every cost to a user action.** A cost line nobody can trace to a tap cannot be
   optimised.
2. **The address book is the cheapest feature in the product.** Design flows so reuse is the
   default and search is the exception.
3. **Import uses Geocoding, never autocomplete.** Three times cheaper at the same volume.
4. **Minimal field masks always.** They determine the SKU.
5. **Reconcile monthly.** A model never checked against actuals is fiction with a table.
6. **Re-verify every figure at each phase gate.** These numbers have a shelf life.
7. **Record cache hits.** Without the flag, the cache's value is unmeasurable.

## 13. Checklist

- [ ] Every figure re-verified against the primary source, with date recorded.
- [ ] `usage_events` records endpoint, tier, cache-hit status and estimated cost.
- [ ] Monthly reconciliation of model against actuals is scheduled and performed.
- [ ] Session tokens confirmed active on every autocomplete session.
- [ ] Import confirmed to use Geocoding.
- [ ] Field masks reviewed on every Routes API change.
- [ ] Quota values loaded from server configuration, not compiled in.
- [ ] Alerting confirmed on every quota event.
- [ ] Gate D1 COGS threshold (≤$1.50/user/month) measured, not assumed.

## 14. Roadmap

| Phase | Cost work | Trigger |
|---|---|---|
| MVP | Usage recording, shared cache, quotas, monthly reconciliation | — |
| 1.x | Cache hit rate optimisation; address-book prominence experiments | Gate D1 COGS result |
| 2.0 | Hierarchical chunking to keep >25-stop routes affordable | Gate D3 |
| 3.0 | Tier T3 self-hosted matrix, near-zero marginal cost | An [ADR-0012](adr/0012-long-term-osm-exit-path.md) trigger |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Model created; T1 identified as ~25× cheaper than T2 at 25 stops | Cost analysis inverted the brief's engine choice | Architecture |
| 2026-08-06 | Places identified as 78% of COGS | Modelling the target profile | Architecture |
| 2026-08-06 | Sofia's segment excluded on cost grounds | ~$19.25/month COGS against a €9.99 price | Product owner |
| 2026-08-06 | Quota values set with 7–13× headroom | Quotas target abuse and defects, not normal use | Architecture |

## 16. Rationale

This document exists because **cost is a design constraint in this product, not an operational
concern**. The difference between the brief's proposed architecture and the one built is a
factor of twenty-five on the dominant operation — large enough to determine whether the
business exists. This is risk C1 in
[`35_RISK_REGISTER.md`](35_RISK_REGISTER.md), and the cascade is its mitigation.

Two findings shaped the architecture more than any other analysis:

**Routing is cheap; addresses are expensive.** The intuition is that computing an optimal route
is the costly part. It is 6% of COGS. Address entry is 78%. Every design decision that reduces
typing — the address book, favourites, import, recents-first ordering — is a cost decision
first and a convenience second.

**Building it yourself is the expensive option.** Constructing a distance matrix through Google
and solving the TSP locally feels like the cost-conscious choice. It is O(n²) billable
elements: $3.38 for 25 stops against $0.01 for one `computeRoutes` request. Self-hosting only
becomes cheaper when the matrix itself is free, which is tier T3.

The trial-to-paid model is defended here on cost grounds rather than conversion grounds. A free
user is a perpetual liability of $0.30–0.80 a month. A trial user is a bounded liability of
$0.25 total. At any realistic free-to-paid ratio the freemium model consumes the margin of the
paying base.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Route Optimization API for all requests | One engine; all constraints available | 10–25× more expensive on the dominant case |
| Google matrix + local TSP solver | Algorithmic control; feels cheaper | The most expensive measured option: $3.38 vs $0.01 at 25 stops |
| Freemium with a limited free tier | Larger funnel; word of mouth | Perpetual per-user cost with no revenue; consumes the paid base's margin |
| Usage-based pricing per optimization | Costs track revenue exactly; no quota needed | Unpredictable bills are hostile to a professional budgeting monthly, and the amounts are too small to justify the friction |
| Higher price (€19.99) with no quotas | Simpler; better margin per user | Above the prosumer band's comfortable range for a single-purpose tool, and quotas would still be needed to bound defect-driven cost |
| Absorbing costs and pricing at €4.99 | Aggressive growth; undercuts every comparable | Margin at €4.99 net of 15% commission is €3.22 against $1.02 COGS — viable but leaves nothing for support, marketing or a bad month |
