# 29 — Definition of Done

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`../CLAUDE.md`](../CLAUDE.md) · [`22_TESTING.md`](22_TESTING.md) · [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md)

---

## 1. Purpose

This document defines "done" at three levels — a change, a feature, a release — so that the word
means the same thing to everyone using it.

The purpose is to make partial completion visible. Work that is 90% finished and reported as done
is the most expensive kind of work, because the remaining 10% is discovered by a user.

## 2. Goals

1. Make "done" verifiable by someone other than the author.
2. Ensure the states that get skipped — error, offline, degraded — are never skipped.
3. Guard the cost and compliance properties that no functional test catches.
4. Keep the criteria short enough to be used every time.

**Non-goals.** Not a process document. Not a substitute for judgement.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Change-level criteria | Author, verified by reviewer | §6 |
| Feature-level criteria | Author + product owner | §7 |
| Release-level criteria | Product owner | §8 |
| Criteria maintenance | Architecture | Changes require a decision-log entry |

---

## 4. Text diagrams

### Three levels

```
  ┌── CHANGE ───────────────────────────────────────────┐
  │  one pull request                                    │
  │  verified by the reviewer, every time                │
  └────────────────────┬─────────────────────────────────┘
                       │ several changes
  ┌── FEATURE ─────────▼─────────────────────────────────┐
  │  a user-visible capability                           │
  │  verified against 01_PRODUCT_REQUIREMENTS            │
  └────────────────────┬─────────────────────────────────┘
                       │ several features
  ┌── RELEASE ─────────▼─────────────────────────────────┐
  │  a store submission                                  │
  │  verified against 26 and 27 before submitting        │
  └──────────────────────────────────────────────────────┘

  Each level assumes the level below is complete. A release
  containing an incomplete feature is not a release.
```

### The four that get skipped

```
  Always built:        success state
                       happy-path test
                       light theme

  Routinely skipped:   ERROR STATE      ← a user will find it
                       OFFLINE STATE    ← Elena finds it daily
                       DEGRADED STATE   ← unlabelled T0 is dishonest
                       DARK THEME       ← half the users

  These four are listed explicitly in §6 because good intentions
  do not survive a deadline.
```

---

## 5. Flows

**The three gates, and what each one stops.**

```
  a change is done   ──▶ typecheck · lint · tests · states · a11y · tokens · docs
        │                 stops: work that compiles but is unfinished
        ▼
  a feature is done  ──▶ every journey path · every error path · analytics · Android
                          (iOS unverified — ADR-0014)
        │                 stops: a feature that works only on the happy path
        ▼
  a release is done  ──▶ E2E · performance measured · store metadata · rollback rehearsed
                          stops: a build that is shippable but not supportable
```

**Why "done" is defined three times.** The word is used at three scales, and a single
definition is either too strict to finish a change or too loose to release. Naming all three
removes the most common disagreement in the project — two people agreeing something is done
while meaning different gates.

**Nothing here is a majority vote.** A checklist with most items ticked is a checklist that has
identified exactly what is missing.

## 6. A change is done when

Verified by the **reviewer**, not asserted by the author.

### Correctness

- [ ] Behaviour matches the specification document. If it does not, the document was updated
      first and an ADR added where a decision changed.
- [ ] No specification was invented. Ambiguities were asked, not assumed
      ([`30_CLAUDE_RULES.md`](30_CLAUDE_RULES.md) Flow B).
