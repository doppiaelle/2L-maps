# 36 — Implementation Plan

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-07
> **Related:** [ADR-0013](adr/0013-implementation-execution-model.md) · [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md) · [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) · [`22_TESTING.md`](22_TESTING.md)

---

> **This document is the live status of implementation.** A session resuming with no memory of
> previous work reads [`../CLAUDE.md`](../CLAUDE.md), then [`INDEX.md`](INDEX.md), then §5 below,
> and knows exactly where the work stands and what comes next.

---

## 1. Purpose

This document answers one question: **how does a complete specification become a shipped app,
without losing progress between sessions that share no memory?**

It is not a second specification. What to build is settled by documents 00–35; this document
governs the order, the branch discipline, the exit condition of each stage, and where the
current position is recorded.

## 2. Goals

1. Make it impossible to lose more than one unit of work to a reclaimed container.
2. Let a cold session resume from the repository alone, with no conversational context.
3. Give every wave a falsifiable exit condition rather than a judgement of completeness.
4. Name what cannot be verified in the development environment, rather than letting it pass
   silently as done.

**Non-goals.** No dates — the roadmap in [`28_ROADMAP.md`](28_ROADMAP.md) is gated by evidence,
and this document inherits that. No re-statement of any requirement, schema or budget.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Wave order and gates | This document | The only source |
| Status accuracy | Updated at every wave close | §5 |
| Branch and merge discipline | [`../CLAUDE.md`](../CLAUDE.md) §11, [ADR-0013](adr/0013-implementation-execution-model.md) | |
| What "done" means | [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) | Gates cite it, never restate it |
| Environment limits | §7 | Reviewed whenever the environment changes |

---

## 4. Text diagrams

### Branch topology

```
  main ──●───────────────●───────────────●───────────────●──▶  always releasable
          \             / \             / \             /
           feat/w0-foundation   feat/w1-domain   feat/w2-backend   …
           │                    │                │
           └ commit + push      └ commit + push  └ commit + push
             continuously         continuously     continuously

  One wave open at a time. The wave branch is retained on the remote
  after its squash-merge, as the detailed record the squash discards.
```

### Build order follows the layering

```
   app/          ← wave 5   screens, routing, guards
   features/     ← wave 5
   components/   ← wave 4   design system, AppMap, sheet
   lib/          ← wave 1   the domain, pure and exhaustively tested
   types/        ← wave 0

   supabase/     ← wave 2   migrations, RLS, Edge Functions
   delivery      ← wave 6   EAS, Fastlane, CI, store

   Bottom-up: every layer rests on one already tested. Wave 3 is the
   seam between them — the facades, where lib/ meets the network.
```

### Where the two halves meet

```
   client (Expo)                                  backend (Deno)
        │                                               │
        │        33_API_CONTRACTS.md — frozen           │
        └──────────────────┬────────────────────────────┘
                           │
      built against MSW    │    verified by contract tests
      mocks of the contract│    against the same contract
      before the backend   │    with no client present
      exists               │

   Neither waits for the other. They wait for the document, which exists.
```

## 5. Status

**Legend:** ✅ merged to `main` · 🔵 in progress · ⏳ not started

| Wave | Branch | Content | Gate | Status |
|---|---|---|---|---|
| — | `main` | Documentation set 00–36, ADRs 0001–0013 | Consolidation audit passed | ✅ |
| 0 | `feat/w0-foundation` | Expo 57 scaffold, TS strict, lint, Jest + RNTL + MSW, NativeWind, CI `verify` | §6 W0 | 🔵 |
| 1 | `feat/w1-domain` | All of `lib/` — pure domain logic | §6 W1 | ⏳ |
| 2 | `feat/w2-backend` | Migrations, RLS, five Edge Functions | §6 W2 | ⏳ |
| 3 | `feat/w3-data-layer` | Facades, React Query, Zustand, offline queue | §6 W3 | ⏳ |
| 4 | `feat/w4-design-system` | Tokens, `<AppMap>`, components | §6 W4 | ⏳ |
| 5 | `feat/w5-screens` | Expo Router, the ten screens | §6 W5 | ⏳ |
| 6 | `feat/w6-delivery` | EAS, Fastlane, CI, store preparation | §6 W6 | ⏳ |

