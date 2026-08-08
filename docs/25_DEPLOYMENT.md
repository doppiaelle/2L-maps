# 25 — Deployment

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`26_APP_STORE.md`](26_APP_STORE.md) · [`27_PLAY_STORE.md`](27_PLAY_STORE.md) · [`22_TESTING.md`](22_TESTING.md)

---

## 1. Purpose

This document specifies how code becomes a released app: environments, EAS builds, Fastlane,
GitHub Actions, versioning, release channels and rollback.

Two constraints shape everything: **Expo Go cannot run this app** because of native modules, and
**`react-native-maps` must be version-pinned with the Expo SDK** because of the compatibility
fragility recorded as risk C6.

## 2. Goals

1. Reproducible builds from a clean checkout.
2. A safe path from commit to production with a real rollback at each stage.
3. Contain the Expo SDK / `react-native-maps` upgrade risk.
4. Keep every secret out of the repository and out of the client bundle.

**Non-goals.** No custom CI infrastructure. No self-hosted runners at MVP scale.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Build configuration | `eas.json`, config plugins | Versioned |
| Secrets | EAS secrets + Supabase secrets | Never in the repository |
| Release decision | Product owner | Manual gate on production |
| Version pinning | Architecture | Expo SDK and maps as a pair |

---

## 4. Text diagrams

### Pipeline

```
  commit ──▶ CI: lint · typecheck · unit · component · integration · contract
                │
                ├─ fail ──▶ blocked
                │
                ▼
  merge to main ──▶ EAS build (internal profile)
                │
                ▼
         E2E on the built artifact (Maestro, both platforms)
                │
                ▼
  ┌─────────────────────────────────────────────────────────┐
  │  TestFlight (iOS)          Play Internal Testing        │
  │  internal testers          internal track               │
  └───────────────────────┬─────────────────────────────────┘
                          │ manual gate: product owner
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │  TestFlight external       Play Closed Testing          │
  └───────────────────────┬─────────────────────────────────┘
                          │ manual gate + store review
                          ▼
              Production, PHASED ROLLOUT
                  iOS 7-day phased release
                  Android staged: 5% → 20% → 50% → 100%
```

### Environments

```
  development    local Supabase · dev Google keys · sandbox billing
       │         development build on a physical device
       │
  staging        staging Supabase project · dev Google keys · sandbox billing
       │         TestFlight / Internal Testing
       │
  production     production Supabase · production Google keys · live billing
                 App Store / Play Store

  Google keys are shared between development and staging because
  Maps Platform has no sandbox. Quotas and alerting are therefore
  active in every environment.
```

That last point is worth stating plainly: **there is no free Google environment.** Development
consumes the same free tier and the same billing account as production, which is why quotas and
cost alerting are configured from day one rather than at launch.

---

## 5. Flows

**Commit to store.**

```
  commit ──▶ CI: typecheck · lint · test ──── red ──▶ stops here, always
                        │ green
                        ▼
              EAS build (dev · preview · production)
                        │
                        ▼
              internal testing ──▶ TestFlight / Play internal track
                        │
                        ▼
              store review ──── rejected ──▶ 26 / 27 hold the prepared justifications
                        │ approved
                        ▼
              staged rollout ──▶ monitored against 21 and 24 ──▶ full release
```

**Rollback.** A JS-only defect is rolled back with EAS Update within minutes; a native defect
requires halting the staged rollout and submitting a build. The distinction is decided before
release, not during an incident, because the two have very different clocks.

**Version increment.** `MAJOR` on a breaking change to a stored data shape or an Edge Function
contract, `MINOR` on a feature, `PATCH` on a fix. Build numbers increase monotonically and never
reset — a reused build number is rejected by both stores and costs a submission cycle.

**Work is pushed, not merely committed.** Development happens in ephemeral containers, so a
commit that exists only locally is not saved work. This is risk S4 in
[`35_RISK_REGISTER.md`](35_RISK_REGISTER.md), and it is rated High because it has already
fired.

## 6. Builds

### Expo Go is not usable

`react-native-maps` is a native module. **A development build is required from the first day**,
and every contributor needs one before writing a line of code. This is the first step of the
contributor guide, not a footnote — and it is risk C10 in
[`35_RISK_REGISTER.md`](35_RISK_REGISTER.md), which costs onboarding time rather than money.

### EAS profiles

| Profile | Purpose | Distribution |
|---|---|---|
| `development` | Dev client with debugging | Internal, ad hoc |
| `preview` | Production-like, internal testing | Internal |
| `production` | Store submission | App Store / Play Store |

**EAS is not used** ([ADR-0014](adr/0014-android-first-verification.md)). Gradle on a Linux
GitHub Actions runner produces the same Android artifact with no monthly ceiling and no
subscription; the profiles below describe the build shapes, not the service. Its free tier was
**15 iOS + 15 Android builds per month** ([`31_COST_MODEL.md`](31_COST_MODEL.md)),
which is sufficient for MVP cadence. Builds are not triggered on every commit — only on merge to
`main` and on release tags.

### Version pinning — risk C6

**Expo SDK and `react-native-maps` are upgraded as a pair, never independently.**