- [ ] Domain terms match the glossary in
      [`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) §8.

### Quality gates

- [ ] Typecheck, lint and format pass with **no suppressions**.
- [ ] No `any`, no `!` non-null assertion, no `as` outside a validated boundary.
- [ ] Unit tests for all changed logic in `lib/`, boundaries included.
- [ ] Integration tests for changed hooks, **including failure paths**.
- [ ] Component tests cover every state the component declares.

### The four that get skipped

- [ ] **Error state** implemented and tested.
- [ ] **Offline state** implemented and tested.
- [ ] **Degraded state** implemented and labelled, where applicable.
- [ ] **Dark theme** verified, not assumed.

### Architecture

- [ ] Correct layer; no upward imports.
- [ ] No direct provider SDK import outside a facade.
- [ ] No business logic in a component.
- [ ] No hardcoded colour, spacing, radius, size or duration.
- [ ] No number duplicated from another document.

### Cost and compliance

- [ ] No new upstream call without a quota check and a usage record.
- [ ] Field masks minimal, if Routes API is touched.
- [ ] Session token present, if Places is touched.
- [ ] No coordinate stored without `coords_refreshed_at`.
- [ ] No personal data in logs, analytics or crash breadcrumbs.
- [ ] No new client-side credential.

### Accessibility and performance

- [ ] Accessible labels present, stating outcomes.
- [ ] Contrast verified in both themes.
- [ ] Touch targets ≥ 44 pt.
- [ ] Every gesture has a non-gesture equivalent.
- [ ] Performance budget met and **measured**, if a hot path was touched.

### Documentation and durability

- [ ] Affected document updated, including its decision log.
- [ ] ADR added where a decision changed.
- [ ] **Work committed and pushed to the remote**, not held only in an ephemeral container
      ([`30_CLAUDE_RULES.md`](30_CLAUDE_RULES.md) §9).

---

## 7. A feature is done when

Everything in §6 for every change, plus:

- [ ] Every functional requirement it implements passes, verified against
      [`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md).
- [ ] Every edge case listed in the owning document is tested.
- [ ] The journey it belongs to passes end to end
      ([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md)).
- [ ] **Three-tap count re-measured** if the critical path was touched.
- [ ] Verified on a **physical Android device**, light and dark, through the development
      build ([ADR-0014](adr/0014-android-first-verification.md)).
- [ ] iOS behaviour reviewed in code and covered by tests. **Not verified on hardware** — the
      gate is unmet and stays unmet until a Mac or the Apple Developer Program exists. It is
      recorded here rather than ticked, because a gate that is quietly reinterpreted stops
      being a gate.
- [ ] Verified one-handed, standing, on a real device.
- [ ] Analytics events added where a gate metric depends on them
      ([`21_ANALYTICS.md`](21_ANALYTICS.md)).
- [ ] Cost impact assessed against [`31_COST_MODEL.md`](31_COST_MODEL.md), and the feature's cost
      class recorded in [`04_FEATURES.md`](04_FEATURES.md).
- [ ] Offline behaviour defined and tested, even when the answer is "unavailable, with this
      state".
- [ ] New risks added to [`35_RISK_REGISTER.md`](35_RISK_REGISTER.md) with an owner and a trigger.

---

## 8. A release is done when

Everything in §7 for every feature, plus:

### Verification

- [ ] All CI checks green; no skipped tests without an issue and an owner.
- [ ] All seven E2E flows pass on Android. iOS **blocked** (ADR-0014)
      ([`22_TESTING.md`](22_TESTING.md)).
- [ ] Order-preservation-on-failure verified.
- [ ] Performance budgets measured on physical reference devices, on battery, warm.
- [ ] Cost and compliance regression guards passing.

### Compliance

- [ ] Paywall verified against Guideline 3.1.2, **both languages, by screenshot**.
- [ ] Privacy manifest and Play Data Safety match actual behaviour.
- [ ] Google attribution visible, and never covered by the dock.
- [ ] Coordinate purge job running, monitored, alerting verified.
- [ ] Audit query confirms no coordinate older than 30 days.
- [ ] Listing free of offline-map and turn-by-turn claims.

### Release mechanics

- [ ] Scheme declarations verified on a device with the navigation apps installed.
- [ ] Migrations verified backward compatible with the previous released version.
- [ ] Version and build number correct; build number monotonic.
- [ ] Release notes written in both languages.
- [ ] **Phased or staged rollout configured** — never a full release.
- [ ] Rollback path confirmed for every layer touched.
- [ ] Demo account active, subscribed and pre-seeded.

