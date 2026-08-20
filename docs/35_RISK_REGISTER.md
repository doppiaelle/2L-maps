# 35 — Risk Register

> **Status:** Live document — reviewed at every phase gate
> **Owner:** Product owner
> **Last reviewed:** 2026-08-20
> **Related:** [`28_ROADMAP.md`](28_ROADMAP.md) · [`31_COST_MODEL.md`](31_COST_MODEL.md) · [`41_HERE_MIGRATION_PROGRAM.md`](41_HERE_MIGRATION_PROGRAM.md) · [`adr/`](adr/)

---

## 1. Purpose

This is the single live register of everything that could damage the project, with an owner, a
trigger that tells us it is happening, and a response prepared in advance.

Google-era risks referenced elsewhere as C1–C19 and strategic risks S1–S4 are defined here.
Hybrid migration risks use H1–H13. Other documents cite the identifier; this file holds the
definition, so a risk cannot be described two different ways.

## 2. Goals

1. Give every risk a detection trigger — a risk nobody notices is not managed.
2. Assign an owner. An unowned risk is a hope.
3. Prepare the response before the risk fires, when there is time to think.
4. Distinguish risks that are *accepted* from risks that are *mitigated*.

**Non-goals.** Not a defect tracker, not a backlog.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Register accuracy and review | Product owner | Reviewed at every phase gate |
| Technical risk detection | Architecture | Owns triggers C1, C3, C5, C6, C13, C15 |
| Compliance risk | Product owner | Owns C4, C8, C9, C12, C16 |
| Cost risk | Architecture | Owns C1, C2, C11 — reviewed monthly against actuals |

---

## 4. Text diagrams

### Risk heat map

```
                          IMPACT
              low          medium         high
           ┌────────────┬────────────┬─────────────────────┐
      high │            │  C11       │  C2  C12  C17  C18  │
           │            │            │  cost, App Review,  │
           │            │            │  iOS unverif., ads  │
   L       ├────────────┼────────────┼─────────────────────┤
   I  med  │  C14  C15  │  C6  C13   │  C1  C7  C8  C19    │
   K       │            │            │  economics, review, │
   E       │            │            │  GDPR, photo data   │
   L       ├────────────┼────────────┼─────────────────────┤
   I  low  │            │  C9  C10   │  C3  C4  C5  C16    │
   H       │            │            │  terms violations   │
   O       └────────────┴────────────┴─────────────────────┘
   O
   D       Low likelihood + high impact = the compliance risks.
           Low because they are designed against; high because
           the consequence is termination or rejection.
```

### Risk lifecycle

```
  identified ──▶ mitigated ──▶ monitored ──▶ closed
       │              │             │
       │              │             └─▶ fired ──▶ response executed
       │              │                                │
       │              └─────── residual accepted ◀─────┘
       │
       └─▶ accepted (no mitigation justified)
```

---

## 5. Flows

**A risk's life.** The register is only useful if entries move; a static register is a document
nobody reads twice.

```
  identified ──▶ rated (impact × likelihood) ──▶ owner assigned ──▶ trigger stated
                                                                        │
                                     ┌──────────────────────────────────┤
                                     ▼                                  ▼
                              trigger fires                     mitigated structurally
                                     │                                  │
                                     ▼                                  ▼
                        prepared response executed              re-rated; may close
                                     │
                                     ▼
                        recorded in the decision log — including
                        whether the prepared response actually worked
```

**How a risk is accepted rather than mitigated.** Some risks have no mitigation: S2 (nobody
pays) and S3 (Google adds this feature) are real and unmanageable. They are recorded as accepted
so the register stays honest. A register claiming everything is under control is a register
whose ratings mean nothing.

**How a risk is reviewed.** Compliance risks are re-verified before every store submission,
cost risks monthly against actuals, and strategic risks whenever the relevant provider makes an
announcement. A risk reviewed only when it fires was never being managed.

## 6. The register

### Economic risks

#### C1 — Optimization cost structure inverts if the wrong engine is used

