# 27 — Play Store

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`26_APP_STORE.md`](26_APP_STORE.md) · [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) · [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md)

---

## 1. Purpose

This document specifies Google Play submission: policies, the Data Safety declaration, testing
tracks, staged rollout and the differences from Apple that are easy to overlook.

Play's review is generally less strict on subscription presentation than Apple's, but **stricter
and more automated on data declarations** — and a Data Safety form that disagrees with actual
behaviour produces enforcement without a conversation.

## 2. Goals

1. Pass review on the first submission.
2. Ensure the Data Safety declaration matches actual behaviour exactly.
3. Use staged rollout to limit the blast radius of any defect.
4. Handle the differences from Apple deliberately rather than by assumption.

**Non-goals.** No ASO strategy. No paid acquisition.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Submission and policy | Product owner | — |
| Data Safety declaration | Product owner + Architecture | Must match behaviour |
| Track configuration | Architecture | Via Fastlane |
| Staged rollout decisions | Product owner | Manual at each step |

---

## 4. Text diagrams

### Track progression

```
  Internal Testing        up to 100 testers, no review
        │                 available in minutes
        │                 ── every merge to main
        ▼
  Closed Testing          invited testers, review required
        │                 ── release candidates
        ▼
  Open Testing            public beta (optional)
        │
        ▼
  Production              STAGED ROLLOUT, always
        5% ──▶ 20% ──▶ 50% ──▶ 100%
        │
        └─ halt at any percentage if crash-free rate drops

  Android's staged rollout is finer-grained than iOS phased
  release and can be halted at any point — a real advantage
  worth using deliberately.
```

---

## 5. Policies

| Policy | Relevance | Compliance |
|---|---|---|
| **Data Safety** | **Highest risk here** | Declaration matches [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) exactly |
| Subscriptions and billing | Trial disclosure | Same compliant paywall as iOS ([`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md)) |
| Permissions and APIs | Location, background location | Requested in context; background deferred to 1.3 |
| Background location | Requires a separate declaration and often a video | **Release 1.3 only** — risk C7 |
| User data deletion | In-app **and** a web-accessible request path | Both required by Play |
| Target API level | Current requirement | Per Play's minimum |
| Families policy | Not applicable | Not targeted at children |

**Play requires a deletion path reachable from the web**, not only in-app — a difference from
Apple that is easy to miss. A URL where a user can request account deletion without installing
the app must exist and be declared.

---

## 6. Data Safety

The declaration is verified against actual behaviour, not against intent. Play cross-checks it,
and a mismatch is an enforcement matter rather than a review conversation.

| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Email address | Yes | No | Account management | No |
| **Approximate location** | Yes | No | App functionality | Yes — the app works without it |
| **Precise location** | Yes | No | App functionality | Yes |
| Addresses (stops) | Yes | No | App functionality | No — it is the product |
| User content (labels, notes) | Yes | No | App functionality | Yes |
| App interactions | Yes | No | Analytics | Yes — opt-out available |
| Crash logs | Yes | No | Diagnostics | No |
| Purchase history | Yes | No | App functionality | No |

**Nothing is shared with third parties, and nothing is used for advertising or tracking.** Data
processed by Supabase, Google Maps Platform, RevenueCat, Firebase and Sentry is processing by
sub-processors under contract, which is not "sharing" in Play's sense — but the sub-processor list
must appear in the privacy policy.

Encryption in transit is declared. The deletion mechanism is declared and functional.

**Location is declared optional** because it genuinely is: a user who declines it sets the origin
by searching for an address, and every journey still works ([`18_PERMISSIONS.md`](18_PERMISSIONS.md)).
That claim is verified in the pre-submission checklist rather than assumed.

---

## 7. Billing

Google Play Billing via RevenueCat, with the same products and the same 7-day trial as iOS
([`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md)).

Differences from Apple worth handling deliberately:

| Aspect | Play | Note |
|---|---|---|
| Trial configuration | Base plan **offers** | A different model from StoreKit introductory offers |
| Trial eligibility | Once per user per subscription | Similar to Apple's, but scoped differently |
| Grace period | Configurable in the Play Console | Set to match the entitlement model |
| Account hold | Play-specific state after grace | Must map to an entitlement status |
| Refunds | User-initiated within a window | Webhook drives entitlement to `expired` |

**Account hold has no Apple equivalent** and is easy to omit. It occurs after grace expires
without payment, and the webhook must map it — leaving it unmapped means a user in account hold
retains entitlement indefinitely.

---

## 8. Release management

