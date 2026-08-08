# ADR-0015 — Ad-supported free tier, and the monetisation ladder above it

**Status:** Accepted
**Date:** 2026-08-08
**Deciders:** Product owner
**Amends:** [ADR-0002](0002-target-segment-and-monetization.md) — specifically its
"no permanent free tier" decision, which is reversed here for reasons ADR-0002 could not
have weighed at the time.

---

## Context

[ADR-0002](0002-target-segment-and-monetization.md) rejected a free tier on arithmetic:
a free user costs $0.30–0.80 every month, indefinitely, and at a realistic 10:1
free-to-paid ratio the free base consumes the entire gross margin of the paid base.

That arithmetic was correct for the free tier it modelled. It modelled the wrong one.

**The rejected design capped the cheap axis.** ADR-0002's alternatives table describes
"freemium with a limited free tier (e.g. 10 stops)". A stop limit constrains
optimization, and [`31_COST_MODEL.md`](../31_COST_MODEL.md) §8 measures optimization at
**6% of per-user COGS** — $0.01 per route, flat, whether the route has 8 stops or 25.
Address entry is **78%**. A free tier capped at 10 stops therefore leaves 78% of the cost
uncapped while making the product look mean about the part that costs nothing.

Two further facts changed since ADR-0002:

**ADR-0002 recorded two unresolved negatives, and a free tier resolves both.** It called
the auto-renewing trial "the single most common cause of App Store rejection" (risk C12,
high), and it recorded that "a hard paywall before the user has seen the product's value
costs conversion" — deferring the fix to a post-launch experiment. A genuine free tier
removes the hard paywall entirely, which is the experiment, and it makes the trial
optional rather than the only door in, which is the largest single reduction in review
risk available to this product.