| | |
|---|---|
| **Description** | The Route Optimization API bills per stop; `computeRoutes` with `optimizeWaypointOrder` bills per request. Using the former where the latter suffices costs ~25× more on a 25-stop route. |
| **Likelihood / Impact** | Medium / High |
| **Status** | **Mitigated** — the T0–T3 cascade ([ADR-0003](adr/0003-tiered-optimization-cascade.md)) |
| **Trigger** | Tier T2 usage exceeds 5% of optimizations; or average cost per optimization exceeds $0.03 |
| **Response** | Audit the tier-selection rule. T2 above 25 stops is expected; T2 below 25 indicates a defect. |
| **Owner** | Architecture |

#### C2 — Google Places dominates COGS and can escape control

| | |
|---|---|
| **Description** | Autocomplete is the largest single cost line — roughly 3.5× the routing cost for the target profile before mitigations. Session tokens, debounce and address-book reuse bring it down by ~75%; any regression in those silently restores the original cost. |
| **Likelihood / Impact** | **High / High** — the most likely risk to fire |
| **Status** | Mitigated, monitored |
| **Trigger** | Places cost per active user exceeds $1.50/month; or address-book reuse rate falls below 40%; or autocomplete requests per session exceed 6 |
| **Response** | Verify session tokens are active; raise the debounce; raise the character minimum; make the address book more prominent in the add-stop flow. |
| **Owner** | Architecture |

#### C11 — Trial users consume unmetered API budget

| | |
|---|---|
| **Description** | A 7-day trial gives full access before any payment. Without server-side limits, a user can consume hundreds of optimizations and cancel. |
| **Likelihood / Impact** | High / Medium |
| **Status** | **Mitigated** — server-side quotas apply during the trial ([ADR-0011](adr/0011-server-side-quota-enforcement.md)) |
| **Trigger** | Any user reaching quota; or trial COGS exceeding $0.50 per trial |
| **Response** | Quota values are server configuration and adjustable without a release. Investigate each occurrence individually — in normal use this should be rare. |
| **Owner** | Architecture |

---

### Platform and review risks

#### C12 — Free trial with auto-renewal is rejected by App Review

| | |
|---|---|
| **Description** | Guideline 3.1.2 requires the paywall to state trial duration, price after trial, renewal period and cancellation method unambiguously in the purchase flow. This is the most common cause of rejection for trial-based apps. |
| **Likelihood / Impact** | **High / High** |
| **Status** | Mitigated by design; residual accepted |
| **Trigger** | Any rejection citing 3.1.x; or a paywall change merged without a compliance re-read |
| **Response** | The compliant paywall copy is pre-written in [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md) and re-verified before every submission. A rejection is answered with the specific guideline text and a screenshot of compliance. |
| **Owner** | Product owner |

#### C7 — Background location permission is refused or rejected

| | |
|---|---|
| **Description** | Geofenced arrival detection needs `UIBackgroundModes: location`, an area of intense App Review scrutiny. The feature may be rejected, or users may simply decline the permission. |
| **Likelihood / Impact** | Medium / High |
| **Status** | Mitigated — the feature is opt-in and deferred to release 1.3 ([`28_ROADMAP.md`](28_ROADMAP.md)) |
| **Trigger** | Rejection citing background location; or opt-in acceptance below 20% |
| **Response** | Ship without it. Nothing depends on it: manual progression and Live Activities cover the same journey. |
| **Owner** | Product owner |

#### C9 — The name implies affiliation with Google

| | |
|---|---|
| **Description** | "2L Maps" may suggest a Google product. The platform terms forbid use of Google trademarks and require attribution. |
| **Likelihood / Impact** | Low / Medium |
| **Status** | **Open — decision required before submission** |
| **Trigger** | Store rejection, or a trademark complaint |
| **Response** | Evaluate a rename before first submission; ensure "Powered by Google" attribution is present wherever required. |
| **Owner** | Product owner |

#### C10 — Expo Go cannot run the app