**Decisions taken at implementation start, and open to revision:**

| # | Decision | Revisit when |
|---|---|---|
| I1 | Squash-merge directly to `main`; no pull request per wave | `main` is protected, or a second contributor joins |
| I2 | Cloud accounts not provisioned; build against mocks and contracts | Real integration is the next blocking step, or a Mac is available |
| I3 | Start from foundation and domain, not a walking skeleton | — |

## 6. Flows

### How a wave runs

```
  branch from main ──▶ work in small units ──▶ commit + push each unit
                                                      │
                          ┌───────────────────────────┘
                          ▼
                   gate evaluated
                          │
             ┌────────────┴────────────┐
            passes                    fails
             │                          │
             ▼                          ▼
   status updated here          gate is not lowered; the work
             │                  continues, or the gate is changed
             ▼                  deliberately and recorded below
   squash-merge to main ──▶ push ──▶ verify with git ls-remote
             │
             ▼
   next wave branches from the updated main
```

### The gates

| Wave | Gate |
|---|---|
| **W0** | `npx expo prebuild --platform android` completes with the pinned pair (§8); typecheck, lint and an empty suite run clean; CI green on the first push |
| **W1** | Non-negotiable coverage of [`../CLAUDE.md`](../CLAUDE.md) §5: tier boundaries at 8/9 and 25/26 stops, coordinate expiry at 29/30/31 days, every handoff strategy against its capability matrix, long Italian addresses against the URL ceiling |
| **W2** | Contract tests for every function against [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md); 401, 402 and 429 paths verified; pipeline order verified — entitlement before rate limit, cache after quota |
| **W3** | MSW integration tests for every hook that calls an Edge Function, failure paths included; no query result copied into a store; draft route survives process death |
| **W4** | Every component with a state machine tested in all its states; contrast verified in both themes; accessible labels present; no hardcoded values |
| **W5** | The three journeys of [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) traversable in tests; three taps from open to optimized route; every screen state implemented |
| **W6** | Full suite green; [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) walked item by item, with hardware-only items explicitly marked rather than ticked |

### How a cold session resumes

```
  read CLAUDE.md          the rules that cannot be broken
        ▼
  read docs/INDEX.md      what exists and who owns it
        ▼
  read §5 above           which wave, which branch, which gate
        ▼
  git ls-remote           confirm nothing lives only locally
        ▼
  continue
```

## 7. Environment limits

Verified in the development environment, not assumed. These are the reason several gates state
what they do **not** cover.

| Capability | Status | Consequence |
|---|---|---|
| Node 22, npm, npm registry | ✅ available | Install, typecheck, lint, test all run |
| `expo prebuild` (Android) | ✅ runs in Node | Risk C6 is reproducible here without a Mac — this is the W0 gate |
| Docker daemon | ❌ not running | No local Postgres. Migrations are written and reviewed, not executed |
| Mac, physical device, emulator | ❌ absent | No iOS build, no Maestro E2E, no performance measurement, no sunlight legibility check |
| Supabase, GCP, RevenueCat accounts | ❌ not provisioned (I2) | No upstream call is made; the client works against MSW, the backend against contract tests |

**Work requiring hardware or accounts**, collected here so it is not discovered at the end:

1. Change the GitHub default branch to `main` — Settings → General → Default branch. Not
   reachable from any available tool; it needs a human.
2. Create the Supabase project in an EU region (risk C8), the GCP project with billing and a
   service account, and RevenueCat.
3. Execute the migrations and verify every RLS policy with two distinct users.
4. Create one Cloud-based Map Styling Map ID per theme (risk C15).
5. Produce a development build on a physical device — `react-native-maps` is native, so Expo Go
   cannot run this app (risk C10).