**Ad revenue is small, and its size decides the design.** Modelled for a utility app in
Italy: banner eCPM roughly €0.50–2.00, rewarded video €5–20 (medium confidence,
unverified against a live account — recorded the same way external figures are treated in
[`33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) §8). A free user generating ~130 banner
impressions a month earns **€0.13–0.26**. That is the budget. It is not a revenue line;
it is a cost ceiling, and every limit below is derived from it rather than chosen for
generosity.

## Decision

**A permanent free tier exists, supported by advertising, and its limits are set on
address search rather than on stops.**

### The ladder

| Rung | Price | Stops/route | T1 optimizations | Autocomplete sessions | Ads |
|---|---|---|---|---|---|
| **Free** | €0 | 15 | 15 / month | 10 / month | Yes |
| **Day pass** | €1.99, consumable | 25 | 25 / day | 40 / day | No |
| **Pro** | €9.99/month · €79.99/year | 25 | 300 / month | 1,200 / month | No |

Below the free allowances the product does not stop working: it falls back to **T0**, the
local solver, which has **zero marginal cost** and needs no network
([ADR-0003](0003-tiered-optimization-cascade.md)). A free user is therefore never locked
out, only degraded — and the degradation is labelled, as it always is
(`CLAUDE.md` §7 rule 6).

**Fifteen stops on the free tier is deliberate and costs nothing.** T1 bills per request,
not per stop. Restricting free users to 8 would save $0.00 and make the free tier feel
punitive at exactly the moment a user is deciding whether the product works.

**Ten autocomplete sessions is the real limit, and it is where the money is.** At ~$0.02
a session that is $0.20 a month. Address entry stays cheap for free users the same way it
does for paying ones — address book first, paste import second (4× cheaper per address
via batch geocoding), search last — except that for free users the last one runs out.

### Free-tier cost envelope

| Line | Monthly | Basis |
|---|---|---|
| Autocomplete, 10 sessions | $0.20 | [`31_COST_MODEL.md`](../31_COST_MODEL.md) §6 |
| Import, 25 addresses batch-geocoded | $0.13 | |
| Optimization, 15 × T1 | $0.15 | |
| **Total** | **~$0.48** | |

Against €0.13–0.26 of banner revenue this **does not close**, and saying otherwise would
make the model fiction. Two things close it, and both are structural rather than hopeful:

1. **Rewarded ads are coupled to the metered action.** A banner earns whether or not the
   user costs us anything; a rewarded ad earns *at the moment the cost is incurred*. Past
   the monthly allowance, one rewarded view buys one T1 optimization. This is the only ad
   format whose revenue scales with COGS instead of with session time.
2. **The allowances are server configuration, not app constants**
   ([ADR-0011](0011-server-side-quota-enforcement.md)). Gate D1 measures realised eCPM and
   realised free-tier COGS against each other and the allowances move, without an app
   release.

**The free tier is an acquisition channel held to cost-neutrality, not a revenue line.**
If measurement shows it running at a loss per user, the allowances fall. That is the
control, and it is why the numbers above live in server config.

### Rules the advertising must obey

These are constraints, not preferences. A build violating any of them does not ship.

1. **No ad during a route.** Not a banner, not an interstitial, not a rewarded prompt.
   The user is driving (`CLAUDE.md` §7 rule 8), and this is a safety rule before it is a
   UX one.
2. **No ad over the map.** The map is quiet (`CLAUDE.md` §8 rule 5). Ads live in the stop
   list and on the result screen, in a reserved slot that is laid out whether or not an
   ad fills it — a banner that pops in and reflows the list moves the row under the
   user's thumb.
3. **The ad SDK receives no product data.** No address, no coordinate, no `place_id`, no
   route. This is `CLAUDE.md` §9 rule 7 applied to a category of SDK that exists to
   collect exactly those things, and it is why the SDK sits behind an `AdsProvider`
   facade like every other external capability (`CLAUDE.md` §1).
4. **Non-personalised ads until consent exists, and a certified CMP in the EEA.** Google
   requires a Google-certified Consent Management Platform for EEA and UK traffic;
   ePrivacy requires consent for the device storage an ad SDK uses even when the ads are
   non-personalised. Detailed in [`32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md).
5. **Declining consent costs the user nothing.** They receive non-personalised ads and
   the same free allowances. A consent dialog that degrades the product on refusal is a
   dark pattern and, under the GDPR, not consent.
6. **A failed or unfilled ad is never a blocker.** No fill, no network, SDK error — the
   reserved slot stays empty and the user continues. For a rewarded unlock, an ad that
   fails to load grants the optimization anyway. Charging a user for our fill rate is
   indefensible, and it is `CLAUDE.md` §0 rule 5 with money attached.

### What Pro sells, now that free exists

Not stop count — that ladder is 15 → 25 and thin on its own. Pro sells **volume, absence
of ads, and everything that accumulates**: full route history, export, saved favourites
beyond a handful, and the constraint-aware tiers. The free tier keeps the last 3 routes.

### The trial survives, in a different role

The 7-day Pro trial remains, but it is no longer the only door. The paywall stops being a
wall the user meets before seeing the product, and becomes an offer they meet when a
limit binds — which is also the moment it converts best.

## Consequences

**Positive.** The two negatives ADR-0002 recorded as unresolved are resolved: risk C12
falls from high to **medium** because the hard paywall is gone, and the "user cannot see
value before paying" problem disappears because they can see all of it. Top of funnel
widens at a cost that is bounded by construction and adjustable without a release.

**Negative.** Entitlement is no longer a boolean. It becomes a three-value plan with
per-plan allowances, and that touches every quota check, the `BillingProvider`, the
entitlement table, and the seven-step pipeline's step 2. ADR-0002 listed "entitlement
logic is a single boolean rather than a tier matrix" as a benefit of its decision; that
benefit is now spent, deliberately.

**Negative and material.** An advertising SDK is a data-collection component in a product
whose compliance posture is built on collecting as little as possible. It adds a CMP, a
consent state to persist and honour, an App Store privacy declaration ("Third-Party
Advertising"), an ATT prompt on iOS, and a permanent obligation to keep product data away
from it. This is real surface area and is recorded as risk **C18**.

**Negative.** A consumable day pass adds a purchase type with different semantics from a
subscription: it is not restorable across devices from the store receipt alone, so the
balance is held server-side and keyed to the user, which is where entitlement already
lives ([ADR-0011](0011-server-side-quota-enforcement.md)).

**Neutral.** Free users cost money on day one, before any subscriber exists. Break-even
moves out. The fixed-cost base is small enough (~$25/month after
[ADR-0014](0014-android-first-verification.md)) that this is measured in a handful of
subscribers, not in a runway.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Keep ADR-0002 unchanged — trial to paid, no free tier | Cleanest economics; one boolean; no ad SDK, no CMP, no ATT | Leaves the highest-severity review risk in place and keeps a hard paywall in front of a product whose value is only legible after it is used once |
| Free tier capped at 8–10 stops, no ads | Simple; the design ADR-0002 modelled | Caps 6% of cost and leaves 78% uncapped, while making the product feel mean about the free part |
| Banner ads only, no rewarded | Least intrusive; simplest integration | Revenue is uncoupled from cost. A user who optimizes thirty times earns us the same as one who opens the app and leaves |
| Interstitial between optimize and result | Highest eCPM per placement in the flow | Lands exactly on the three-tap path (`CLAUDE.md` §7 rule 1) and on the moment the user is about to drive |
| Ads for everyone including subscribers | Revenue on every user | Paying to remove ads is most of what "no ads" means as a Pro feature; keeping them insults the purchase |
| Lower Pro to €7.99 as suggested | Perceived accessibility | Cuts gross margin ~20% with no evidence of a conversion gain. Price is store configuration and testable post-launch; recorded as an experiment, not an MVP change |

## References

- [ADR-0002](0002-target-segment-and-monetization.md) — the decision this amends
- [ADR-0003](0003-tiered-optimization-cascade.md) — why T0 can absorb an exhausted allowance
- [ADR-0011](0011-server-side-quota-enforcement.md) — why the allowances are server config
- [`docs/31_COST_MODEL.md`](../31_COST_MODEL.md) — the 78%/6% split this decision turns on
- [`docs/20_SUBSCRIPTIONS.md`](../20_SUBSCRIPTIONS.md) — products, offers, entitlements
- [`docs/32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md) — CMP, ATT, privacy declarations