| | |
|---|---|
| **Description** | A development build is required from day one, and the reason is sharper than "native modules". Detecting which navigation apps are installed depends on build-time manifest declarations (`LSApplicationQueriesSchemes`, Android `<queries>`) that Expo Go cannot carry, since it ships its own manifest; in-app purchases need native configuration it also lacks. Those are the product's two edges, so Expo Go could verify the middle of it and neither end. |
| **Likelihood / Impact** | Low / Medium |
| **Status** | Accepted — CI produces the development build ([ADR-0014](adr/0014-android-first-verification.md)) |
| **Trigger** | Onboarding friction for a new contributor |
| **Response** | The development build is a CI artifact: installed once, then every change arrives by QR code with no rebuild. |
| **Owner** | Architecture |

#### C17 — iOS ships unverified on hardware

| | |
|---|---|
| **Description** | Verification is Android-first ([ADR-0014](adr/0014-android-first-verification.md)) because installing on an iPhone requires the Apple Developer Program. iOS is covered by tests and by code review, and by nothing that runs on an Apple device. |
| **Likelihood / Impact** | **High / High** — not a possibility but the current state |
| **Status** | **Accepted deliberately**, not mitigated. No amount of design removes Apple's provisioning requirement. |
| **Trigger** | The first iOS-specific defect, or the decision to submit to the App Store |
| **Response** | The facades keep platform-specific code in three known places, so an iOS pass is bounded work rather than an audit of everything. Nothing iOS-specific is claimed verified in the meantime. |
| **Owner** | Product owner |

#### C18 — The advertising SDK would be a data collector inside a data-minimising product

| | |
|---|---|
| **Description** | An ad-funded free tier would introduce an SDK whose business is collecting exactly what this product is built not to collect, plus CMP, ATT and store-declaration obligations. |
| **Likelihood / Impact** | **High / High** — the obligation is certain, and a consent or disclosure defect is a store rejection or a regulator's letter, not a bug |
| **Status** | **Eliminated for the current product** — ADR-0029 rejects advertising and the provider, adapter and unlock states were removed |
| **Trigger** | Any future proposal to add an ad SDK or advertising identifier |
| **Response** | Require a new ADR and reopen the full privacy, consent, safety and unit-economics analysis before adding a dependency |
| **Owner** | Product owner |

#### C19 — Photographed lists carry third-party personal data

| | |
|---|---|
| **Description** | The photo path of AI-assisted entry ([ADR-0016](adr/0016-ai-assisted-stop-entry.md)) sends an image of a delivery sheet or manifest to a model provider. That image contains names and addresses of people who are not our user and have agreed to nothing. The user becomes a controller, we become a processor, the provider a sub-processor — a relationship this product otherwise does not have. |
| **Likelihood / Impact** | **Medium / High** — medium only because paste and dictation ship first and carry none of it |
| **Status** | Open. The photo path does not ship until the response is in place. |
| **Trigger** | Shipping the photo path; a subject access or erasure request touching a parsed image |
| **Response** | A data processing agreement with the provider is a precondition, with zero retention requested where offered. The image is transient — parsed and discarded, never stored, never logged, never in a crash report. The screen states what leaves the device before it leaves. Paste and dictation deliver most of the cost saving with none of this, and are the default. |
| **Owner** | Product owner |

---

### Terms and legal risks

*Low likelihood because they are designed against; high impact because the consequence is
account termination or a blocked release.*

#### C3 — Google-derived content displayed on a non-Google map

| | |
|---|---|
| **Description** | The "No Use With Non-Google Maps" clause applies per API. Rendering a Google polyline or geocode on MapLibre, Apple Maps or any third-party map is a violation. |
| **Likelihood / Impact** | Low / High |
| **Status** | Mitigated — `react-native-maps` with Google provider on both platforms ([ADR-0005](adr/0005-map-engine-and-route-preview.md)) |
| **Status** | **Realised, knowingly.** The route preview is drawn by us and shows Google-derived coordinates and geometry ([ADR-0021](adr/0021-drawn-route-preview.md)). The decision was the product owner's, taken against an explicit recommendation. |
| **Exposure** | Revocation of the Maps Platform key, which stops the app for every user at the same moment. Verifiable by a store reviewer. |
| **What is still honoured** | Attribution on the canvas, no tile fetched or cached, the thirty-day coordinate rule enforced. |
| **Reversal** | `git revert` of the removal commit, plus reissuing the Maps API key and its bundle-ID and SHA-1 restrictions in the Cloud console. |
| **Trigger** | Any pull request introducing a second map engine; `expo-maps` adoption on iOS |
| **Response** | Blocked at review. Changing the map engine requires an ADR. |
| **Owner** | Architecture |