| Rule | Reason |
|---|---|
| Both versions pinned exactly, no ranges | A patch release has broken this pairing before |
| An upgrade is its own pull request, touching nothing else | Isolates the failure |
| Requires a successful build **and** a map render test on both platforms before merge | Config-plugin failures appear at prebuild, not at typecheck |
| Staying on a working pair is always an acceptable outcome | There is no substitute engine ([ADR-0005](adr/0005-map-engine-and-route-preview.md)) |

Known failure modes to check on every upgrade: the config plugin importing internal
`@expo/config-plugins` paths and failing `expo prebuild`; Google Maps failing to render on iOS.

### Native configuration

Config plugins own everything that must be correct at build time:

- `LSApplicationQueriesSchemes` and Android `<queries>`
  ([`18_PERMISSIONS.md`](18_PERMISSIONS.md)) — **the silent failure**;
- location and notification usage descriptions;
- Google Maps API keys, per environment;
- associated domains and URL schemes;
- `PrivacyInfo.xcprivacy`.

---

## 7. CI — GitHub Actions

| Workflow | Trigger | Runs |
|---|---|---|
| `verify` | Every push and pull request | Lint, typecheck, unit, component, integration, contract |
| `build-preview` | Merge to `main` | EAS preview build, both platforms |
| `e2e` | After `build-preview` | Maestro against the artifact |
| `release` | Release tag | EAS production build, Fastlane submission |
| `migrate` | Merge touching `supabase/migrations` | Applies migrations, regenerates types |

**macOS runners consume minutes at 10×**, so 2,000 free private-repo minutes is roughly 200
effective macOS minutes ([`31_COST_MODEL.md`](31_COST_MODEL.md)). E2E therefore runs on merge,
not on every pull request.

### Fastlane

Handles the store-facing work: metadata and screenshot upload, TestFlight and Play track
promotion, code signing via `match`, and release notes from the changelog.

---

## 8. Versioning

**Semantic versioning**, with a mobile-specific interpretation:

| Change | Bump |
|---|---|
| Breaking change to a stored data shape or an Edge Function contract | **MAJOR** |
| New feature | MINOR |
| Fix | PATCH |

**Build numbers increment monotonically and never reset**, including across MAJOR bumps — both
stores reject a build number lower than one already uploaded.

**The mobile constraint that shapes releases:** users run old versions for weeks. An Edge Function
change must remain compatible with the previous released app version, which makes contract
changes additive by default ([`12_DATABASE.md`](12_DATABASE.md)).

---

## 9. Release and rollback

### Channels

| Stage | iOS | Android | Gate |
|---|---|---|---|
| Internal | TestFlight internal | Internal Testing | Automatic on merge |
| External beta | TestFlight external | Closed Testing | Manual |
| Production | Phased release, 7 days | Staged 5→20→50→100% | Manual + review |

**Phased and staged rollout is mandatory**, never a full release. It is the only mechanism that
limits the blast radius of a defect that testing missed.

### Rollback

Rollback options differ sharply by layer, and knowing which applies is what makes an incident
survivable:

| Layer | Mechanism | Speed |
|---|---|---|
| **Edge Function** | Redeploy the previous version | **Minutes** |
| **EAS Update** (JS only) | Republish the previous bundle | **Minutes** |
| **Native binary** | Halt the rollout, submit a fix | **Hours to days** — store review |
| **Database migration** | Forward fix only | Varies |

**A native rollback is not a rollback.** Once a binary is released it cannot be withdrawn from
users who have it; the only remedies are halting the rollout and shipping a fix. This asymmetry is
why phased release is mandatory and why as much logic as possible lives server-side where it can
be corrected in minutes.

**Database migrations are never rolled back.** They are fixed forward, because a released app
version may already depend on the new schema.

### EAS Update

Used for JS-only fixes between store releases. **Never for native changes**, and never to bypass
review for behaviour that requires it — an update that changes what the app does functionally is
a store-review matter, not a hotfix.

---

## 10. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps`, pinned with the Expo SDK | Why Expo Go is unusable and upgrades are paired |
| [0006](adr/0006-mandatory-backend-proxy.md) | Backend proxy | Edge Function deployment and secret management |
| [0002](adr/0002-target-segment-and-monetization.md) | Trial to paid | Store configuration and release gating on billing |

**Decided here:** the Expo SDK and `react-native-maps` are upgraded together, never separately,
and an upgrade requires a verified build on both platforms before merge. They have broken as a
pair before (risk C6); treating them as one dependency is the only version of this that holds.

## 11. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Expo SDK upgrade breaks the maps plugin | Upgrade PR fails at build; stay on the working pair |
| 2 | EAS build minutes exhausted | Builds queue; release delayed. Cadence is planned within the free tier |
| 3 | Store review rejects during a phased release | Rollout halted; fix submitted |
| 4 | Critical bug found at 5% rollout | Halt immediately; **this is what staged rollout is for** |
| 5 | Migration applied, app release rejected | Migration must be backward compatible — this is why they are additive |
| 6 | Secret rotated mid-release | New build required if it is a client-side key; Edge Function secrets take effect immediately |
| 7 | Scheme declaration omitted | Handoff provider silently invisible; caught by the [`18`](18_PERMISSIONS.md) checklist |
| 8 | E2E fails on one platform only | Release blocked. Both platforms ship together |
| 9 | macOS minutes exhausted | E2E deferred to a nightly run; releases still gated on it |