---

## 8a. What cannot be verified in this environment, and why — recorded 2026-08-10

Some criteria above are unticked not because the work was skipped but because **the environment
this code is written in cannot exercise them.** Recording that here is the point: an unticked box
with no explanation is indistinguishable from a forgotten one, and by release nobody remembers
which was which.

| Criterion | Why it cannot be checked here | What checks it |
|---|---|---|
| **Performance budgets** (`CLAUDE.md` §6) | Every budget is stated for a mid-range Android device on battery — cold start under 2.5 s, 60 fps at 25 stops, markers under 16 ms a frame. A container has no GPU, no thermal envelope and no touch input, so any number measured here would be a number about this machine | A physical Android phone. The lower the specification the better: the budgets are written for the device the target user actually owns, not for the one a developer does |
| **TalkBack** (`CLAUDE.md` §10 rule 7) | Android's screen reader. It reads the interface aloud and is driven by swipes rather than taps, and it exercises exactly the labels, roles and state announcements the code sets. None of that can run headless | Turning it on: Settings → Accessibility → TalkBack. What matters is whether the route can be built and driven without looking — every control named by what it *does*, every state change announced |
| **Maestro flows** ([`22_TESTING.md`](22_TESTING.md)) | End-to-end tests that drive the built app on a real device or emulator, tapping through the three journeys in [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md). They need an installed APK and a running device, neither of which exists here | An Android device with the development build installed, or CI with an emulator |
| **Contrast in sunlight, gloved touch, thermal throttling** | Physical conditions. This product's operating environment is a van windscreen in August | The phone, outdoors |
| **iOS, at every level** | No Mac, and no paid build service ([ADR-0014](adr/0014-android-first-verification.md)) | Deliberately deferred until Android is finished and proven. The box stays unticked and risk C6 stays open |

**What *is* verified here:** typecheck, lint, format, the whole unit, component, integration and
contract suite, the schema against a real Postgres via PGlite, and `expo prebuild --platform
android` — which is the C6 gate and the only proof that the Expo/`react-native-maps` pair still
resolves ([ADR-0005](adr/0005-map-engine-and-route-preview.md)).

**The honest summary:** everything that can be decided by reading data is decided; everything
that can only be decided by holding the phone is not.

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0001](adr/0001-documentation-language-and-structure.md) | Documentation is single-source and templated | The "documentation updated" gate |
| [0011](adr/0011-server-side-quota-enforcement.md) | Server-side quota and entitlement | The requirement that 402 and 429 paths are tested before done |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates perishable | The null-coordinate handling gate |
| [0005](adr/0005-map-engine-and-route-preview.md) | Facades mandatory | The "no direct SDK import" gate |

**Decided here:** verification on a physical device, in both themes, is part
of done rather than part of QA. A simulator does not reproduce thermal throttling, sunlight,
gloved touch or a real network — and those are this product's operating conditions.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | A criterion does not apply | State why in the pull request. **Never silently skip** |
| 2 | A criterion blocks urgent work | Raise it; decide explicitly; record the exception |
| 3 | A reviewer cannot verify a criterion | The author supplies evidence — a screenshot, a measurement, a test name |
| 4 | Documentation was not updated | The change is not done. Documentation is part of the change, not follow-up |
| 5 | Tests exist but the error state was not implemented | Not done. §6's four-that-get-skipped are explicit for this reason |
| 6 | Performance measured on a simulator | Not done. Physical reference devices only |
| 7 | Feature complete but its cost class is unrecorded | Not done. Cost is decided at acceptance, not discovered in a bill |
| 8 | Work complete but unpushed at the end of a session | Not done. An unpushed commit is not saved work |

## 11. Error handling