#### C4 — Coordinates cached beyond 30 days

| | |
|---|---|
| **Description** | Platform terms permit caching latitude and longitude for at most 30 consecutive days. Saved routes and history make indefinite storage the natural implementation. |
| **Likelihood / Impact** | Low / High |
| **Status** | Mitigated structurally — `place_id` durable, coordinates nullable with `coords_refreshed_at` and a daily purge ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)) |
| **Trigger** | **Purge job failure — alerted, not logged.** Also: any coordinate appearing in analytics, crash breadcrumbs or logs |
| **Response** | The purge job is monitored; a failed run is an incident. Analytics payloads are reviewed for coordinate leakage before each release. |
| **Owner** | Architecture |

#### C5 — Service-account credential exposed

| | |
|---|---|
| **Description** | The Route Optimization API requires OAuth2 service-account credentials. Exposure would allow unlimited billing against our account. |
| **Likelihood / Impact** | Low / High |
| **Status** | Mitigated — credentials live only in Supabase secrets; never in the repository, `app.config`, or a runtime-read build secret ([ADR-0006](adr/0006-mandatory-backend-proxy.md)) |
| **Trigger** | Secret scanning alert; anomalous Route Optimization usage |
| **Response** | Rotate immediately per [`19_SECURITY.md`](19_SECURITY.md); audit usage; assess billing impact. |
| **Owner** | Architecture |

#### C8 — GDPR exposure from location data

| | |
|---|---|
| **Description** | Stop addresses are customer addresses: personal data about third parties who never consented, held by our user. Location data is personal data under GDPR. |
| **Likelihood / Impact** | Medium / High |
| **Status** | Mitigated — EU data residency, retention limits, export and deletion, no personal data in analytics ([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)) |
| **Trigger** | A data-subject request; a breach; a supervisory authority enquiry |
| **Response** | Export and deletion are implemented product features, not manual processes. Breach procedure in [`19_SECURITY.md`](19_SECURITY.md). |
| **Owner** | Product owner |

#### C16 — EU auto-renewal disclosure obligations

| | |
|---|---|
| **Description** | Beyond Apple's rules, the Codice del Consumo and Directive 2011/83/EU require clear pre-contractual information and a right of withdrawal for auto-renewing subscriptions. |
| **Likelihood / Impact** | Low / High |
| **Status** | Mitigated — [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) |
| **Trigger** | Consumer complaint; regulatory contact |
| **Response** | Paywall copy, terms and confirmation text are aligned and reviewed together; any change to one requires reviewing all three. |
| **Owner** | Product owner |

---

### Technical risks

#### C6 — `react-native-maps` breaks against a new Expo SDK

| | |
|---|---|
| **Description** | Active, current breakage: the config plugin fails `expo prebuild` on SDK 56 by importing internal `@expo/config-plugins` paths, and Google Maps on iOS fails under SDK 55 with both the recommended and latest versions. `expo-maps` is not an escape — it is alpha and renders Apple Maps on iOS, which C3 forbids. |
| **Likelihood / Impact** | **Medium / Medium, but with no clean fallback** |
| **Status** | Mitigated — version pinning as a pair, plus the `<AppMap>` facade ([ADR-0005](adr/0005-map-engine-and-route-preview.md)) |
| **Trigger** | Any Expo SDK upgrade; any `react-native-maps` release |
| **Response** | Expo SDK upgrades are never routine. Each requires a verified build on Android before merge; the iOS half cannot run (ADR-0014), so an upgrade that breaks iOS would not be caught here. Remaining pinned on a working pair is always an acceptable outcome, and now more attractive than before. |
| **Owner** | Architecture |