6. Run Maestro E2E, measure the budgets of [`24_PERFORMANCE.md`](24_PERFORMANCE.md) on the
   reference devices, and verify accessibility outdoors.

## 8. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0013](adr/0013-implementation-execution-model.md) | Waves, short-lived branches, gates, status in the repository | This document entirely |
| [0005](adr/0005-map-engine-and-route-preview.md) | Expo SDK and `react-native-maps` pinned as a pair | The W0 gate |
| [0001](adr/0001-documentation-language-and-structure.md) | Single-source documentation | Why no gate restates a number |
| [0006](adr/0006-mandatory-backend-proxy.md) | Backend proxy | Why wave 2 exists as a separate wave at all |
| [0011](adr/0011-server-side-quota-enforcement.md) | Server-side quota | Why the W2 gate tests 402 and 429 explicitly |

**Decided here:** the version pinning required by [ADR-0005](adr/0005-map-engine-and-route-preview.md)
is verified by executing `expo prebuild`, not by reading peer ranges. Risk C6 was never a
dependency-resolution failure — it was a config plugin breaking `prebuild` by importing internal
`@expo/config-plugins` paths. A peer range that looks satisfied says nothing about it.

Versions read from the registry on 2026-08-07, to be confirmed by that gate:

| Package | Version | Note |
|---|---|---|
| `expo`, `expo-router` | 57.0.11 | Current SDK |
| `react-native-maps` | 1.29.0 | Peer `react-native >= 0.76.0` |
| `@tanstack/react-query` | 5.101.4 | |
| `zustand` | 5.0.14 | |
| `nativewind` | 4.2.6 | |

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Container reclaimed mid-wave | At most one unit of work lost; the branch on the remote is the recovery point |
| 2 | A gate fails repeatedly | The gate is not lowered. Either the work continues or the gate changes deliberately, recorded in §12 |
| 3 | The W0 pinning gate fails | Step down the Expo SDK until `prebuild` succeeds; record the pair and the observed error in [ADR-0005](adr/0005-map-engine-and-route-preview.md) |
| 4 | A defect in a merged wave found later | Fixed in a `fix/` branch from `main`, never by reopening the merged wave |
| 5 | A wave turns out to depend on an unprovisioned account | The dependent part is deferred to §7 and the rest of the wave completes; the gate states the exclusion |
| 6 | Documentation found wrong during implementation | The document is corrected first, with an ADR if a decision changed — [`../CLAUDE.md`](../CLAUDE.md) §14 |
| 7 | Two waves would touch the same file | They do not run concurrently; this is the reason for one wave at a time |
| 8 | A push fails on a network error | Retried with bounded exponential backoff; the next wave does not start until it succeeds |

## 10. Error handling

| Failure | Detection | Result |
|---|---|---|
| Work exists only locally | `git ls-remote` at wave close | Pushed before anything else proceeds |
| Status table disagrees with the branches | Cold-session resume | Status corrected from `git`, which is the truth |
| CI red on `main` | GitHub Actions | Fixed before the next wave starts — a red `main` is not releasable |
| A number in code disagrees with a document | Review, and the constants citing their source | The document wins; the constant is corrected |
| A gate passed but the work was incomplete | Discovered downstream | The gate was wrong; it is strengthened and recorded in §12 |

## 11. Best practices

1. **Push after every meaningful unit**, not at wave close. The container does not warn you.
2. **State the gate before starting the wave**, not after finishing it.
3. **Name what a gate does not cover.** An unstated exclusion reads as verified.
4. **Keep one wave open.** Two open waves is a merge conflict scheduled for later.
5. **Update §5 at close, in the same commit as the merge.** A status updated later is a status
   that is wrong in between.
6. **Cite documents; never restate their numbers.** Constants reference the document that owns
   them.
7. **Verify environment claims rather than assuming them.** Every entry in §7 was executed.

## 12. Checklist

Per wave:

