# 22 — Testing

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) · [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) · [`24_PERFORMANCE.md`](24_PERFORMANCE.md)

---

## 1. Purpose

This document specifies the test strategy: what is tested at each level, what must be tested
regardless of coverage percentages, and how the notoriously difficult parts of this stack — native
maps, external app handoff, store subscriptions — are made testable.

## 2. Goals

1. Make every failure path in the specification a tested path.
2. Keep the fragile native surfaces testable through the facades.
3. Catch cost and compliance regressions, which are invisible to conventional testing.
4. Keep the suite fast enough to run on every commit.

**Non-goals.** No coverage percentage target. No manual regression scripts as a primary
mechanism.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Unit and integration tests | Whoever writes the code | Same pull request |
| E2E flows | QA + engineering | One per journey |
| Contract tests | Architecture | Against [`33`](33_API_CONTRACTS.md) |
| Device verification | QA | Physical devices, both platforms |

---

## 4. Text diagrams

### The pyramid, as it applies here

```
              ╱╲          E2E — Maestro
             ╱  ╲         3 journeys + 4 failure paths
            ╱────╲        slow, few, high value
           ╱      ╲
          ╱ CONTRACT╲     Edge Function shapes vs 33_API_CONTRACTS
         ╱──────────╲     fast, catches drift between client and server
        ╱            ╲
       ╱  INTEGRATION ╲   hooks + MSW; every failure path
      ╱────────────────╲
     ╱                  ╲
    ╱     COMPONENT      ╲  RNTL; every state in 09_COMPONENT_LIBRARY
   ╱──────────────────────╲
  ╱                        ╲
 ╱          UNIT            ╲ Jest; everything in lib/ — pure, fast, exhaustive
╱────────────────────────────╲
```

### Making the untestable testable

```
  <AppMap> facade         ──▶  test implementation renders markers as
                               plain views. E2E asserts on stop order
                               without a real map surface.

  NavigationProvider      ──▶  test implementation records handoff URLs
                               instead of opening them. Chunking and
                               capability rules are asserted directly.

  BillingProvider         ──▶  scriptable entitlement states. Trial,
                               grace and expiry tested without the store.

  MSW                     ──▶  every Edge Function response, including
                               402, 429, 503 and partial success.

  Without these four seams, the most important behaviour in the
  product would be untestable.
```

---

## 5. Flows

**A bug's life.** The order is fixed: the failing test comes first, always.

```
  defect reported
       │
       ▼
  failing test that reproduces it ──── cannot reproduce ──▶ not yet a defect; investigate
       │
       ▼
  fix ──▶ the test passes ──▶ it joins the suite permanently
       │
       ▼
  was it a class of bug, not an instance?  ──yes──▶ a regression class is added below
```

**What runs when.**

```
  pre-commit   typecheck · lint · format
  pull request unit · component · integration · contract
  pre-release  E2E on the three journeys · performance on reference devices ·
               accessibility audit · both platforms, both themes
```

**How the hard parts are tested.** Native maps are mocked at the `<AppMap>` facade, external
handoff at the `NavigationProvider` boundary, store subscriptions at `BillingProvider`, and
Edge Functions with MSW against the contracts in
[`33_API_CONTRACTS.md`](33_API_CONTRACTS.md). The facades exist partly for this reason: an SDK
imported directly into a screen is a screen that cannot be tested.

**What is never mocked.** The function under test. Mocking it produces a test of the mock.

## 6. Levels

### Unit — Jest

Everything in `lib/`. These are pure functions and must be exhaustively tested, because they
encode the rules that cost money or break compliance when wrong.

**Mandatory, regardless of any coverage figure:**

| Area | Boundaries to test |
|---|---|
| Tier selection | **8/9 stops, 25/26 stops**, online/offline, with/without constraints |
| Handoff chunking | URL length ceiling, chunk overlap, long Italian addresses |
| Capability matrix | Every provider against every route shape |
| Coordinate staleness | 29/30/31 days; NULL handling |
| Quota arithmetic | At limit, over limit, month boundary |
| T0 heuristic | Determinism, time budget, 2-opt improvement |
| Polyline decoding | Valid, malformed, empty |
| Time saved | Positive, zero, **negative** |
| Formatting | Italian decimal comma, 24-hour, distance rounding |

The boundaries matter more than the middles. Defects live at 8/9 and 25/26 stops, not at 15.

### Component — React Native Testing Library

