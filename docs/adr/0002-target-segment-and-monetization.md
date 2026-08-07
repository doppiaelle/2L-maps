# ADR-0002 — Target segment and monetization model

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Product owner
**Implements decisions:** D2, D10

---

## Context

The product solves one problem: given a list of addresses, produce the best order to visit
them. Google Maps, Apple Maps and Waze all fail at this — Google Maps accepts up to ten stops
but visits them **in the order you typed them**, and Waze and Apple Maps accept one
destination at a time.

Who has this problem determines everything downstream: the stop-count ceiling, which
optimization engine is affordable, the database schema, and whether the unit economics close.

Three candidate segments were modelled against real cost data (see
[`31_COST_MODEL.md`](../31_COST_MODEL.md)):

| Segment | Stops/day | Monthly COGS/user | Viability at consumer pricing |
|---|---|---|---|
| Single professional (agent, technician, installer, small courier) | 5–25 | ~$1.02 | **Healthy** |
| High-volume courier | 30–100 | ~$18.00 | Negative margin after store commission |
| B2B fleet, multiple vehicles and drivers | any | varies | Viable, but requires a web dashboard, driver management, roles and B2B invoicing — a different product |

The high-volume courier case fails because above 25 stops the cascade must escalate to the
Route Optimization API, which bills **per stop** rather than per request. Thirty stops
optimized twice a day for twenty-two days is 1,320 billable units per user per month.

A second question was whether to offer a permanent free tier. Modelling showed a free user
costs $0.30–0.80 every month, indefinitely. At a realistic 10:1 free-to-paid ratio, free
users consume the entire gross margin of the paying ones.

## Decision

**Target segment: the single mobile professional, one vehicle, 5–25 stops per day.**
Multi-vehicle and fleet management are explicitly out of scope for the MVP and are recorded
as a phase-3 possibility in [`28_ROADMAP.md`](../28_ROADMAP.md), not a commitment.

**Monetization: no permanent free tier.** The app ships a single auto-renewing subscription
with a **7-day free trial** — a StoreKit introductory offer on iOS and a base plan offer on
Google Play — which converts to paid automatically unless cancelled. Monthly and annual
options; no one-time purchase, no lifetime unlock.

**The paywall appears immediately after onboarding.** The trial starts at €0 and renews at
list price on day 8.

**Quotas are enforced server-side during the trial as well as after it.** An unmetered trial
lets a user consume hundreds of optimizations in seven days and cancel.

## Consequences

**Positive.** Every user is either in a bounded 7-day trial (~$0.25 of total API cost) or
paying. The perpetual free-rider cost of freemium disappears. At €9.99/month under the Apple
Small Business Program (15% commission), net revenue is €8.49 against ~€1.02 COGS — a 75%
gross margin, break-even at roughly seven subscribers against ~$50/month of fixed costs.
Entitlement logic is a single boolean rather than a tier matrix.

**Negative and significant.** Free trials with automatic renewal are the single most common
cause of App Store rejection. Guideline 3.1.2 requires the paywall to state trial duration,
price after trial, renewal period and cancellation method unambiguously, in the purchase
flow itself. This raises the review risk from routine to high and is tracked as risk C12 in
[`35_RISK_REGISTER.md`](../35_RISK_REGISTER.md).

**Negative.** EU consumer law adds obligations beyond Apple's: the Codice del Consumo and
Directive 2011/83/EU require clear pre-contractual information and a right of withdrawal.
Specified in [`32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md).

**Negative.** A hard paywall before the user has seen the product's value costs conversion.
The optimizer's worth is only legible once the user watches their stops reorder. Recorded as
a post-launch experiment in the roadmap: a variant that reveals one optimization before the
paywall. This is a test, not an MVP change.

**Constraint inherited.** The 25-stop ceiling is now a product boundary, not merely a
technical one. It is enforced in the UI and on the server, and it is what keeps the cascade
in tier T1 where a route costs $0.01 regardless of stop count.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Freemium with a limited free tier (e.g. 10 stops) | Larger top of funnel; word of mouth | Each free user costs $0.30–0.80/month forever. At 10:1 ratio the free base consumes the margin of the paid base. Requires a tier matrix in every quota check. |
| High-volume courier segment | Higher willingness to pay; clearer pain | Above 25 stops the Route Optimization API bills per stop: ~$18/month COGS against a consumer subscription price. Negative margin without hierarchical chunking and aggressive quotas, neither of which belongs in an MVP. |
| B2B fleet product | Justifies the Route Optimization API cost entirely; higher contract values | Requires a web dashboard, driver and role management, dispatch and B2B invoicing. That is a different product with a different team shape, not a mobile app. |
| One-time purchase | No subscription fatigue; no renewal disclosure risk | COGS is recurring and proportional to usage. A one-time fee against a perpetual per-use cost is structurally loss-making for any active user. |
| All three segments in phases | Maximum eventual reach | Designing for all three now means designing for none well. The schema is kept multi-vehicle-ready (see [`12_DATABASE.md`](../12_DATABASE.md)) without building it. |

## References

- [`docs/31_COST_MODEL.md`](../31_COST_MODEL.md) — unit economics and the figures above
- [`docs/20_SUBSCRIPTIONS.md`](../20_SUBSCRIPTIONS.md) — products, offers, entitlements
- [ADR-0003](0003-tiered-optimization-cascade.md) — why 25 stops is the pivotal number