#### C13 — Route Optimization latency differs between sync and batch modes

| | |
|---|---|
| **Description** | Tier T2 has a synchronous and an asynchronous batch mode with materially different latency. A user waiting on a synchronous call for a large problem experiences an apparent hang. |
| **Likelihood / Impact** | Medium / Medium |
| **Status** | Mitigated — a switch threshold plus an asynchronous job with Realtime status ([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)) |
| **Trigger** | p95 optimization latency above 8 s; user-reported hangs |
| **Response** | Lower the synchronous threshold; strengthen the waiting UX. |
| **Owner** | Architecture |

#### C14 — Shared route snapshots carry Google imagery

| | |
|---|---|
| **Description** | An exported snapshot contains Google map imagery, which carries attribution obligations wherever it is shared. |
| **Likelihood / Impact** | Low / Low |
| **Status** | Mitigated — attribution rules in [`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md); the feature is COULD priority |
| **Trigger** | Feature implementation |
| **Response** | Attribution burned into the exported image. |
| **Owner** | Architecture |

#### C15 — Map styling lives outside version control

| | |
|---|---|
| **Description** | The paper map style requires Cloud-based Map Styling with a Map ID configured in the Google Cloud console. A console change alters the shipped app with no code review, and an unresolvable Map ID changes the app's appearance silently. |
| **Likelihood / Impact** | Low / Low |
| **Status** | **Closed.** There is no console style left to drift: the preview is drawn from the design tokens in this repository and its appearance is under test ([ADR-0021](adr/0021-drawn-route-preview.md)). |
| **Trigger** | Unexpected map appearance; a style change nobody recorded |
| **Response** | None needed. A style change is now a code change and is reviewed like any other. |
| **Owner** | Architecture |

---

### Strategic and operational risks

#### S1 — Google changes pricing or terms

| | |
|---|---|
| **Description** | Google alters Maps Platform pricing and terms unilaterally, and has done so materially — in March 2025 the flat $200 credit was replaced with per-SKU caps and three APIs were designated Legacy. Any assumption in [`31_COST_MODEL.md`](31_COST_MODEL.md) can be invalidated by an announcement. |
| **Likelihood / Impact** | Medium / High |
| **Status** | Mitigated at the analysis level — provider facades plus a documented exit path ([ADR-0012](adr/0012-long-term-osm-exit-path.md)) |
| **Trigger** | Any Maps Platform pricing or terms announcement; COGS exceeding 25% of net revenue |
| **Response** | Reassess against the migration triggers. The facades mean migration is an adapter swap, not a rewrite. |
| **Owner** | Product owner |

#### S2 — Nobody pays

| | |
|---|---|
| **Description** | The central hypothesis — that a single professional will pay ~€10/month to have their stops reordered — may be false. |
| **Likelihood / Impact** | Medium / **Terminal** |
| **Status** | Accepted. This is the risk the MVP exists to test. |
| **Trigger** | Gate D1: trial-to-paid conversion below 15% over 60 days |
| **Response** | Run the paywall-placement experiment before concluding the product is wrong. If conversion stays low after the funnel is fixed, the hypothesis is false and no amount of features will change it. |
| **Owner** | Product owner |

#### S3 — Google adds stop optimization to Google Maps

| | |
|---|---|
| **Description** | Google Maps already supports up to 10 stops without reordering. Adding optimization would remove the product's reason to exist for most users. |
| **Likelihood / Impact** | Low / **Terminal** |
| **Status** | Accepted — no mitigation is available |
| **Trigger** | A Google Maps release note |
| **Response** | The defensible remainder is what Google would not build: import, saved recurring routes, the professional address book, and provider-agnostic handoff. That is a smaller product, and it would need to be repositioned honestly rather than defended. |
| **Owner** | Product owner |

#### S4 — Work lost to an ephemeral development environment

| | |
|---|---|
| **Description** | Development happens in containers that are reclaimed without warning on inactivity or session end. A commit that exists only locally is not saved work. **This risk has already fired once**, destroying a complete set of committed-but-unpushed documentation. |
| **Likelihood / Impact** | **High / Medium** — it has occurred |
| **Status** | Mitigated — push after every wave or meaningful unit of work; verified with `git ls-remote` ([`30_CLAUDE_RULES.md`](30_CLAUDE_RULES.md) §9) |
| **Trigger** | Any work session ending with unpushed commits |
| **Response** | Push immediately. Treat an unpushed commit as unfinished work, not as saved work. |
| **Owner** | Whoever is working |

---


### HERE Explore and guidance risks — revised 2026-08-18

These risks are additive until Google location services are removed. Ratings are reviewed at every
program gate in [`41_HERE_MIGRATION_PROGRAM.md`](41_HERE_MIGRATION_PROGRAM.md).

| ID | Risk | Likelihood / impact | Trigger | Mitigation and prepared response | Owner |
|---|---|---|---|---|---|
| H1 | HERE Base Plan does not permit HERE-powered stop ordering | **Mitigated / terminal** | Any HERE Matrix, WPS, Tour Planning, or other stop-order calculation enters the design | Keep ordering exclusively in ORS/VROOM; HERE receives a fixed order only; re-open if HERE terms classify ordered-via routing as Optimization | Product owner |
| H2 | Proprietary Explore package cannot reach public-repo CI legally and reproducibly | High / high | License forbids artifact path or CI cannot authenticate privately | Never commit archive; approve private artifact channel, checksum, notice, and pin before spike | Engineering |
| H3 | Owned guidance advances the wrong maneuver under ambiguous GPS | Medium / terminal | Parallel-road, ramp, tunnel, roundabout, or urban-canyon trace produces confident wrong progress | Confidence state, spatial/temporal/heading hysteresis, adversarial replay corpus, safe fallback | Engineering |
| H4 | Rerouting loops or scales cost with GPS cadence | Medium / high | Repeated deviations produce repeated API calls or calls occur per location update | Local projection; sustained deviation gate; one request + cooldown; server quota and kill switch | Engineering |
| H5 | Explore style matches the mock but loses navigation legibility | Medium / high | Maneuvers, road hierarchy, labels, route, traffic, or dark mode fail device review | Guidance-first style acceptance and restrained fallback scheme | Design + engineering |
| H6 | Background location, TTS, map, or GPS cadence causes unacceptable battery/thermal behaviour | Medium / high | Spike/device budget exceeded or OS kills guidance | Measured cadence, foreground-service/background-mode design, performance budget, scope reduction | Engineering |
| H7 | Provider cutover corrupts History or couples product rows to HERE identifiers | Medium / high | Saved route requires provider call, ID churn breaks stop, or wrong route version resumes | Internal UUIDs, immutable snapshots, test DB reset, version checks, rollback window | Engineering |
| H8 | “Essential guidance” is marketed or relied on as Navigate parity | Medium / terminal | Offline, lane/speed/tunnel/map-matching capability is implied or degraded state stays silent | Explicit exclusions, safety copy, current-leg fallback, controlled road tests, release kill switch | Product owner + engineering |
| H9 | HERE-derived geocoding data is retained beyond licensed duration | High / high | Coordinate/search fields lack expiry or are restored from History after 30 days without re-hydration | Persist user-owned data separately; expire HERE-derived fields; purge and re-geocode under server quota | Engineering + legal |
| H10 | Free allowance is mistaken for a provider spend cap | Medium / terminal | Account bills overage or retries continue after application budget | Pre-call server quota, monthly application budget, emergency kill switch; never rely on alerts alone | Product owner + engineering |
| H11 | Public ORS quota, terms, or availability cannot support the product | Medium / terminal | Account denies commercial use, 25-stop request, required daily volume, or service availability | Account gate; independent breaker; visible manual-order fallback; evaluate self-hosted VROOM/ORS under a separate decision | Product owner + engineering |
| H12 | Heuristic ORS order is marketed as exact or HERE-live-traffic-optimal | Medium / high | Exact-fixture gap exceeds threshold or product copy claims exact/live-HERE optimization | Benchmark small exact fixtures; record quality gap; use “best order found”; disclose cross-provider traffic limitation | Product + engineering |
| H13 | Provider credentials or proprietary SDK are exposed through chat, Git, artifacts, logs, or mobile configuration | **Accepted for spike / terminal for production** | A real key crosses project chat or a populated `.env`/SDK archive enters the public repository | For the spike, store existing keys only in protected secrets and mask logs; rotate before production; private checksum-pinned SDK delivery; secret scanning and artifact inspection | Product owner + engineering |

## 7. Architectural decisions

Every mitigated risk traces to an ADR. A risk mitigated by intention rather than by structure
is not mitigated.

| Risk | Mitigating decision |
|---|---|
| C1, C13 | [ADR-0003](adr/0003-tiered-optimization-cascade.md) |
| C2, C5, C11 | [ADR-0006](adr/0006-mandatory-backend-proxy.md), [ADR-0011](adr/0011-server-side-quota-enforcement.md) |
| C3, C6, C15 | [ADR-0005](adr/0005-map-engine-and-route-preview.md) |
| C4 | [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md) |
| C7 | [ADR-0004](adr/0004-external-navigation-handoff.md) |
| C12, C16, S2 | [ADR-0002](adr/0002-target-segment-and-monetization.md) |
| S1 | [ADR-0012](adr/0012-long-term-osm-exit-path.md) |

## 8. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Two risks fire together (e.g. C2 cost and S1 pricing change) | Cost work takes precedence; both are addressed before any roadmap phase begins |
| 2 | A risk fires with no owner available | The product owner absorbs it; unowned risks are not permitted to persist |
| 3 | A mitigation is removed by a refactor | Detected at review; mitigations are traced to ADRs precisely so their removal is visible |
| 4 | A new risk emerges | Added here with an identifier, an owner and a trigger before the pull request that introduced it merges |
| 5 | A trigger has no metric behind it | The trigger is unusable; instrument it or remove the pretence |

## 9. Error handling

| Failure of the register itself | Detection | Response |
|---|---|---|
| A risk fires undetected | Post-incident review | The trigger was wrong; fix the trigger, not only the incident |
| A mitigation exists only in prose | Gate review | Trace it to an ADR or to code, or reclassify the risk as accepted |
| The register goes stale | Phase gate review | Review is a gate requirement; a stale register fails the gate |

## 10. Best practices

1. **Every risk has a trigger with a metric behind it.** Without one, the risk is being hoped
   away.
2. **Distinguish mitigated from accepted.** S2 and S3 are accepted — pretending otherwise
   would be theatre.
3. **Mitigate structurally, not procedurally.** C4 is mitigated by a nullable column and a
   purge job, not by remembering a rule.
4. **Compliance risks are low-likelihood only while the design holds.** Any change touching
   C3, C4 or C5 reopens them.
5. **Review at every gate.** A register reviewed once at inception is a document, not a
   control.
6. **A risk that has already fired is not theoretical.** S4 is rated High because it happened.

## 11. Checklist

- [ ] Every risk has an owner, a trigger and a prepared response.
- [ ] Every trigger has an instrumented metric or a concrete detection event.
- [ ] Every mitigation traces to an ADR or to identifiable code.
- [ ] Compliance risks C3, C4, C5 re-verified before each submission.
- [ ] C2 cost metrics reviewed monthly against actuals.
- [ ] C9 naming decision resolved before first store submission.
- [ ] S4: no unpushed commits at the end of any working session.
- [ ] No risk has been silently closed without evidence.
- [ ] H1–H13 reviewed at each HERE program gate.
- [ ] H1–H4 remain green before any production Flutter rewrite.
- [ ] H4 physical-road evidence exists before navigation release.

## 12. Roadmap

| Phase | Register activity | Trigger |
|---|---|---|
| MVP | C9 resolved; C4 purge monitoring live; C12 paywall verified | Before first submission |
| 1.x | C2 monitored monthly; C7 reassessed before 1.3 | Gate D1 passed |
| 2.0 | C1 reassessed — time windows move every optimization to T2 | Gate D3 |
| HERE H0–H2 | H1–H4 permitted-use/package/guidance evidence | Program Gates A and B |
| HERE H3–H9 | H4–H10 reviewed at every cutover gate | Program Gates C and D |
| Continuous | S1 reassessed on every Google announcement until location cutover | Event-driven |

## 13. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Register created with C1–C16, S1–S3 | Project inception | Product owner |
| 2026-08-07 | C17 added: iOS unverified on hardware | Verification is Android-first; no Apple hardware or programme (ADR-0014) | Product owner |
| 2026-08-08 | C18 added: advertising SDK as a data collector | The free tier is ad-supported (ADR-0015), which brings a CMP, ATT and a privacy declaration | Product owner |
| 2026-08-13 | C18 eliminated for the current product | ADR-0029 removed advertising and its client facade rather than mitigating the SDK | Product owner |
| 2026-08-08 | C19 added: third-party personal data in photographed lists | AI-assisted entry accepts photographs of manifests (ADR-0016); paste and dictation ship first | Product owner |
| 2026-08-08 | C12 lowered from high to **medium** likelihood | The hard paywall is gone: a genuine free tier means the auto-renewing trial is no longer the only door in, which removes the most common cause of Guideline 3.1.2 rejection (ADR-0015) | Product owner |
| 2026-08-06 | C12 raised to high impact | Trial auto-renewal is the leading cause of App Store rejection | Product owner |
| 2026-08-06 | S2 and S3 recorded as accepted, not mitigated | No mitigation exists; recording them as managed would be false | Product owner |
| 2026-08-06 | S4 added after the risk fired | A container reclaim destroyed a full set of committed-but-unpushed documentation | Product owner |
| 2026-08-18 | H1–H8 revised for Explore + owned guidance | Base Plan eligibility, package delivery, GPS ambiguity, reroute cost, style, battery, data, and scope-honesty replace Navigate quote risks | Product owner |
| 2026-08-18 | H1 fired; H9–H10 added | WPS is separate/excluded, geocoding retention is limited, and no provider hard cap is established | Product owner |
| 2026-08-20 | H1 structurally mitigated; H11–H12 added | ORS/VROOM separates Optimization from HERE, while public-service quota/SLA and heuristic/cross-provider quality remain gated | Product owner |
| 2026-08-20 | H13 added; residual risk accepted for disposable spike | HERE and ORS credentials crossed project chat; owner declined immediate rotation. Protected injection is mandatory and rotation remains a production gate | Product owner |

## 14. Rationale

The register is organised by category rather than by score because the categories behave
differently. Economic risks degrade slowly and silently, and are caught by monitoring. Terms
risks are binary — compliant or not — and are caught by design. Review risks fire at a single
known moment. Strategic risks cannot be mitigated at all, only watched.

The compliance risks cluster at low likelihood and high impact, which is exactly where a
register earns its cost: each is unlikely *because* the architecture was shaped to prevent it,
and each would be catastrophic if it fired. Recording why they are unlikely is what stops a
future change from quietly removing the reason.

S2 and S3 are recorded as accepted rather than mitigated deliberately. A register that claims
to have mitigated "nobody pays" is not being honest, and honesty is the only property that
makes a risk register worth reading.

S4 is the one entry written from experience rather than analysis. It fired during the
production of this very documentation set: a full day of committed work was lost because the
push had been deferred to the end. It is recorded at High likelihood rather than Medium
precisely because it is not a hypothesis.

## 15. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Risks distributed across each area document | Locality; read in context | Fifteen partial registers with no shared view, and the same risk described three ways in three files. |
| Numeric risk scoring (probability × impact) | Objective-looking; sortable | False precision on invented numbers. The categorisation in §4 drives the same decisions without pretending to measure. |
| Only technical risks | Engineering-focused; actionable | Omits the two terminal risks, both of which are commercial. A register without S2 describes the wrong project. |
| Omit accepted risks | Shorter; only shows what is being managed | The accepted risks are the ones most worth knowing about, precisely because nothing is being done about them. |
