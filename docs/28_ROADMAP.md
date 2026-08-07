# 28 — Roadmap

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`04_FEATURES.md`](04_FEATURES.md) · [`35_RISK_REGISTER.md`](35_RISK_REGISTER.md) · [`31_COST_MODEL.md`](31_COST_MODEL.md)

---

## 1. Purpose

This document states what is built when, and — more importantly — **what evidence moves an
item from later to now**. Every phase after the MVP is gated by a measurable trigger rather
than a date, because dates in a solo-developer project are guesses and triggers are not.

It does not enumerate features ([`04_FEATURES.md`](04_FEATURES.md)) or requirements
([`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md)).

## 2. Goals

1. Define the MVP boundary precisely enough that "is this in?" is never ambiguous.
2. Attach a measurable trigger to every deferred item.
3. Define the metrics that decide whether the product is working before scope expands.
4. Record the conditions that would cause a strategic change of direction.

**Non-goals.** No dates, no estimates, no sprint planning. Triggers, not calendars.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Phase content and triggers | Product owner | Trigger changes require a decision-log entry |
| Metric instrumentation | Engineering, via [`21_ANALYTICS.md`](21_ANALYTICS.md) | A trigger without a metric is unusable |
| Cost triggers | Architecture, via [`31_COST_MODEL.md`](31_COST_MODEL.md) | Reviewed monthly against actuals |

---

## 4. Text diagrams

### Phases and gates

```
 ┌──────────┐   ship    ┌──────────┐  retention  ┌──────────┐  demand   ┌──────────┐
 │   MVP    │──────────▶│   1.x    │────────────▶│   2.0    │──────────▶│   3.0    │
 │          │           │          │             │          │           │          │
 │ optimize │  D1 met   │ retain   │   D2 met    │ expand   │  D3 met   │ pivot?   │
 │ + handoff│           │ + polish │             │ segment  │           │          │
 └──────────┘           └──────────┘             └──────────┘           └──────────┘
      │                      │                        │                      │
   gate D1               gate D2                  gate D3               strategic
   ─────────             ─────────                ─────────             decision,
   trial→paid            week-4                   sustained             not a
   conversion            retention                demand above          roadmap
   ≥ 15%                 ≥ 40%                    25 stops              item
   COGS ≤ $1.50/user     crash-free ≥ 99.5%       + willingness
                                                  to pay > €20
```

**No phase begins before its gate.** Building 2.0 while conversion sits at 5% optimises the
wrong thing: the problem there is the product or the paywall, not missing features.

---

## 5. Flows

**How an item moves from later to now.** Gates, not dates.

```
  phase N ships
       │
       ▼
  instrumented gate measured over its stated window (21)
       │
   ┌───┴────────────────────────┐
   ▼                            ▼
  passed                     not passed
   │                            │
   ▼                            ▼
  phase N+1 begins    the phase does not begin; the gate is re-examined —
                      either the trigger was wrong, or the evidence says no
```

**Why dates are absent after the MVP.** A solo-developer roadmap with dates is a work of
fiction that everyone learns to discount, and a discounted plan cannot coordinate anything. A
gate is falsifiable: either the number was reached or it was not.

**How an experiment ends.** Every experiment names in advance what result would change the
product. An experiment whose outcomes all lead to the same decision is not run.

## 6. Phases

### MVP — prove someone pays to have their stops reordered

**Scope:** every MUST feature in [`04_FEATURES.md`](04_FEATURES.md). Stops, the T0–T2 cascade,
route preview, external handoff, saved routes, history, offline access to own data, trial to
paid.

**Explicitly not in the MVP,** despite being easy to add: Live Activity, geofenced arrival,
notes, snapshot export, satellite view, favourites-at-scale. Each is deferred because none
changes the answer to the only question the MVP asks.

**The MVP is finished when** all MUST requirements pass, both stores have accepted the build,
and a real user who is not the developer has completed a route.

**Gate D1 — measured over the first 60 days of general availability:**

| Metric | Threshold | Meaning if missed |
|---|---|---|
| Trial-to-paid conversion | ≥ 15% | The paywall or the value proposition is wrong. Run the [J0 experiment](03_USER_JOURNEYS.md) before adding features. |
| COGS per active user | ≤ $1.50/month | Cost assumptions are wrong. Fix caching and quotas before scaling. |
| Crash-free sessions | ≥ 99.5% | Stability first. No new features. |
| Routes optimized per paying user per week | ≥ 3 | The product is not part of the routine; retention will not follow. |

---

### 1.x — make the second month faster than the first

**Thesis:** retention in this product comes from accumulated data. A user whose address book
is full and whose routes repeat gets faster every week. Everything in this phase serves that.

| Release | Scope | Why here |
|---|---|---|
| **1.1** | List import at scale with CSV column mapping; favourites; route duplication; time-saved summary | Elena's morning retyping is the sharpest recurring pain; time-saved is the only numeric proof of value |
| **1.2** | Live Activity and persistent notification for route progress; stop notes | Reduces the friction of the return loop that external handoff imposes |
| **1.3** | Opt-in geofenced arrival detection | Removes the return loop entirely for users who accept the permission. Deferred to last in the phase because it carries the highest App Review risk |

**Gate D2 — measured over 90 days:**

| Metric | Threshold |
|---|---|
| Week-4 retention of paying users | ≥ 40% |
| Median time from app open to handoff | ≤ 45 s |
| Address-book reuse rate | ≥ 50% of stops added |
| Cache hit rate on optimization | ≥ 25% |

The last two are cost metrics as much as product metrics: both directly reduce COGS, and both
indicate the product has become part of a routine rather than a tool used once.

---

### 2.0 — expand the segment upward

**Thesis:** the 25-stop ceiling and the absence of constraints exclude Sofia
([`02_USER_PERSONAS.md`](02_USER_PERSONAS.md)) and the professional whose day has fixed
appointments. Both are reachable, but only with a pricing tier that carries the cost.

| Scope | Cost implication |
|---|---|
| Time windows per stop | Forces tier T2 on every optimization: cost moves from ~$0.01 per route to ~$0.01 per stop |
| Pinned stops and priorities | Supported by T1 for pinning; priorities require T2 |
| Stop counts above 25 via hierarchical chunking | Cluster, optimize each cluster in T1, stitch — keeps large routes affordable at a measurable loss of optimality |
| A higher-priced plan | Required. This phase cannot ship on the €9.99 tier |

**Gate D3:**

| Signal | Threshold |
|---|---|
| Users hitting the 25-stop limit | ≥ 10% of active users, repeatedly |
| Support requests for time windows or fixed appointments | Sustained, not sporadic |
| Willingness to pay above €20/month | Validated before building, not after |

**This phase is not started on enthusiasm.** Both features degrade unit economics, and both
are irreversible in the sense that users who adopt them cannot be moved back.

---

### 3.0 — strategic options, not commitments

None of these is planned. Each is recorded so that when its trigger fires, the analysis
already exists.

| Option | Trigger | Reference |
|---|---|---|
| **Web companion** | Import proves insufficient — measured by import usage and support requests for desk-based entry | [ADR-0010](adr/0010-mobile-only-scope.md) |
| **Multi-vehicle / fleet** | A deliberate strategic pivot with its own team and product surface. Not a feature of this app | [ADR-0002](adr/0002-target-segment-and-monetization.md) |
| **Tier T3, self-hosted matrix** | Any migration trigger fires: COGS above 25% of net revenue, a terms change blocking a feature, offline maps proven necessary for retention, or volume making self-hosting cheaper including operations | [ADR-0012](adr/0012-long-term-osm-exit-path.md) |
| **In-app navigation** | The RN Navigation SDK wrapper reaches 1.0 **and** its map component matches `react-native-maps` for clustering, custom markers and polylines | [ADR-0004](adr/0004-external-navigation-handoff.md) |

---

## 7. Experiments

Distinct from features: these change nothing structural and are run to answer a question.

| Experiment | Question | Phase | Success measure |
|---|---|---|---|
| Paywall after first optimization | Does revealing value before asking for payment raise conversion? | 1.x, after a baseline exists | Conversion up without a fall in 30-day retention |
| Annual plan prominence | Does leading with annual raise LTV without suppressing starts? | 1.x | LTV up, trial starts flat or up |
| Origin defaulting to last used rather than current location | Which matches actual behaviour? | 1.x | Fewer origin edits per route |
| Three vs five suggested addresses in autocomplete | Can suggestions be cut without harming success rate? | 1.x | Places cost down, selection rate flat |

The first is the most consequential and is the reason the current paywall placement is
recorded as a decision rather than a conclusion
([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J0).

---

## 8. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | Single professional, trial to paid | Gate D1, the conversion gate |
| [0004](adr/0004-external-navigation-handoff.md) | External handoff | Conditions that would reopen in-app navigation |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only | The conditions under which web would be reconsidered |
| [0012](adr/0012-long-term-osm-exit-path.md) | OSM exit path | Phase 3, and the cost trigger that starts it |

**Decided here:** every phase after the MVP is gated by a measurable trigger rather than a
date. This makes the roadmap shorter and less impressive, and it makes it true.

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Gate D1 missed on conversion but met on everything else | Do not build 1.x. Run the paywall experiment and fix the funnel. |
| 2 | Gate D1 missed on COGS only | Cost work becomes the next release: cache hit rate, autocomplete debounce, address-book prominence. |
| 3 | A 2.0 feature is requested by a single loud user | Not a trigger. D3 requires sustained, measured demand. |
| 4 | A migration trigger in [ADR-0012](adr/0012-long-term-osm-exit-path.md) fires during 1.x | Stop and reassess. A terms or pricing change invalidating the model outranks the roadmap. |
| 5 | App Review rejects the geofence justification in 1.3 | Ship 1.x without it; the feature is opt-in and nothing depends on it. |
| 6 | Retention is strong but conversion is weak | The product works and the paywall does not. Experiment before building. |

## 10. Error handling

Roadmap-level failure modes.

| Failure | Detection | Response |
|---|---|---|
| A gate metric is not instrumented | Gate review finds no data | The gate cannot be assessed; instrument first. Never pass a gate by assumption. |
| Scope added to a phase mid-flight | Review against this document | Rejected, or the phase is re-cut explicitly with a log entry |
| A trigger fires but capacity is unavailable | Gate review | Record the fired trigger; do not silently drop it |
| Cost assumptions diverge from actuals | Monthly review against [`31`](31_COST_MODEL.md) | Correct the model, then reassess D1 |

## 11. Best practices

1. **Triggers, not dates.** A date creates pressure to ship something; a trigger creates
   pressure to learn something.
2. **Instrument before the gate.** A metric added after the question is asked measures the
   wrong period.
3. **Cost metrics are product metrics here.** Cache hit rate and address-book reuse appear in
   gate D2 because they determine whether the business works, not only whether the app is
   pleasant.
4. **A phase gate is a stop, not a formality.** Missing D1 and building 1.x anyway means
   building features onto a product nobody pays for.
5. **Record fired triggers even when nothing is done.** The record is what makes the next
   decision informed.

## 12. Checklist

Before beginning any phase:

- [ ] The previous gate's metrics are instrumented and have data over the stated window.
- [ ] Every threshold is met, or the shortfall is explicitly accepted with a reason logged.
- [ ] Cost actuals reconciled against [`31_COST_MODEL.md`](31_COST_MODEL.md).
- [ ] No migration trigger in [ADR-0012](adr/0012-long-term-osm-exit-path.md) has fired.
- [ ] The phase scope matches this document; additions are logged, not assumed.
- [ ] [`35_RISK_REGISTER.md`](35_RISK_REGISTER.md) reviewed for newly-active risks.

## 13. Roadmap

*(This document is the roadmap; the section is retained for template conformance.)*

The roadmap of the roadmap: this document is reviewed at every phase gate and whenever a
trigger fires. Thresholds are revised only with a decision-log entry — a threshold quietly
lowered to pass a gate is worse than no gate.

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Roadmap created; phases gated by triggers rather than dates | Solo-developer project; dates are guesses, triggers are evidence | Product owner |
| 2026-08-06 | Time windows placed in 2.0 behind a pricing gate | Forces tier T2 on every optimization; unaffordable on the €9.99 tier | Product owner |
| 2026-08-06 | Paywall-placement experiment recorded rather than implemented | Product owner chose paywall-first for the MVP; the experiment tests it later | Product owner |

## 15. Rationale

The roadmap is gated rather than scheduled because the MVP asks a question that has not yet
been answered: **will a single professional pay roughly €10 a month to stop guessing the order
of their stops?** Every feature after the MVP assumes the answer is yes. Building them before
the answer arrives is expensive optimism.

Gate D1's conversion threshold of 15% is deliberately the first gate. It is the number that
determines whether anything else matters. The COGS threshold sits beside it because a product
that converts well and loses money per user is not a business — and unlike conversion, COGS
degrades silently.

Phase 1.x is entirely about retention rather than acquisition because of how this product
compounds. The address book grows, routes repeat, and the second month is faster than the
first — but only if import, favourites and reuse actually work. A user who retypes their
addresses every morning in month three has no reason to keep paying.

Phase 2.0 is gated hardest because both of its features degrade unit economics permanently.
Time windows in particular move every optimization to tier T2, changing the cost structure
from per-route to per-stop. That is a pricing decision wearing a feature costume, and it is
treated as one.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Date-based roadmap with quarters | Familiar; easier to communicate; creates urgency | Dates in a solo project are fiction, and fiction creates pressure to ship rather than to learn. |
| Ship 1.x features in the MVP | More complete at launch; better first impression | Delays the only question the MVP exists to answer, and adds surface to maintain before knowing whether the core works. |
| No gates; build continuously by intuition | Faster; less process | Intuition here would build features onto an unvalidated funnel. Gate D1 exists precisely to catch that. |
| Include multi-vehicle in 2.0 rather than 3.0 | Larger market; higher revenue per account | It is a different product — dashboard, roles, dispatch, B2B invoicing. Naming it 2.0 would make it feel adjacent when it is not. |
| Lower the D1 conversion threshold to 10% | More likely to pass; keeps momentum | A threshold set to be passed is not a gate. 15% is the level at which the unit economics in [`31`](31_COST_MODEL.md) close. |