- [ ] Branch cut from an up-to-date `main`.
- [ ] Gate stated before work began.
- [ ] Commits pushed continuously, not batched to the end.
- [ ] Tests written for all changed logic ([`22_TESTING.md`](22_TESTING.md)).
- [ ] Typecheck, lint and the suite pass with no suppressions.
- [ ] No hardcoded value that duplicates a documented one.
- [ ] Gate evaluated and its exclusions stated.
- [ ] §5 updated in the merge commit.
- [ ] Squash-merged to `main` and pushed.
- [ ] `git ls-remote` confirms `main` and the wave branch are both on the remote.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| Waves 0–1 | Foundation and domain, no external dependency | Now |
| Wave 2 | Backend, verified by contract | Wave 1 merged |
| Waves 3–5 | Client through to screens | Wave 2 merged |
| Wave 6 | Delivery pipeline and store preparation | Wave 5 merged |
| Post-wave | Provisioning, device verification, E2E | A Mac and the accounts in §7 |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-07 | Plan created; seven waves, one branch each | Implementation begins and the environment is ephemeral | Architecture |
| 2026-08-07 | Squash-merge directly to `main` (I1) | Single contributor, `main` not yet protected | Architecture |
| 2026-08-07 | Cloud provisioning deferred (I2) | Maps Platform has no sandbox; the first two waves need no upstream call | Architecture |
| 2026-08-07 | Pinning verified by `expo prebuild`, not by peer ranges | Risk C6 was a config-plugin failure, invisible to dependency resolution | Architecture |

## 15. Rationale

The wave structure exists for one reason: **this project is developed on machines that
disappear.** Every other property follows. Short-lived branches keep the recovery point close.
Continuous pushing keeps the loss bounded to a single unit. Status in the repository keeps a
cold session from having to reconstruct where the work stood, which it cannot do from memory it
never had.

Gates are the second idea, and the more contested one. It is normal to end a stage when it feels
finished; the failure mode is that "finished" is negotiable under time pressure, and the parts
that quietly get dropped are the error paths and the boundary tests — exactly the parts
[`../CLAUDE.md`](../CLAUDE.md) §5 makes non-negotiable. A stated gate makes the drop visible. The
audit that closed the documentation phase is the argument: a conformance check that matched
loosely reported success while two mandatory sections were missing from most documents. A check
that cannot fail is not a check.

Sequential waves rather than parallel branches is a judgement about this project specifically,
not a general preference. With one executor, parallel branches over a shared `types/` and `lib/`
buy conflicts and no throughput. The genuine decoupling the project needs already exists in a
better form: the contract in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) is frozen, so the
client can be built entirely against mocks of it and the backend entirely against tests of it.
That is contract-first development, and it delivers the independence that parallel branches only
appear to.

Deferring cloud provisioning is the decision most likely to look like procrastination. It is the
opposite. Maps Platform has no sandbox, so an account created today starts consuming the same
free tier the product will launch on, for months of development that make no upstream calls at
all. The first two waves — the entire domain, where the differentiating logic lives — need
nothing but Node.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| No plan document; track progress in conversation | Nothing to maintain; faster to start | Sessions share no memory. The plan would be lost with the first container, exactly as work was lost once already (risk S4) |
| Dates per wave | Legible; looks like a schedule | A solo-developer schedule with dates is discounted by everyone including its author. Gates are falsifiable; dates are not |
| One branch for the whole implementation | No merge overhead; a single continuous history | `main` would hold no working software for months, and the wave gate — the mechanism that keeps error paths from being dropped — would have nowhere to attach |
| Skip the `prebuild` gate and trust the peer range | Saves a step at the very start | The peer range was satisfied when C6 fired. Trusting it is how the failure reaches wave 4 instead of wave 0 |
| Provision accounts now so nothing is mocked | Real integration from day one; no mock drift | Bills the launch free tier for months of development that make no upstream calls, and blocks the start on account creation that nothing yet needs |
| Build the UI first, domain later | Visible progress early; easier to demonstrate | Puts the untested layer under the tested one, inverting the layering in [`../CLAUDE.md`](../CLAUDE.md) §1 and making the components carry logic that belongs in `lib/` |
