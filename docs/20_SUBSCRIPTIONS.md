# 20 — Subscriptions

> **Status:** Plan comparison implemented; store checkout not yet composed
> **Owner:** Product owner / Backend
> **Last reviewed:** 2026-08-13
> **Related:** [ADR-0011](adr/0011-server-side-quota-enforcement.md) ·
> [ADR-0029](adr/0029-single-driver-wedge-and-subscription-first-freemium.md) ·
> [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)

---

## 1. Purpose

This document defines the current Free / Day pass / Pro model, the boundary between plan UI and
access control, and the work that remains before a real purchase can ship.

The backend already resolves plans and enforces quotas. Settings exposes an honest Subscription
comparison. A store SDK is not composed into the runtime yet, so the app must not show a
working-looking purchase control, invent a price or grant access locally.

There is no advertising product, ad SDK, rewarded unlock or advertising consent flow
([ADR-0029](adr/0029-single-driver-wedge-and-subscription-first-freemium.md)).

## 2. Current product ladder

The server source of truth is `supabase/functions/_shared/plans.ts`. The client values are offline
display fallbacks only.

| Plan | Route ceiling | Optimizations | Autocomplete | History UI | Window |
|---|---:|---:|---:|---|---|
| **Free** | 15 stops | 15 | 10 | Full | Calendar month |
| **Day pass** | 25 stops | 25 | 40 | Full | 24 hours from activation |
| **Pro** | 25 stops | 300 | 1,200 | Full | Calendar month |

Additional geocode, place-details and address-parsing limits are server-owned and documented by
the API contract. A lapsed or unknown entitlement resolves to Free, never to a hard lockout.

Exact prices, billing periods and any introductory offer are **provisional store configuration**.
They are intentionally absent from the current comparison until a chosen provider returns live
offerings. No document or UI may present an old illustrative amount as a purchasable offer.

The existing entitlement schema still understands a **7-day trial** as a Pro entitlement. That is
the current domain fallback, not an offer shown to users: it may only be advertised or started once
the selected store returns a matching, live introductory offer and the purchase flow below is
complete.

## 3. Runtime flow

1. The app fetches `/usage-quota`.
2. The server resolves `free`, `day-pass` or `pro` from the entitlement row and clock.
3. The UI merges returned limits over local display fallbacks.
4. Settings → Subscription marks the current plan and lets the user inspect another plan.
5. Selecting a non-current plan changes comparison state only. The status card says checkout is
   coming soon; it grants nothing.
6. Every metered endpoint independently enforces the same server allowance.

The client can explain access but cannot decide it. Editing local state, reinstalling the app or
patching the UI must never grant a paid allowance.

## 4. Own-data and History contract

Confirmed routes are the user's work product:

- Confirm awaits the route-sync attempt before opening another app.
- The local draft and departure record are durable even if remote History cannot sync. A failed
  remote save is visible and retryable; it does not prevent a driver from opening navigation.
- Reopening History hydrates the stored optimized order and does **not** call `/optimize` again.
- Editing that route creates a draft whose next optimization is a new metered action.
- Entitlement changes never make existing routes unreadable or delete them.

This is both a trust rule and a cost rule: charging an optimize request to reproduce an unchanged
saved order wastes API spend and removes the main retention benefit.

## 5. Future checkout composition

Before enabling a purchase button:

1. Choose the store/billing composition (RevenueCat remains an available adapter, not an assumed
   runtime fact).
2. Create matching products in App Store Connect and Google Play Console.
3. Return live localized price, period and eligibility from the SDK.
4. Connect purchase and restore to the existing `BillingProvider` boundary.
5. Verify the RevenueCat webhook signature and idempotency if RevenueCat is selected.
6. Refetch `/usage-quota` after purchase; wait for server confirmation rather than granting access
   from the device callback.
7. Implement purchase, cancellation, delayed-webhook, restore, grace and refund tests in both store
   sandboxes.
8. Add compliant terms/privacy and renewal text only for the offers that actually exist.

Until all eight are true, the comparison remains informational.

## 6. Entitlement resolution

| Stored status | Effective server plan | UI status |
|---|---|---|
| no row / `none` | Free | none |
| active, unexpired day pass | Day pass | active or none, depending on purchase record |
| `trial` | Pro | trial |
| `active` / `grace` | Pro | active |
| `lapsed` / `expired` / unknown | Free | lapsed or none |

The day-pass expiry is checked before subscription state because it is a clock-bounded consumable.
Its quota window starts 24 hours before its stored expiry; Free and Pro use calendar months.

## 7. Failure behavior

| Failure | Result |
|---|---|
| Quota endpoint offline | Show cached/fallback comparison as non-authoritative; metered endpoint still decides |
| Unknown entitlement status | Degrade to Free, log it, never crash or grant Pro |
| Purchase SDK absent | No active purchase control; explain that checkout is not connected |
| Purchase callback succeeds but webhook is delayed | Future flow shows activating and polls server; it never grants locally |
| Restore finds nothing | Preserve current server plan and show a specific result |
| Route save fails before handoff | Keep the durable local route, expose Retry and continue the requested navigation handoff; never claim that remote History is already in sync |

## 8. Acceptance checklist

- [x] Free / Day pass / Pro comparison uses the design system.
- [x] Current plan and live server allowances are rendered from `/usage-quota`.
- [x] Selecting a future plan cannot change entitlement.
- [x] Advertising code and UI are absent.
- [x] Confirmed route sync attempt is awaited before external handoff.
- [x] A saved optimized route reopens without another optimize call.
- [ ] Billing SDK composed with live offerings.
- [ ] Store products and localized prices configured.
- [ ] Purchase and restore verified in both sandboxes.
- [ ] Webhook and delayed-entitlement E2E verified.

## 9. Decision log

| Date | Change | Reason |
|---|---|---|
| 2026-08-08 | Free / Day pass / Pro backend ladder introduced | Remove the hard paywall and bound free usage server-side |
| 2026-08-13 | Advertising removed; checkout UI made informational until billing exists | Privacy, safety and no fake purchase path |
| 2026-08-13 | History save moved into Confirm's critical path | Prevent backgrounding from losing the route and enable cost-free reuse |
