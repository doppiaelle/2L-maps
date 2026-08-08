# 20 — Subscriptions

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0002](adr/0002-target-segment-and-monetization.md) · [ADR-0011](adr/0011-server-side-quota-enforcement.md) · [`26_APP_STORE.md`](26_APP_STORE.md)

---

## 1. Purpose

This document specifies the monetization implementation: products, the free trial, entitlement
resolution, RevenueCat integration, restore, and the paywall's compliance requirements.

**This is the highest-risk area in the product for store approval.** A free trial converting
automatically to a paid subscription is the single most common cause of App Store rejection
(risk C12), and it carries EU consumer-law obligations beyond Apple's rules (C16).

## 2. Goals

1. Convert a 7-day trial into a subscription with unambiguous disclosure.
2. Resolve entitlement server-side, never from the client.
3. Make restore reliable across devices and reinstalls.
4. Never hold the user's own data hostage.
5. Satisfy Guideline 3.1.2 and EU consumer law in every shipped language.

**Non-goals.** No pricing analysis ([`31_COST_MODEL.md`](31_COST_MODEL.md)), no quota derivation
([`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Product configuration | Product owner | App Store Connect, Play Console |
| Paywall copy | Product owner + legal review | Compliance artefact, not marketing copy |
| Entitlement truth | `/revenuecat-webhook` → `user_entitlements` | The only writer |
| Client billing UI | `BillingProvider` facade | UI only; never grants access |

---

## 4. Text diagrams

### Entitlement resolution — the trust boundary

```
   STORE                REVENUECAT              OUR SERVER            CLIENT
   ─────                ──────────              ──────────            ──────
   purchase ──────────▶ receipt
                        validated
                            │
                            ├── webhook (signed) ──▶ /revenuecat-webhook
                            │                              │
                            │                              ▼
                            │                       user_entitlements
                            │                        (authoritative)
                            │                              │
                            └── SDK state ─────────────────┼──────▶ paywall
                                                           │        show/hide
                                                           │        ONLY
                                                           ▼
                                              every metered request
                                              reads the DB, never
                                              the client's claim

   The client's RevenueCat state drives UI. It never grants access.
```

### Trial lifecycle

```
  day 0        subscribe, €0 charged
    │          status = trial, full access, quotas apply
    │
  day 5        reminder (platform-sent on iOS)
    │
  day 7        auto-renews at list price
    │          status = active
    │
    ├─ payment succeeds ──▶ active
    │
    ├─ payment fails ─────▶ grace period ──▶ expired
    │                       full access      own data only
    │                       retained
    │
    └─ cancelled before day 7 ──▶ expires at period end
                                   own data remains fully accessible
```

---

## 5. Flows

**Trial to entitlement.** The client never writes entitlement; it only reads it.

```
  paywall (discloses duration, price, renewal date, how to cancel — Guideline 3.1.2)
            │
       user starts trial
            │
            ▼
  StoreKit / Play Billing ──▶ RevenueCat ──▶ webhook (signature verified)
                                                  │
                                                  ▼
                                        entitlement row written server-side
                                                  │
                                                  ▼
                          client reads entitlement ──▶ full access, quotas applied
```

**Renewal and lapse.**

```
  day 7 ──── not cancelled ────▶ charged ──▶ entitlement continues
     │
  cancelled ──▶ access until period end ──▶ entitlement lapses ──▶ paywall
                                                  │
                                    saved routes remain readable; nothing is deleted
```

**Restore.** Restoring purchases re-reads entitlement from the server rather than trusting the
local receipt cache. A device that has been offline, reinstalled or handed over must converge on
the same answer as the server, and only the server can be right.

**Why quotas apply during the trial.** Seven days of unmetered optimization followed by a
cancellation costs more than the subscription would ever have earned (risk C11).

## 6. Products

| Product | Price | Type | Trial | Notes |
|---|---|---|---|---|
| Free | €0 | — | — | Ad-supported, permanent ([ADR-0015](adr/0015-ad-supported-free-tier.md)) |
| Day pass | €1.99 | Consumable | — | 24 hours of Pro, no ads |
| Monthly | €9.99 | Auto-renewing | 7 days | Default selection |
| Annual | €79.99 | Auto-renewing | 7 days | ~33% saving; improves retention and cash flow |

One subscription group, so a user moves between monthly and annual without losing entitlement.
**Trial eligibility is once per subscription group per account** — a user who trialled monthly
cannot trial annual.

### Allowances per rung

| | Free | Day pass | Pro |
|---|---|---|---|
| Stops per route | 15 | 25 | 25 |
| T1 optimizations | 15 / month | 25 / day | 300 / month |
| Autocomplete sessions | 10 / month | 40 / day | 1,200 / month |
| Saved routes | 3 | unlimited | unlimited |
| Ads | Yes | No | No |

**Free is capped on address search, not on stops.** A route costs $0.01 whether it carries 8
stops or 25, while an autocomplete session costs ~$0.02 and address entry is 78% of COGS
([`31_COST_MODEL.md`](31_COST_MODEL.md) §8). Restricting free users to 8 stops would save nothing
and make the product feel mean at the moment someone is deciding whether it works.

**Running out does not lock anyone out.** Past the monthly allowance the app falls back to T0,
the local solver, which costs nothing and needs no network — labelled degraded, as every T0
result is. Above the T0 ceiling of 8 stops there is nothing honest to fall back to, and that is
the one state where a free user is genuinely stopped; a rewarded ad buys one more optimization
there. An ad that fails to load grants the unlock anyway.

**The day pass is consumable, so its balance lives on the server**, keyed to the user. A store
receipt alone cannot restore it to a second device
([ADR-0011](adr/0011-server-side-quota-enforcement.md)).

**Every number above is server configuration.** The client reads them from `/usage-quota` and
carries a fallback copy only so it can render an allowance bar offline
([ADR-0015](adr/0015-ad-supported-free-tier.md)).

---

## 7. The paywall

### Required elements, all visible without scrolling

Guideline 3.1.2 requires these in the purchase flow itself, not behind a link:

1. What the subscription provides.
2. **Trial duration** — "Free for 7 days".
3. **Price after the trial and the renewal period** — "then €9.99 per month".
4. **That it renews automatically unless cancelled.**
5. **How to cancel** — "Cancel anytime in your App Store settings".
6. The subscribe action.
7. **Restore purchases** — a visible control, not hidden in settings.
8. Links to terms of service and privacy policy.

### Reference copy

Italian is authoritative for Italian users; both are reviewed together as one change
([`34_LOCALIZATION.md`](34_LOCALIZATION.md)).

> **Free for 7 days, then €9.99 per month.**
> Your subscription renews automatically unless cancelled at least 24 hours before the trial
> ends. Cancel anytime in your App Store settings.

> **Gratis per 7 giorni, poi €9,99 al mese.**
> L'abbonamento si rinnova automaticamente salvo disdetta almeno 24 ore prima del termine della
> prova. Puoi disdire in qualsiasi momento dalle impostazioni dell'App Store.

**"€0 today" is the most prominent element**, because it is the true immediate cost and the
thing that determines whether the user proceeds.

### What the paywall must not do

- Obscure the price with visual hierarchy or contrast tricks.
- Present annual as preselected without stating its total price.
- Hide restore purchases.
- Use a dismissal control that is hard to find — the paywall is dismissible, and dismissing it
  leaves the user with full access to their own data.

---

## 8. Entitlement

| Status | Meaning | Metered features | Own data |
|---|---|---|---|
| `none` | Never subscribed | Blocked | Full access |
| `trial` | In the 7-day trial | **Full, with quotas** | Full access |
| `active` | Paying | Full, with quotas | Full access |
| `grace` | Payment failed, retrying | **Full** — retained deliberately | Full access |
| `expired` | Lapsed or cancelled | Blocked | **Full access** |

**Own data is never blocked, in any state.** Saved routes, history, the address book and T0
optimization remain available to an expired user. Holding a lapsed subscriber's data hostage
converts them into a hostile former user for negligible conversion gain
([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J7).

**Grace period retains full access** because a failed payment is usually an expired card, not a
decision to leave. Cutting access during billing retry punishes the user for a bank's behaviour.

**Quotas apply during the trial exactly as after it**
([ADR-0011](adr/0011-server-side-quota-enforcement.md)). A trial is a free period, not an
unmetered one.

---

## 9. RevenueCat integration

### Webhook — the only writer of entitlement

1. **Verify the signature.** An unverified webhook is an open door to free entitlement.
2. Map the event to a status.
3. Compare event timestamp against stored state; ignore stale events.
4. Write with `updated_by = 'webhook'`.
5. Return 200 quickly — RevenueCat retries, so the handler must be idempotent by event id.

| Event | Resulting status |
|---|---|
| `INITIAL_PURCHASE` with trial | `trial` |
| `RENEWAL` | `active` |
| `BILLING_ISSUE` | `grace` |
| `CANCELLATION` | unchanged until period end, then `expired` |
| `EXPIRATION` | `expired` |
| `PRODUCT_CHANGE` | `active`, product updated |

### Client

The `BillingProvider` facade wraps RevenueCat and exposes offerings, purchase and restore. It
**never** decides access.

**Entitlement is refetched from our server on every app foreground**, because webhook delivery is
asynchronous and a user who just purchased may briefly not appear entitled. If a purchase
succeeded client-side but the server has not caught up, the client shows an optimistic
"activating" state for a bounded window and then refetches — it never grants access itself.

### Restore

Available on the paywall and in Settings. Restore reconciles with RevenueCat, then forces a
server-side entitlement refresh rather than trusting the SDK result.

---

## 10. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | 7-day trial converting to paid; no permanent free tier | Products, paywall, trial economics |
| [0011](adr/0011-server-side-quota-enforcement.md) | Entitlement written server-side by verified webhook only | Entitlement resolution, restore, quota during trial |

**Decided here:** the client's RevenueCat state drives the interface and never access. The two
can legitimately disagree — after an offline period, a refund, or a family-sharing change — and
when they do, the server is right. An app that gates on the local cache is an app whose
paywall can be removed by turning off the network.

## 11. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Purchase succeeds, webhook delayed | Bounded "activating" state, then refetch. Access granted only by the server |
| 2 | Webhook arrives out of order | Stale event ignored by timestamp |
| 3 | Webhook replayed | Idempotent by event id |
| 4 | Trial expires mid-route | The route in progress completes normally; the next optimization is blocked |
| 5 | User cancels on day 2 | Full access until day 7, then `expired` |
| 6 | Payment fails on renewal | `grace` with full access during billing retry |
| 7 | Refund issued | `expired` on the refund event |
| 8 | New device, existing subscription | Restore reconciles; server refresh confirms |
| 9 | Reinstall after expiry | Own data restored from the server; metered features blocked |
| 10 | Trial already used on this account | Store reports ineligibility; the paywall shows the price without a trial |
| 11 | Family Sharing | Handled per store rules; entitlement follows the store's determination |
| 12 | Subscription managed on another platform | Entitlement is cross-platform via RevenueCat |
| 13 | Purchase during a network failure | Store completes it; the webhook arrives later; foreground refetch resolves it |

## 12. Error handling

| Failure | Detection | User-facing result | Fallback |
|---|---|---|---|
| Purchase fails | Store error | Specific reason, retry offered | Paywall remains |
| Purchase cancelled by user | Store callback | Silent dismissal — not an error | Paywall remains |
| Webhook signature invalid | Handler | 401; logged as a **security event**; no write | None |
| Webhook handler throws | Exception | 500; RevenueCat retries | Retry |
| Entitlement fetch fails | Network | **Cached entitlement used**; retried on foreground | Cached |
| Restore finds nothing | RevenueCat | "No previous purchase found" plus a support path | — |
| Offerings fail to load | Network | Paywall shows an error with retry; **never a paywall with no price** | Retry |

**A paywall that cannot show its price must not show a subscribe control.** An unpriced purchase
prompt is both a compliance failure and a trust failure.

## 13. Best practices

1. **The client never grants access.** UI only.
2. **Verify every webhook signature.**
3. **Refetch entitlement on every foreground.**
4. **Never block the user's own data.**
5. **Retain access during grace.**
6. **Apply quotas during the trial.** An unmetered trial is risk C11 in
   [`35_RISK_REGISTER.md`](35_RISK_REGISTER.md): seven days of unlimited optimization,
   then a cancellation, costs more than the subscription would have earned.
7. **Re-read Guideline 3.1.2 before every paywall change**, in every language.
8. **Never ship a paywall without a visible restore control.**

## 14. Checklist

Before every submission:

- [ ] All eight required elements visible without scrolling, both languages.
- [ ] Price and renewal period stated in the purchase flow, not behind a link.
- [ ] Restore purchases visible on the paywall.
- [ ] Terms and privacy links functional.
- [ ] Italian copy reviewed by a native speaker for compliance precision.
- [ ] Webhook signature verification tested with an invalid signature.
- [ ] Webhook idempotency and out-of-order handling tested.
- [ ] Trial-to-paid transition tested end to end in sandbox.
- [ ] Restore tested on a clean device.
- [ ] Expired state verified to retain full access to own data.
- [ ] Grace period verified to retain metered access.
- [ ] Quotas verified active during the trial.

## 15. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Monthly and annual, 7-day trial, entitlement, restore | — |
| 1.x | Paywall-placement experiment ([`28_ROADMAP.md`](28_ROADMAP.md)) | Conversion baseline established |
| 1.x | Annual plan prominence experiment | Same |
| 2.0 | A higher tier carrying time windows and >25 stops | Gate D3 |

## 16. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | 7-day trial converting automatically; no free tier | Bounded trial cost versus perpetual free-user cost | Product owner |
| 2026-08-06 | Own data never blocked in any entitlement state | A lapsed user held hostage becomes a hostile former user | Product owner |
| 2026-08-06 | Grace period retains full access | A failed payment is usually an expired card, not a decision | Product owner |
| 2026-08-06 | Quotas apply during the trial | Seven days of unmetered access is an open liability | Architecture |
| 2026-08-06 | Paywall copy treated as a compliance artefact | C12 rejection risk and C16 consumer-law exposure | Product owner |

## 17. Rationale

The architecture's central decision is that **entitlement is a server fact**. RevenueCat's client
SDK is convenient and reports accurately in normal conditions, but it runs on a device the user
controls, and access control decided on the client is access control that can be bypassed. The
webhook writes the truth; the client renders it.

Retaining access during grace and preserving own data after expiry are both decisions that cost
a small amount of conversion pressure and buy something more valuable. A user whose card expired
is not choosing to leave, and cutting them off mid-route over a bank's retry schedule produces
a support ticket and a bad review. A lapsed user whose saved routes still open is a user who
might resubscribe; one locked out of two months of their own work will not.

The paywall is treated as a compliance artefact rather than a conversion surface because the
downside is asymmetric. A slightly less persuasive paywall costs some percentage of conversions;
a non-compliant one costs the release, and repeated rejections cost weeks. The required elements
are stated as a checklist precisely so they are not eroded by well-intentioned optimisation.

## 18. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Client-side entitlement from the RevenueCat SDK | Simpler; instant; no webhook | A client reports what it is told. Access control belongs on the server |
| Freemium with a limited free tier | Larger funnel; word of mouth | Perpetual per-user cost with no revenue ([`31`](31_COST_MODEL.md)) |
| No trial, paid immediately | No 3.1.2 exposure; simpler compliance | Very few users pay for an unfamiliar tool sight-unseen |
| 14-day trial | More time to build a habit | Doubles trial API cost and gives more time to forget the product entirely |
| Blocking own data on expiry | Stronger conversion pressure | Produces hostile former users and bad reviews for negligible gain |
| Cutting access during grace | Protects against genuine non-payers | Punishes users for a bank's retry schedule; most grace cases recover |
| Direct StoreKit and Play Billing | No intermediary; no revenue share | Substantially more work across two stores; RevenueCat is free below $2,500 monthly tracked revenue |
