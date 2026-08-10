# 37 — Go-Live Runbook

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-09
> **Related:** [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md) · [`19_SECURITY.md`](19_SECURITY.md) · [`31_COST_MODEL.md`](31_COST_MODEL.md) · [`36_IMPLEMENTATION_PLAN.md`](36_IMPLEMENTATION_PLAN.md)

---

> **This document is for the person at the keyboard, not for the architecture.**
> It is the only document written as instructions. Everything else here explains what the
> product is; this explains what you have to go and do, in the order that keeps you safe.

---

## 1. Purpose

The code is written and tested against contracts. Nothing is connected. This document is the
sequence that connects it — every account, every key, every limit — and it is ordered so that
**no credential exists before the thing that caps its spend does.**

That ordering is the whole point. A Google Maps key with no quota and no budget alert is a
credential that can bill unbounded amounts to a card, and the risk starts the moment the key
exists, not the moment code calls it.

## 2. Goals

1. Bring the product from "compiles and tests" to "installed on a phone and working".
2. Cap every spend before the credential that could incur it exists.
3. Leave every secret in exactly one place, none of them the repository.
4. Make each step verifiable, so "done" is observed rather than assumed.

**Non-goals.** No architecture, no rationale beyond what a step needs to be done correctly, no
iOS submission — that is deferred ([ADR-0014](adr/0014-android-first-verification.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Every step in §5 | Product owner | None of it can be automated from here |
| Secret storage | Product owner | Three places only, listed in §6 |
| Spend caps | Product owner | §5 stages A and B, before any key exists |
| Verification | This document | Each step states how you know it worked |

---

## 4. Text diagrams

### The order, and why it is this order

```
  A. Budget and quotas ────────────┐  Nothing exists yet that can spend money.
                                   │  This is the only moment where that is true.
  B. Google Cloud + keys ──────────┤
                                   │  The key is created inside a cage that
  C. Supabase project ─────────────┤  already exists.
                                   │
  D. Secrets into three places ────┤  Repository never among them.
                                   │
  E. Migrations + RLS proof ───────┤  Prove a second user cannot read the first.
                                   │
  F. Map IDs ──────────────────────┤  Cosmetic; the app works without them.
                                   │
  G. Build → phone ────────────────┤  The first time it is real.
                                   │
  H. RevenueCat ───────────────────┤  Only once the app runs.
                                   │
  I. Ads + consent ────────────────┘  Last: it is the least reversible legally.
```

### Where each secret lives

```
  .env.local ──────────▶ your machine only, gitignored
       │                 EXPO_PUBLIC_* — the only values that reach the bundle

  Supabase secrets ────▶ the service account, the API keys with real billing,
       │                 the RevenueCat webhook secret

  GitHub secrets ──────▶ what CI needs to build and migrate

  the repository ──────▶ nothing. Ever.
```

---

## 5. The sequence

### Stage A — cap the spend before anything can spend it

**Do this first, on an account with no keys in it.**

1. Create a Google Cloud project. Name it `2l-maps-prod`.
2. Attach a billing account. It will ask for a card; this is unavoidable — Maps Platform has no
   keyless tier.
3. **Budgets → Create budget.** Scope it to this project. Set the amount to what you are willing
   to lose in a month, not what you expect to spend. Set alert thresholds at **50%, 90%, 100%**,
   and tick *email alerts to billing admins*.
4. **Create a second budget at 3× the first**, alerting at 100% only. The first one tells you
   something changed; the second one tells you something is wrong.

> **Verify:** the Budgets page lists two budgets, and you have an email confirming the first.
> Do not continue until that email has arrived — an alert you have not seen work is an alert
> you are trusting on faith.

5. **APIs & Services → Enable APIs.** Enable exactly these four, and nothing else:
   - Maps SDK for Android
   - Maps SDK for iOS
   - Places API (New)
   - Routes API
6. For **each** of the four: **Quotas → edit the per-day limit.** Set each to a number that
   covers your expected use with headroom, not to the default. The defaults are effectively
   unlimited. [`31_COST_MODEL.md`](31_COST_MODEL.md) has the per-call prices; multiply by the
   daily cap you set and confirm the answer is a number you would accept losing every day for
   a month.

> **Verify:** each of the four APIs shows a per-day quota that is not the default. This is the
> hard cap; the budget alert is only a warning.

### Stage B — the credentials, inside the cage

7. **Credentials → Create credentials → API key.** Name it `maps-sdk-android`.
8. **Restrict it immediately, before leaving the page.**
   - *Application restrictions* → Android apps → add package name `com.doppiaelle.twolmaps` and
     this SHA-1:

     ```
     5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
     ```

     **You can register it now, before any build has run.** `assembleDebug` signs with
     `android/app/debug.keystore`, which Expo's template ships as a fixed file rather than
     generating per machine, so every build from every runner carries that fingerprint. It is
     the standard Android debug fingerprint, it is not a secret, and it is *not* a release
     credential — which is why it may only ever be paired with a key restricted to the Maps SDK.
     The workflow prints the fingerprint on every run anyway, because "documented" and "what the
     artifact was actually signed with" are two different claims.
   - *API restrictions* → Restrict key → **Maps SDK for Android only**.
9. Create a second key, `maps-sdk-ios`, restricted to bundle ID `com.doppiaelle.twolmaps` and to
   Maps SDK for iOS only.

> **Verify:** both keys show "Restricted" in the key list. An unrestricted key on this page is
> the single most expensive mistake available in this whole document.

10. **Create a service account**, `2l-maps-edge`. Grant it no project roles — it needs none.
    Create a JSON key and download it. **This file is the one that must never touch the
    repository, a chat window, or an EAS build secret** ([`19_SECURITY.md`](19_SECURITY.md) §5).
    It goes to Supabase in stage D and is deleted from your Downloads folder afterwards.

### Stage C — Supabase

11. Create a Supabase project. **Region: an EU region** — this is risk C8 and it cannot be
    changed after creation.
12. Note the project URL and the **anon** key from Settings → API. Both are publishable: the anon
    key grants nothing on its own, because every table has RLS
    ([`19_SECURITY.md`](19_SECURITY.md) §8).
13. Note the **service role** key. This one is a real secret. It stays in Supabase and in nothing
    else.
14. **Authentication → Providers.** Enable Apple and Google. Each needs its own OAuth client;
    follow Supabase's own guide for the redirect URLs, and add `twolmaps://` as an additional
    redirect URL so the app receives the callback.

> **Verify:** Authentication → URL Configuration lists `twolmaps://` among the redirect URLs.

### Stage D — the secrets, into their three places

15. **Your machine.** Create `.env.local` at the repository root — it is gitignored, and check
    that with `git check-ignore .env.local` before writing anything into it:

    ```
    EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
    EXPO_PUBLIC_MAPS_API_KEY_ANDROID=<maps-sdk-android>
    EXPO_PUBLIC_MAPS_API_KEY_IOS=<maps-sdk-ios>
    ```

    Nothing else belongs in this file. Every `EXPO_PUBLIC_` value reaches the bundle and can be
    read by anyone who downloads the app — which is fine for these four and fatal for anything
    else.

16. **Supabase secrets** (`supabase secrets set`, or Settings → Edge Functions → Secrets):

    | Name | Value | Needed for |
    |---|---|---|
    | `GOOGLE_SERVER_API_KEY` | a *separate* server key — no referrer restriction, quota-capped in stage A | Routes, Places and Geocoding. **One key, not three:** `runtime.ts` reads this single name for all of them |
    | `REVENUECAT_WEBHOOK_SECRET` | set in stage H | Entitlement webhooks only |
    | `ANTHROPIC_API_KEY` | your Anthropic key | The import parser, unless you switch it below ([ADR-0016](adr/0016-ai-assisted-stop-entry.md)) |
    | `PARSE_PROVIDER` | `openrouter` — omit entirely for the default | Optional. Selects the parser ([ADR-0017](adr/0017-parse-provider-switch.md)) |
    | `OPENROUTER_API_KEY` | your OpenRouter key | Only when `PARSE_PROVIDER=openrouter` |
    | `PARSE_MODEL` | a model id | Optional override within whichever provider is selected |

    **`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are
    injected automatically** into every Edge Function by the platform. Do not set them by hand;
    the functions read them for the database connection and the token verifier.

    **Before you set `PARSE_PROVIDER=openrouter`, read [ADR-0017](adr/0017-parse-provider-switch.md).**
    Many free inference endpoints retain prompts for training, and a pasted delivery list is the
    addresses of your customers rather than your own. It is fine for test data. It is a decision
    to make deliberately before real ones go through it — which is why the default is Anthropic
    and the switch has to be set by hand.

    There is **no service account**. An earlier draft of this runbook asked for
    `GOOGLE_SERVICE_ACCOUNT_JSON`; nothing reads it. The Google APIs this product calls take an
    API key, and adding a service account would be a second credential to protect for no gain.

17. **GitHub secrets** (Settings → Secrets and variables → Actions):

    | Name | Used by |
    |---|---|
    | `EXPO_TOKEN` | `release` |
    | `SUPABASE_ACCESS_TOKEN` | `migrate` |
    | `SUPABASE_PROJECT_REF` | `migrate` |
    | `SUPABASE_DB_PASSWORD` | `migrate` |

> **Verify:** `git status` shows nothing new to commit. If it shows `.env.local`, stop and fix
> the ignore rule before doing anything else.

### Stage E — the schema, and the proof that RLS works

18. Run the `migrate` workflow against staging, then production. It applies the migrations and
    regenerates the database types; it fails if the generated types differ from the committed
    ones.

19. **Prove RLS.** This is the step people skip, and it is the one that matters.
    - Create two users through the app or the dashboard.
    - As user A, insert a route.
    - As user B, `select * from routes`.

> **Verify:** user B sees **zero rows**. Not "an error" — zero rows. If B sees A's route, stop
> everything: a table without a working policy is a data breach with a UI in front of it
> ([`19_SECURITY.md`](19_SECURITY.md) §8).

20. Confirm the purge job is scheduled: `select * from cron.job`. Coordinates and formatted
    addresses must be nulled at thirty days — this is a terms obligation, not a cleanup
    ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).

### Stage F — the map styles

21. Google Cloud → **Map Management → Create Map ID**, twice: one `2l-maps-light`, one
    `2l-maps-dark`, both of type *Android* (create the iOS pair later).
22. Create a map style for each, following the table in
    [`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md) §6, and associate it with
    its Map ID.
23. Add to `.env.local`:

    ```
    EXPO_PUBLIC_MAP_ID_LIGHT=<light map id>
    EXPO_PUBLIC_MAP_ID_DARK=<dark map id>
    ```

> **Verify:** the app renders a styled map. If it renders Google's default style, the Map ID is
> not resolving — that is the designed fallback, and it means step 22 did not associate the
> style. It is not an error state and the app will not tell you; you have to look.

### Stage G — onto a phone

24. Push to `main`, or run the `android-preview` workflow by hand. Download the APK artifact.
25. Install it on the Android phone. Enable "install from unknown sources" for the browser or
    file manager when it asks.
26. On your machine: `npx expo start --dev-client`, then scan the QR code with the installed app.

> **Verify:** the app opens, the map renders, and a change to a file appears on the phone within
> a second or two. From here every change arrives this way; you install the APK once
> ([ADR-0014](adr/0014-android-first-verification.md)).

27. **Walk the three journeys by hand**, with the flows in [`../.maestro/`](../.maestro) as the
    script. This is the first time anything has been verified on hardware, and it is where the
    performance budgets of `CLAUDE.md` §6 either hold or do not.

### Stage H — billing

28. Create a RevenueCat project. Add the Android app with its package name.
29. Google Play Console → create the app, then create three products:
    - `pro_monthly` — subscription, €9.99, with a 7-day free trial
    - `day_pass` — **consumable**, €1.99
    - Confirm the trial is configured as an *introductory offer*, not as a separate SKU
30. Import them into RevenueCat and attach them to an entitlement named `pro`.
31. RevenueCat → Integrations → Webhooks. Point it at
    `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, and set the authorization
    header secret. Put that same secret into Supabase as `REVENUECAT_WEBHOOK_SECRET`.

> **Verify:** send a test event from RevenueCat and confirm a row appears in `user_entitlements`.
> An unverified webhook is an open door to free entitlement
> ([`19_SECURITY.md`](19_SECURITY.md) §6), so also send one with a wrong secret and confirm it is
> **rejected**.

32. **Re-read Guideline 3.1.2 against the paywall screen** before submitting anything. The trial
    disclosure is the most likely cause of rejection ([`26_APP_STORE.md`](26_APP_STORE.md)), and
    the wording is in `features/billing/PaywallView.tsx`.

### Stage I — advertising and consent

Do this last. It is the least reversible step legally, and the product works without it.

33. Create an AdMob account and an app. Create one banner unit and one rewarded unit.
34. Configure a **certified CMP** for the EEA. Non-personalised ads until consent is given, and
    declining must cost the user nothing ([ADR-0015](adr/0015-ad-supported-free-tier.md) rule 5).
35. Fill in the Play **Data safety** form from [`../store/data-safety.md`](../store/data-safety.md).
    Do not answer it from memory; the three declarations have to agree.

> **Verify:** with a test device in the EEA, the consent flow appears before any ad, and
> declining leaves every allowance unchanged.

---

## 6. Where each secret lives, and nowhere else

| Secret | Lives in | Never in |
|---|---|---|
| Maps SDK keys (2) | `.env.local`, EAS environment | Anywhere unrestricted |
| Supabase anon key | `.env.local` | — it is publishable |
| Supabase service role key | Supabase only | The app, CI, this repository |
| The server API key for Routes/Places | Supabase secrets | The client bundle |
| Model API keys (Anthropic, OpenRouter) | Supabase secrets | The client bundle |
| RevenueCat webhook secret | Supabase secrets + RevenueCat | — |
| `EXPO_TOKEN`, Supabase CI tokens | GitHub secrets | — |

**If a secret is ever pasted into a chat, a ticket or a commit, rotate it.** Not "consider
rotating" — rotate it. Revocation is free and a leaked service account is not.

---

## 7. Environment limits

Nothing in this document can be done from the development environment that built the app: it has
no browser session, no accounts, no card, and no phone. Every step is manual by nature rather
than by omission.

The one thing that *is* automated is the build: `android-preview` produces the APK without a Mac
and without paid runner minutes.

## 8. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0006](adr/0006-mandatory-backend-proxy.md) | Every Google call except map rendering goes through an Edge Function | Why only two keys reach the client |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates perish at thirty days | Stage E step 20 |
| [0011](adr/0011-server-side-quota-enforcement.md) | Entitlement decided server-side | Stage H |
| [0014](adr/0014-android-first-verification.md) | Android-first verification | Stage G |
| [0015](adr/0015-ad-supported-free-tier.md) | Ad-supported free tier | Stage I |

**Decided here:** the ordering. Spend caps precede credentials, and the RLS proof precedes any
real data. Both are cheap to do in this order and expensive to retrofit.

## 9. Edge cases

| # | Condition | What to do |
|---|---|---|
| 1 | Budget alert fires in the first week | Look at the API breakdown before raising the cap. Autocomplete is the usual answer ([`31_COST_MODEL.md`](31_COST_MODEL.md)) |
| 2 | The map renders unstyled | The Map ID did not resolve. Designed fallback; step 22 is incomplete |
| 3 | Sign-in loops back to the sign-in screen | The redirect URL is missing `twolmaps://` (stage C step 14) |
| 4 | User B can read user A's rows | Stop. A table is missing its policy. Nothing else matters until this is false |
| 5 | The APK will not install | "Unknown sources" for the app doing the installing, not for the system |
| 6 | The webhook returns 401 for real events | The secret in Supabase and the one in RevenueCat differ |
| 7 | Quota exhausted on day one | A cap set too low is safer than one set too high. Raise it deliberately, not reflexively |

## 10. Error handling

Every step above states how to verify it. A step that cannot be verified has not been done — the
failure modes in this document are almost all silent, which is why each has an observation
attached rather than a feeling of completion.

## 11. Best practices

1. **Cap before you create.** Never a key without a quota already on the API it uses.
2. **Restrict on the creation page.** A key left unrestricted "for a minute" is one that stays so.
3. **Prove RLS with two real users.** Reading the policy is not proving it.
4. **Rotate anything that touched a chat.**
5. **Do stage I last.** Consent is the hardest thing to undo.

## 12. Checklist

- [ ] Two budgets, and an alert email received.
- [ ] Four APIs enabled, each with a non-default per-day quota.
- [ ] Both client keys restricted by package/bundle **and** by API.
- [ ] `GOOGLE_SERVER_API_KEY` in Supabase secrets, quota-capped, and not in any client build.
- [ ] Supabase project in an EU region.
- [ ] `.env.local` gitignored, and `git status` clean.
- [ ] Migrations applied; generated types match the repository.
- [ ] **User B sees zero rows of user A's data.**
- [ ] Purge job scheduled.
- [ ] APK installed; dev-client reload working.
- [ ] Three journeys walked by hand on the phone.
- [ ] Webhook accepts a signed event and rejects an unsigned one.
- [ ] Guideline 3.1.2 re-read against the paywall wording.
- [ ] Data safety form matches `store/data-safety.md` and the privacy manifest.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| Now | Stages A–H | — |
| Next | Stage I | Free tier goes live |
| Later | iOS: Developer Program, App Store Connect, TestFlight | A Mac, or a decision to pay for cloud builds |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-09 | Runbook written | The code is complete against contracts and nothing is connected | Implementation |
| 2026-08-09 | Spend caps ordered before credential creation | The risk begins when the key exists, not when code calls it | Product owner |
| 2026-08-09 | RLS proof made a blocking step with a stated observation | Reading a policy is not testing one, and the failure is silent | Security |