Every component renders **every state** listed for it in
[`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md): loading, empty, error, offline, degraded,
blocked, selected, completed, unreachable.

A component test that only covers the success state is an incomplete test, and the missing states
are exactly the ones users encounter at the worst moment.

Accessibility is asserted here: every interactive element has a label, and labels state outcomes.

### Integration — Jest + MSW

Every hook that talks to an Edge Function, **including every failure path**: 402, 429, 503, 504,
partial success, timeout, and offline.

MSW returns the exact shapes in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md), including the error
envelope and `degradationHint`, so the client's degradation logic is genuinely exercised.

### Contract

Asserts that each Edge Function's request and response match
[`33_API_CONTRACTS.md`](33_API_CONTRACTS.md). Run against a local Supabase instance in CI.

These catch the drift that unit tests cannot see: the client and server both pass their own tests
while disagreeing about a field name.

### E2E — Maestro

One flow per journey in [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md), plus the failure paths that
matter most.

| Flow | Asserts |
|---|---|
| J1 plan and optimize | **Exactly three taps**; order changes; ETA appears |
| J2 drive | Handoff URL constructed; progression; **process death recovery** |
| J5 reuse | Saved route opens; expired coordinates re-hydrate |
| J6 offline | Airplane mode; own data available; T0 offered at ≤8 stops |
| J7 blocked | 402 and 429 produce their designed states |
| J8 import | Partial success proceeds |
| **Optimization failure** | **Stop order is preserved exactly** |

The last one is listed separately because it verifies the single most important rule in the
product ([`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md) P3).

E2E runs against the `<AppMap>` test implementation, which renders markers as plain views. This is
what makes map-dependent flows assertable at all.

### Performance

Budgets from [`24_PERFORMANCE.md`](24_PERFORMANCE.md), measured on physical reference devices, on
battery, warm. Not on simulators, which do not throttle and do not have real GPUs.

### Store validation

Pre-submission, manual, every release:

- Paywall against Guideline 3.1.2, both languages.
- Purchase, restore and trial expiry in sandbox.
- Permission denials on fresh installs.
- Privacy manifest and Data Safety against actual behaviour.
- Attribution visible at every sheet detent.

---

## 7. Regression classes

Two kinds of regression are invisible to conventional testing and get their own mechanisms.

### Cost regressions

A change that removes a session token, widens a field mask, bypasses the cache or puts search
before the address book **passes every functional test** while multiplying COGS
([`31_COST_MODEL.md`](31_COST_MODEL.md)).

| Guard | Mechanism |
|---|---|
| Session token present | Contract test asserts 400 without one |
| Field masks minimal | Test asserts the exact mask per call |
| Cache consulted | Integration test asserts no upstream call on a repeat |
| Address book before search | Component test asserts ordering |
| Usage recorded | Integration test asserts a `usage_events` write |

### Compliance regressions

A coordinate cached beyond 30 days, an address in telemetry, or Google content on a non-Google
map also pass every functional test.

| Guard | Mechanism |
|---|---|
| Coordinate expiry | Unit test at 29/30/31 days; audit query in CI against a seeded database |
| No personal data in telemetry | Test asserts event payloads contain no address or coordinate fields |
| Single map engine | Lint rule: only `<AppMap>` may import `react-native-maps` |
| Attribution visible | Component test at every detent |

---

## 8. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0005](adr/0005-map-engine-and-route-preview.md) | `<AppMap>` facade | Why map rendering is mockable at all |
| [0004](adr/0004-external-navigation-handoff.md) | `NavigationProvider` with a capability matrix | Handoff strategy tests, one per provider |
| [0003](adr/0003-tiered-optimization-cascade.md) | Cascade T0–T3 | Tier-boundary tests at 8, 9, 25 and 26 stops |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates expire at 30 days | Staleness tests at 29, 30 and 31 days |
| [0011](adr/0011-server-side-quota-enforcement.md) | Server-side quota | 402 and 429 path tests |

**Decided here:** the tier boundaries, the coordinate expiry boundary and every error path are
non-negotiable coverage regardless of any global percentage. A coverage number is satisfied by
testing what is easy; these are the cases that are hard and that break users.

## 9. Edge cases

| # | Condition | How it is tested |
|---|---|---|
| 1 | Process death mid-route | Maestro: kill and relaunch; assert progress |
| 2 | Airplane mode mid-optimization | Maestro: toggle; assert order preserved and T0 offered |
| 3 | 25 stops at 60 fps | Performance test on the low-tier device |
| 4 | Dynamic Type 200% | Component snapshot at maximum size |
| 5 | Trial expiry mid-session | `BillingProvider` test implementation scripts the transition |
| 6 | Webhook out of order | Integration test with reversed timestamps |
| 7 | Concurrent optimizations | Integration test asserting cancellation and idempotency |
| 8 | Captive portal | Integration test: connectivity true, requests fail |
| 9 | Long Italian addresses in a handoff | Unit test against the URL ceiling |
| 10 | Reorder conflict on sync | Integration test with divergent orders |

