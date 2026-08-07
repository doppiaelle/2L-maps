# ADR-0011 — Quotas and entitlements are enforced server-side only

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Architecture
**Implements decisions:** D10 enforcement; C5, C12 (see [`35_RISK_REGISTER.md`](../35_RISK_REGISTER.md))

---

## Context

Every optimization and every address search costs real money
([`31_COST_MODEL.md`](../31_COST_MODEL.md)). The monetization model is a 7-day free trial that
converts automatically ([ADR-0002](0002-target-segment-and-monetization.md)), which creates a
specific exposure: a user has seven days of full access before any payment is taken, and can
cancel before it is. Without a limit, those seven days are unmetered spending on our account.

RevenueCat provides the entitlement signal, but it is an SDK running in the client. A client
reports what it is told to report. Any limit implemented in the app is a suggestion to an
attacker and a rounding error to anyone running a modified build.

A second, quieter exposure: even a legitimate paying user can generate anomalous cost through
a bug — a retry loop, a stuck autocomplete, a screen re-mounting in a cycle. The system needs
a ceiling that holds regardless of client behaviour, including our own client's bugs.

## Decision

**Entitlement is established server-side from RevenueCat webhooks, never from the client.**
RevenueCat posts subscription lifecycle events to `/revenuecat-webhook`, which verifies the
signature and writes the authoritative entitlement state into Supabase. The client's local
RevenueCat state drives UI only — showing or hiding the paywall — and is never trusted for
access control.

```
RevenueCat ──webhook (signed)──▶ /revenuecat-webhook ──▶ user_entitlements
                                                              │
Client ──JWT──▶ /optimize ──▶ read user_entitlements ─────────┘
                     │
                     ├─ no active entitlement          → 402, paywall
                     ├─ entitlement active, quota left → proceed, decrement
                     └─ entitlement active, quota gone → 429, quota message
```

**Every metered Edge Function checks entitlement and quota before calling upstream.** The
order is fixed in [ADR-0006](0006-mandatory-backend-proxy.md): JWT, entitlement, rate limit,
quota, cache, upstream, record.

**Quotas apply during the trial exactly as after it.** The trial is a free period, not an
unmetered one. Trial and paid users share the same limits; the only difference is who is
paying.

**Two independent limits, because they fail differently:**

| Limit | Purpose | Window |
|---|---|---|
| **Rate limit** | Stops runaway loops and bursts — including our own bugs | Short, per-user, per-endpoint |
| **Quota** | Bounds total monthly cost per user | Calendar month, per-user |

A rate limit protects against velocity; a quota protects against volume. Neither substitutes
for the other.

**Quota values are configuration, not code.** They live in a server-side table so they can be
adjusted without an app release — essential when a cost surprise appears mid-month. Initial
values are set in [`31_COST_MODEL.md`](../31_COST_MODEL.md) against the target-segment usage
profile with generous headroom: the limit exists to catch abuse and defects, not to
inconvenience the professional using the product as intended.

**Quota exhaustion is a designed state, not an error.** The user is told what limit was
reached, when it resets, and what they can still do — saved routes, the address book and T0
optimization remain available. A paying user hitting a ceiling with an opaque failure is a
churn event.

**Every metered call is recorded** with its endpoint, tier, cache-hit status and estimated
cost, which makes the cost model verifiable against reality rather than assumed.

## Consequences

**Positive.** Trial exposure is bounded and known: roughly $0.25 per trial user rather than
an open liability. This is what makes the trial-to-paid model financially safe.

**Positive.** A client bug cannot become an unbounded bill. The server ceiling holds whatever
the app does.

**Positive.** Usage records make COGS measurable per user and per endpoint, so the pricing in
[`31_COST_MODEL.md`](../31_COST_MODEL.md) can be validated against actual behaviour instead of
modelled behaviour.

**Negative.** Webhook delivery is asynchronous and can fail or arrive late, so entitlement
state can briefly lag a purchase — a user who has just paid may be told they have not. The app
therefore reconciles on foreground by asking the server to refresh from RevenueCat, and the
paywall offers an explicit restore path. Specified in
[`20_SUBSCRIPTIONS.md`](../20_SUBSCRIPTIONS.md).

**Negative.** Two more failure modes at the top of every metered request — 402 and 429 — each
needing a designed UI state rather than a generic error.

**Negative.** Quota configuration is operational surface: a badly chosen value silently
degrades the experience for legitimate users. Mitigated by alerting when any user reaches a
quota, which in normal operation should be rare enough to investigate individually.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Client-side quota with RevenueCat's local entitlement | No server work; instant feedback; no webhook complexity | A client-enforced limit is unenforceable. It also fails against our own bugs, which is the more likely cause of a cost incident than deliberate abuse. |
| No quota; rely on the subscription price covering usage | Simplest; no ceiling to explain; no 429 state | The trial period has no revenue at all, and a single automated or looping client could generate hundreds of dollars in days. Unbounded downside against a bounded upside. |
| Hard block at the Google Cloud billing level | One switch; guarantees the bill never exceeds a number | Fails globally rather than per-user: one abusive account takes the service down for every paying customer. A blunt instrument at the wrong layer. |
| Verify App Store and Play receipts directly instead of RevenueCat | One fewer intermediary; no revenue share | Substantially more work across two stores, with renewal, grace-period, billing-retry and refund handling to implement and maintain. RevenueCat is free below $2,500 monthly tracked revenue, so the cost only begins once the product is working. |

## References

- [`docs/13_BACKEND.md`](../13_BACKEND.md) — Edge Function pipeline
- [`docs/20_SUBSCRIPTIONS.md`](../20_SUBSCRIPTIONS.md) — entitlements, webhooks, restore
- [`docs/31_COST_MODEL.md`](../31_COST_MODEL.md) — quota values and their derivation
- [ADR-0006](0006-mandatory-backend-proxy.md) — the proxy that makes enforcement possible