| Failure of this process | Detection | Response |
|---|---|---|
| Work reported done but incomplete | Discovered later, usually by a user | The gap becomes a criterion here if it recurs |
| Criteria routinely skipped | Review pattern | The criterion is wrong or unclear — fix or remove it, never keep a fiction |
| Checklist applied mechanically without judgement | Review quality drops | Criteria state their reason so they can be applied thoughtfully |

## 12. Best practices

1. **Verified by someone else.** Self-certified completion is not completion.
2. **State what you did not do**, and why. Partial work honestly reported is manageable; partial
   work reported as complete is not.
3. **Documentation is part of the change**, never follow-up.
4. **Measure, do not estimate**, for anything with a number attached.
5. **Delete criteria that are always skipped.** A rule nobody follows is a fiction that
   discredits the rest.
6. **The four that get skipped are listed for a reason.** Check them explicitly.
7. **Push before you stop.** The container is ephemeral.

## 13. Checklist

*(This document is the checklist; the section is retained for template conformance.)*

Meta-checklist for the criteria themselves, reviewed at each phase gate:

- [ ] Every criterion is verifiable by a reviewer without asking the author.
- [ ] No criterion is routinely skipped.
- [ ] Criteria added in response to real defects, not hypothetical ones.
- [ ] The list is short enough to be used every time.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All three levels enforced manually in review | — |
| 1.x | Automated enforcement of layering, SDK imports and hardcoded values | First repeated violation of the same rule |
| 1.x | Pull request template embedding §6 | Post-launch |
| 2.0 | Automated check that documentation numbers match code constants | First observed drift |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Three levels defined | "Done" meant three different things depending on scope | Architecture |
| 2026-08-06 | Error, offline, degraded and dark theme listed explicitly | These are the four that good intentions do not survive a deadline | Architecture |
| 2026-08-06 | Cost and compliance criteria included at change level | Both pass every functional test while causing real damage | Architecture |
| 2026-08-06 | Documentation defined as part of the change | Follow-up documentation does not happen | Architecture |
| 2026-08-06 | "Committed and pushed" added as a change-level criterion | An ephemeral container destroyed a full set of committed-but-unpushed work | Architecture |

## 16. Rationale

The criteria are grouped by **how they fail**, not by category. The four-that-get-skipped grouping
exists because error, offline, degraded and dark-theme states are not forgotten out of ignorance —
they are deprioritised under time pressure by people who fully intend to return to them. Listing
them as a named group makes their absence a visible omission rather than an invisible one.

Including cost and compliance at the change level, rather than only at release, reflects where
those defects originate. A removed session token, a widened field mask or a coordinate stored
without its timestamp is introduced in a single pull request and is nearly invisible thereafter.
By release, nobody remembers which change caused the anomaly in the bill.

Requiring verification by the reviewer rather than the author is the one procedural rule that does
most of the work. An author who has just spent a day on a change is the worst possible judge of
whether its offline state is adequate, having never seen it fail. A reviewer asking "show me the
offline state" takes thirty seconds and catches what self-certification never does.

The push criterion was added from experience rather than principle: a complete set of committed
documentation was lost when a container was reclaimed, because the push had been deferred. In an
ephemeral environment, "committed" and "done" are not the same word.

The instruction to delete criteria that are always skipped is deliberate. A checklist with items
nobody honours teaches everyone that the checklist is optional, which costs more than the items
themselves were worth.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| A single flat checklist | Simpler; one list | "Done" genuinely differs by scope; a release checklist applied per commit would be ignored |
| Self-certification | Faster; less friction | The author cannot judge their own error states, having never seen them fail |
| Coverage percentage as the completion signal | Objective; automatable | Says nothing about whether error, offline and degraded states exist |
| Documentation as follow-up work | Ships features faster | Follow-up documentation does not happen, and the next reader inherits the gap |
| Longer, more exhaustive criteria | More thorough | A checklist too long to use every time is a checklist used never |
| Automated enforcement from day one | Rules that cannot be skipped | Linting rules before their value is demonstrated produce suppressions and cargo-culting ([`30`](30_CLAUDE_RULES.md)) |