## 10. Error handling in tests

| Situation | Rule |
|---|---|
| Flaky test | Quarantined **with an issue and an owner**, never deleted or retried into passing |
| Failing test on `main` | Blocks all merges until fixed |
| Skipped test | Requires an issue and an owner; a permanent skip is a deleted test pretending otherwise |
| Test needs a real network | Rewrite it — the suite must run offline |
| Test needs a real store account | Confined to the manual pre-submission checklist |

## 11. Best practices

1. **A bug fix starts with a failing test** that reproduces it.
2. **Never mock what you are testing.** Mock the network, the map, the clock — not the subject.
3. **Test boundaries, not middles.** 8/9 and 25/26, not 15.
4. **Every failure path in the specification is a test.** An untested error path is an unwritten
   one.
5. **Assert on behaviour, not implementation.** A test asserting internal state breaks on every
   refactor and catches nothing.
6. **Keep the suite fast.** A slow suite gets skipped, and a skipped suite catches nothing.
7. **Cost and compliance guards are tests**, not review items.

## 12. Checklist

- [ ] Every function in `lib/` unit tested, boundaries included.
- [ ] Every component state in [`09`](09_COMPONENT_LIBRARY.md) rendered in a test.
- [ ] Every failure path in [`33`](33_API_CONTRACTS.md) exercised via MSW.
- [ ] Contract tests pass against a local Supabase instance.
- [ ] All seven E2E flows pass on both platforms.
- [ ] Three-tap count asserted in E2E.
- [ ] Order-preservation-on-failure asserted in E2E.
- [ ] Cost regression guards in place and passing.
- [ ] Compliance regression guards in place and passing.
- [ ] Performance budgets measured on physical reference devices.
- [ ] Store validation checklist completed before submission.
- [ ] No skipped tests without an issue and an owner.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All levels above | — |
| 1.x | Automated performance regression in CI | Post-launch |
| 1.x | Visual regression on the design system | Post-launch |
| 1.x | Automated accessibility audit | Post-launch |
| 2.0 | Load testing on Edge Functions | Volume |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | No coverage percentage target | Percentages incentivise testing easy code; the mandatory list targets what matters | Architecture |
| 2026-08-06 | Cost and compliance regression classes defined | Both pass every functional test while causing real damage | Architecture |
| 2026-08-06 | Facades required partly for testability | Native map, handoff and billing are otherwise untestable | Architecture |
| 2026-08-06 | Order preservation given its own E2E flow | It is the single most important rule in the product | Architecture |

## 15. Rationale

The strategy is shaped by what can actually go wrong in this product. Conventional testing catches
functional defects, and those are the least of the risks here. The failures that would genuinely
damage the project — a quota check removed, a session token dropped, a coordinate cached
indefinitely, a field mask widened — all produce correct behaviour and a larger bill or a terms
violation. Naming those as regression classes with their own guards is the main contribution of
this document.

The facades earn their cost again here. Without a test implementation of `<AppMap>`, every E2E
flow would depend on a real native map, which is slow, flaky and hard to assert against. Without
a scriptable `BillingProvider`, trial expiry and grace periods would only be testable against
sandbox store accounts. The architectural decision and the testing decision are the same decision.

Refusing a coverage target is deliberate. A percentage rewards testing whatever is easiest to
cover, which in this codebase would be presentational components, while the tier-selection rule
and the chunking arithmetic — where the real risk lives — could remain untested and the number
would still look healthy. The mandatory list in §6 is the actual requirement.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| A coverage percentage target | Objective; easy to enforce in CI | Rewards testing easy code and says nothing about whether the risky logic is covered |
| E2E against a real map | Tests what users see | Slow, flaky, and hard to assert on marker order. The facade gives assertable equivalence |
| Manual regression scripts | No infrastructure; flexible | Does not scale, gets skipped under deadline, and never catches cost or compliance regressions |
| Testing against real Google APIs | Highest fidelity | Costs money per run, is slow, and fails when Google does. Contract tests plus MSW give the same confidence |
| Snapshot tests as the primary component strategy | Fast to write; broad coverage | Breaks on every cosmetic change and asserts nothing about behaviour |
| Deferring E2E until after launch | Faster MVP | The three journeys are the product. Shipping without verifying them end to end is shipping untested |
