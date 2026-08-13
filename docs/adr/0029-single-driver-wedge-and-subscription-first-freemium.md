# ADR-0029 — Single-driver wedge and subscription-first freemium

**Status:** Accepted
**Date:** 2026-08-13
**Deciders:** Product owner
**Supersedes:** the advertising decision in
[ADR-0015](0015-ad-supported-free-tier.md) and the target ordering in
[ADR-0002](0002-target-segment-and-monetization.md)

---

## Context

The market is real, but it contains two different products that must not be conflated.
Enterprise vehicle-routing systems plan fleets, capacities, time windows, depots and live
dispatch. UPS describes ORION as a proprietary system integrated with its handheld and
navigation stack; OptimoRoute and Routific sell multi-driver planning, scheduling, time windows
and spreadsheet/API workflows. That is not the product this repository can win with today.

The narrower problem is still painful: one independent driver receives a disordered list of
roughly 10–25 addresses and needs a usable visit order in seconds. Existing individual-driver
products validate willingness to pay, while Google Routes documents both waypoint-order
optimization and a 25-intermediate-waypoint request ceiling. External navigation remains the
correct boundary: this app plans the day and the installed navigator drives it.

The earlier documentation alternated between sales agents, technicians and couriers as the
primary user, and between a hard trial paywall and an advertising-funded free tier. That ambiguity
made product, cost and privacy decisions impossible to evaluate consistently.

## Decision

### Product wedge

The primary user is a **single independent or subcontracted last-mile driver**, using one vehicle
and planning **10–25 stops** for the current shift. Local retail delivery is included. Field
technicians are the secondary segment; sales agents are adjacent, not the design centre.

The differentiator is not enterprise VRP. It is the shortest path from an unstructured source to
a route:

1. paste text copied from a message or manifest;
2. photograph or import a list when that flow is production-ready;
3. resolve addresses with explicit user confirmation;
4. optimize once;
5. save the confirmed result and reopen it from History without buying the same optimization
   again;
6. hand the complete route to the user's navigator.

Multiple vehicles, dispatch dashboards, driver assignment, capacity, time windows, telematics and
dynamic re-optimization remain out of scope until usage proves a separate fleet product.

### Monetization

The product is **subscription-first freemium with no advertising**:

- **Free** is a bounded acquisition and evaluation allowance enforced by the server.
- **Day pass** serves occasional paid work without forcing a recurring commitment.
- **Pro** serves regular working use.
- Exact store prices and introductory offers are provisional until the billing provider and store
  products are configured and tested. UI may compare plans before checkout exists, but it must not
  simulate a purchase.
- There is no banner, interstitial, rewarded unlock, advertising identifier, ad SDK or consent
  flow. Free usage is treated as acquisition cost and tuned through server allowances.

History is a core retention and cost-control feature, not a premium hostage surface. A route that
the user confirmed must be recorded durably on the device and its remote sync attempted before
external navigation opens. A remote failure stays visible and retryable without blocking the
driver. Once synced, the route remains readable after entitlement changes and reopens in its saved
optimized order without calling the optimizer again.

## Consequences

**Positive.** The UI, onboarding, import work and acquisition message now optimize for one urgent
job. The same route can be reused without duplicate API cost. Removing advertising also removes a
privacy SDK, EEA consent surface and an interaction that is inappropriate in a driving tool.

**Positive.** Free, day-pass and Pro server plans already exist, so this decision narrows rather
than replaces the backend. Limits remain server-owned and can be tuned from observed cost and
conversion.

**Negative.** A bounded free tier has real acquisition COGS without ad revenue. Its allowance must
therefore be measured and lowered if it does not convert or retain useful users.

**Negative.** The 10–25-stop wedge deliberately excludes high-volume rounds and fleet buyers. The
app must explain its ceiling honestly rather than imply enterprise capability.

## Evidence and references

- [Google Routes — optimize waypoint order](https://developers.google.com/maps/documentation/routes/opt-way)
- [Google Routes — intermediate waypoint limits](https://developers.google.com/maps/documentation/routes/intermed_waypoints)
- [UPS — purpose-built navigation and ORION](https://about.ups.com/us/en/newsroom/press-releases/innovation-driven/ups-deploys-purpose-built-navigation-for-ups-service-personnel.html)
- [OptimoRoute — optimized route planning](https://help.optimoroute.com/hc/en-us/articles/27712119329172-Intro-to-optimized-route-planning)
- [Routific — delivery route optimization](https://www.routific.com/food-and-beverage-delivery-route-optimization)
- [Spoke — individual driver products and pricing](https://help.spoke.com/en/articles/1925291-spoke-products-pricing)

## Alternatives considered

| Alternative | Attraction | Why rejected now |
|---|---|---|
| Fleet VRP product | Larger contracts and richer constraints | Requires dispatch, roles, multiple vehicles, operations support and a web product |
| Sales agent as primary | Clear recurring routes and willingness to pay | Less acute daily pain and weaker fit with the fastest-list-import wedge |
| Hard trial paywall | Bounded acquisition cost | Hides value before the first optimized route and adds auto-renewal friction |
| Ad-supported free tier | Offsets some free COGS | Privacy, consent and safety surface exceeds likely revenue; conflicts with the focused work tool |
| Unlimited free optimization | Fast adoption | Creates unbounded third-party API liability |