**Staged rollout is mandatory**, never a full release. Progression is manual at each step, gated
on the crash-free rate holding above the threshold in
[`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md).

| Step | Users | Watch for |
|---|---|---|
| 5% | Early signal | Crashes, ANRs, one-star reviews |
| 20% | Broader devices | Device-specific issues |
| 50% | Scale | Backend load, cost anomalies |
| 100% | Full | — |

**A rollout can be halted at any percentage**, which is finer-grained control than iOS phased
release offers. Halting stops new users receiving the build; those who already have it keep it, so
a fix must still ship forward.

**Android device fragmentation** is the reason for the 20% step: the low-tier reference device in
[`24_PERFORMANCE.md`](24_PERFORMANCE.md) cannot represent the full range of Android hardware, and
20% is where device-specific problems surface.

---

## 9. Edge cases

| # | Condition | Response |
|---|---|---|
| 1 | Data Safety flagged as inconsistent | Correct the declaration to match behaviour — never the reverse |
| 2 | Background location rejected (1.3) | Ship without it; nothing depends on it |
| 3 | Crash spike at 5% | Halt immediately; fix forward |
| 4 | Device-specific crash at 20% | Halt; reproduce on that device class |
| 5 | Target API level deadline | Tracked; a missed deadline blocks updates |
| 6 | Web deletion path missing | **Blocks submission** — required by Play |
| 7 | Account hold state unmapped | Entitlement retained wrongly; the webhook must handle it |
| 8 | Play rejects the listing | Correct; a metadata change does not need a new build |
| 9 | Testers cannot install from Internal Testing | Verify the tester list and licence testing configuration |

## 10. Error handling

| Failure | Response |
|---|---|
| Policy rejection | Address the specific policy cited; resubmit |
| Data Safety mismatch | Correct the declaration; if behaviour is wrong, fix the behaviour |
| Rollout halted | Fix forward; a new version resumes at 5% |
| Billing misconfiguration | Verify products in the Console against RevenueCat |
| ANR rate elevated | Investigate main-thread blocking — usually gesture or map work |

## 11. Best practices

1. **Declare Data Safety from actual behaviour**, verified against code, never from intent.
2. **Always stage the rollout**; never release to 100% directly.
3. **Halt early.** A halt at 5% is cheap; discovering the problem at 100% is not.
4. **Map every Play billing state**, including account hold, which has no Apple equivalent.
5. **Keep the web deletion path live** — it is a submission requirement.
6. **Test on real low-end Android hardware**, not only on emulators.
7. **Keep the Play and App Store paywalls identical in substance**, so compliance is verified once.

## 12. Checklist

Before every submission:

- [ ] Data Safety declaration matches actual collection, verified against code.
- [ ] Web-accessible deletion path live and declared.
- [ ] In-app deletion functional.
- [ ] Paywall matches the iOS compliant version, both languages.
- [ ] Billing products match RevenueCat configuration.
- [ ] Account hold and grace mapped in the webhook handler.
- [ ] Location declared optional, and verified optional by testing a denial.
- [ ] `<queries>` declarations verified on a device with Google Maps and Waze installed.
- [ ] Target API level meets the current requirement.
- [ ] Staged rollout configured at 5%.
- [ ] Listing free of offline-map and turn-by-turn claims.
- [ ] Screenshots current, both languages.
- [ ] Tested on a physical low-tier Android device.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| Pre-launch | Data Safety, web deletion path, billing configuration | Before first submission |
| MVP | First submission; staged rollout | — |
| 1.3 | Background location declaration and demonstration video | Release 1.3 |
| 1.x | Open Testing track for a wider beta | User base growth |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Staged rollout mandatory, halting at 5% on any signal | Android fragmentation surfaces device-specific defects | Architecture |
| 2026-08-06 | Location declared optional | It genuinely is; every journey works without it | Product owner |
| 2026-08-06 | Account hold mapped explicitly | No Apple equivalent; unmapped means entitlement retained wrongly | Architecture |
| 2026-08-06 | Web deletion path treated as a submission blocker | Play requires it; Apple does not | Product owner |

## 15. Rationale

Play's risk profile is the inverse of Apple's. Apple scrutinises subscription presentation and
reviews with human judgement; Play is more permissive there but cross-checks data declarations
automatically and enforces mismatches without discussion. So this document spends its attention on
Data Safety, where the risk is, rather than repeating the paywall analysis from
[`26_APP_STORE.md`](26_APP_STORE.md).

Staged rollout matters more on Android than on iOS because of hardware fragmentation. The
reference device in [`24_PERFORMANCE.md`](24_PERFORMANCE.md) represents a device class, not the
whole population, and a map-heavy app can behave very differently across GPU and driver
combinations. Twenty percent is where those problems appear, which is why the step exists rather
than going straight from 5% to 50%.

The Play-specific billing states — particularly account hold — are called out because they are the
most likely omission when porting an iOS-first subscription implementation. A user in account hold
whose state is unmapped keeps full entitlement without paying, and nothing surfaces the error
because the app behaves correctly from the user's perspective.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Full release without staging | Faster to all users | Forfeits the only control over a defect in a released binary, and Android fragmentation makes defects likelier |
| Conservative Data Safety over-declaration | Safer-seeming; less chance of understating | Over-declaring is also a false statement, and deters installs by implying collection that does not happen |
| Android-first launch | $25 versus $99; no device provisioning friction | Splits the launch and doubles the support surface. Both platforms ship together ([`25`](25_DEPLOYMENT.md)) |
| Skipping Closed Testing | Faster to production | Closed Testing is the only stage with review feedback before production exposure |
| Different paywall on Android | Play's rules are more permissive | Two paywalls means verifying compliance twice and drifting apart over time |