## 12. Error handling

| Failure | Detection | Response |
|---|---|---|
| CI fails | Pipeline | Merge blocked |
| EAS build fails | Build log | Investigate; commonly a config-plugin issue after an upgrade |
| Submission rejected | Store feedback | Address, resubmit; see [`26`](26_APP_STORE.md) |
| Crash spike after release | Crashlytics | Halt rollout; assess; fix forward |
| Migration fails | Migration workflow | Deployment blocked; fix forward |
| EAS Update breaks the app | Crash spike | Republish the previous bundle — minutes |

## 13. Best practices

1. **Never upgrade Expo SDK and `react-native-maps` separately.**
2. **Never release without phased or staged rollout.**
3. **Keep migrations additive** — old app versions are still running.
4. **Prefer server-side logic** where it can be corrected in minutes rather than days.
5. **Never use EAS Update to bypass review** for functional changes.
6. **Verify scheme declarations on a device with the apps installed** before every release.
7. **Rotate every credential once before launch** to prove the procedure works.
8. **Both platforms ship together.** A platform-specific release doubles the support surface.
9. **Push after every meaningful unit of work.** Development happens in ephemeral containers; a
   commit that exists only locally is not saved work ([`30_CLAUDE_RULES.md`](30_CLAUDE_RULES.md) §9).

## 14. Checklist

Before every production release:

- [ ] All CI checks green.
- [ ] E2E passing on both platforms.
- [ ] Performance budgets measured on physical reference devices.
- [ ] Store validation checklist complete ([`22_TESTING.md`](22_TESTING.md)).
- [ ] Paywall verified against Guideline 3.1.2, both languages.
- [ ] Scheme declarations verified on a device with the navigation apps installed.
- [ ] Migrations verified backward compatible with the previous released version.
- [ ] Version and build number correct; build number monotonic.
- [ ] Release notes written in both languages.
- [ ] Phased or staged rollout configured — never a full release.
- [ ] Rollback path confirmed for each layer touched.
- [ ] No secret in the repository or the client bundle.

## 15. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Full pipeline, phased rollout, rollback | — |
| 1.x | Automated performance regression in CI | Post-launch |
| 1.x | Automated release notes from conventional commits | Post-launch |
| 2.0 | Paid EAS tier if build cadence exceeds the free allowance | Build volume |

## 16. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Expo SDK and maps pinned as a pair | Risk C6; documented current breakage | Architecture |
| 2026-08-06 | Phased and staged rollout mandatory | A native rollback is not a rollback | Architecture |
| 2026-08-06 | Migrations fixed forward, never rolled back | Released app versions may depend on the new schema | Architecture |
| 2026-08-06 | E2E on merge rather than per pull request | macOS runners consume free minutes at 10× | Architecture |
| 2026-08-06 | Both platforms ship together | A platform-specific release doubles the support surface | Product owner |
| 2026-08-06 | Push-after-every-unit added to best practices | An ephemeral container destroyed a full set of committed-but-unpushed work | Architecture |

## 17. Rationale

The pipeline is shaped by an asymmetry that is easy to underestimate: **server-side mistakes are
correctable in minutes, and native mistakes are not.** An Edge Function bug is a redeploy; a
binary bug is a store review, several days, and users stuck on the broken version in the meantime.
This is the strongest practical argument for the backend-heavy architecture in
[ADR-0006](adr/0006-mandatory-backend-proxy.md) — beyond security and cost, it is where mistakes
are cheap.

Phased rollout follows directly. Since a native release cannot be withdrawn, the only available
control is limiting how many users receive it before a problem surfaces. Releasing to 100%
immediately forfeits the one mechanism available.

The version-pinning rule is unusually strict because the dependency is unusually fragile and has
no substitute. `react-native-maps` has documented current breakage against recent Expo SDKs, and
both alternatives are excluded — `expo-maps` renders Apple Maps on iOS, which the terms forbid for
Google content, and the Navigation SDK cannot coexist with the Maps SDK. Remaining on a known-good
pair indefinitely is a legitimate outcome, not a failure to maintain.

## 18. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Full release without phasing | Faster to all users; simpler | Forfeits the only control available over a defect in a native binary |
| Expo Go for development | No build step; instant iteration | Impossible — native modules. Not a choice |
| Automatic version bumping from commits | No manual step; consistent | Version bumps encode intent about data-shape compatibility, which a commit message cannot infer |
| Rolling back migrations | Symmetric with code rollback; feels safer | A released app version may already depend on the new schema; the rollback breaks live users |
| Separate release trains per platform | Ship the ready platform sooner | Doubles the support surface and creates behaviour differences that are hard to reason about |
| E2E on every pull request | Catches regressions earlier | macOS runners consume free minutes at 10×; the allowance would be gone in days |
