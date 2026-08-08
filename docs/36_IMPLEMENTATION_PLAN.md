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
| 0 | `feat/w0-foundation` | Expo 57 scaffold, TS strict, lint, Jest + RNTL + MSW, NativeWind, CI `verify` | §6 W0 | ✅ |
| 1 | `feat/w1-domain` | All of `lib/` — pure domain logic | §6 W1 | ✅ |
| 2a | `feat/w2-backend` | Migrations, RLS, purge, seven-step pipeline, validation, cache key | §6 W2a | ✅ |
| 2b | `feat/w2b-upstream` | Five Deno entrypoints and their Google upstream adapters | §6 W2b | ⏳ |
| 3a | `feat/w3-data-layer` | Sync conflict resolution, route progress, the five facade interfaces | §6 W3a | ✅ |
| 3b | `feat/w3b-adapters` | Edge Function client, draft route and its store ✅ · concrete facade adapters and React Query ⏳ | §6 W3b | 🔵 |
| 4 | `feat/w4-design-system` | Tokens, `<AppMap>`, components | §6 W4 | ⏳ |
| 5 | `feat/w5-screens` | Expo Router, the ten screens | §6 W5 | ⏳ |
| 6 | `feat/w6-delivery` | EAS, Fastlane, CI, store preparation | §6 W6 | ⏳ |
| 7 | `docs/go-live-runbook` | **Go-live runbook** — every external account, key and limit, step by step | §6 W7 | ⏳ |

**Decisions taken at implementation start, and open to revision:**

| # | Decision | Revisit when |
|---|---|---|
| I1 | Squash-merge directly to `main`; no pull request per wave | `main` is protected, or a second contributor joins |
| I2 | Cloud accounts not provisioned; build against mocks and contracts | Real integration is the next blocking step, or a Mac is available |
| I3 | Start from foundation and domain, not a walking skeleton | — |

### Wave 0 outcome — recorded 2026-08-07

Gate passed. `expo prebuild --platform android` completes, the Maps key is wired into the
manifest from `app.config.ts`, and typecheck, lint, format and 12 tests are green.

Two things the gate found that inspection would not have:

- **`react-native-maps` 1.29.0 is published, but Expo SDK 57 verifies 1.27.2.** The peer range
  accepts both, so dependency resolution raises nothing. Taking the newer one leaves the
  combination Expo tested — exactly the drift
  [ADR-0005](adr/0005-map-engine-and-route-preview.md) exists to prevent.
- **The CLI recommends `react-native@0.86.0`, and that recommendation cannot be followed**,
  because `jest-expo@57` requires `@react-native/jest-preset@^0.86.2` while 0.86.0 requires
  0.86.0. The two are mutually exclusive; 0.86.2 is the coherent pair, recorded in ADR-0005.

The layering of [`../CLAUDE.md`](../CLAUDE.md) §1 is now enforced by ESLint, and the rules were
checked against deliberate violations before being trusted. Domain constants are covered by
tests asserting each still matches the document that owns it, which makes rule 9 of §13
enforceable rather than aspirational.

**Not covered by this gate:** no iOS prebuild (no Mac), no native compilation, no device run.

### Wave 1 outcome — recorded 2026-08-07

Gate passed. 138 tests, `lib/` at 95% statements and 85% branches, typecheck and lint clean.
All four non-negotiable items are covered: tier boundaries at 8/9 and 25/26 from both sides,
coordinate expiry at 29/30/31 days, every handoff strategy against its capability matrix, and
long Italian addresses against the URL ceiling.

Modules: `geo/haversine`, `coordinates/staleness`, `optimization/tier-selection`,
`optimization/local-solver`, `routing/polyline`, `handoff/{capabilities,urls,chunking}`,
`format/units`.

Three assumptions the tests contradicted, each corrected in favour of the measurement:

- **The URL ceiling does not bite at nine waypoints for a typical Italian address.** Measured,
  a 128-character address yields a 1,687-character URL at nine waypoints, so the waypoint cap
  binds first. The ceiling is the safety net for genuinely verbose addresses — c/o, building,
  floor, internal number — which is still the case a fixed count of nine would truncate
  silently. Both paths are now tested.
- **Italian numbers carry no thousands separator at 1000.** CLDR sets `minimumGroupingDigits`
  to 2, so grouping starts at 10.000. A hand-rolled formatter inserts one and reads as foreign.
- **`en-IT` resolves to European number conventions**, so an English interface in Italy gets a
  decimal comma. A language-keyed lookup would have produced a full stop, wrong in exactly the
  case the locale rule exists for.

The T0 solver is tested by property rather than by fixed expected orders: a heuristic has no
single right answer, so pinning one would test this implementation instead of the requirement.
The properties are that no stop is lost, the origin never moves, and the result is never longer
than the order it was handed.

**Not covered by this gate:** nothing in `lib/` calls the network, so no contract is exercised
here — that is wave 2's gate.

### Wave 2 split into 2a and 2b — recorded 2026-08-07

Wave 2's gate required contract tests for every endpoint, and the endpoints do not exist yet, so
the whole wave was being held back by its unfinished half. That held the schema, the RLS policies
and the pipeline off `main` — work that is finished, tested, and that wave 3 depends on, since
the facades are built against these contracts.

Holding it back was applying the rule to the letter against its purpose. The gate is therefore
**changed deliberately and recorded here**, as §6 requires, rather than quietly waived: wave 2
becomes 2a (schema and pipeline — gate met, merged) and 2b (entrypoints and Google adapters —
the part decision I2 defers, since without credentials they can only ever be exercised against
MSW).

Splitting is the honest move here and lowering the bar would not have been. Every original
requirement still has to be met; they are now attached to the wave that can actually satisfy
them.

### Wave 2a outcome — recorded 2026-08-07

The wave is open. What is done is merged-quality and tested; what remains is named rather than
implied.

**Done and verified.** Migrations for all eight tables, RLS on every one, the coordinate purge
with a scheduled job and a health predicate, the seven-step pipeline, Zod validation for every
endpoint input, and the shared cache key. 214 tests across both projects.

**The environment limit in §7 is lifted.** The plan recorded that migrations could be written
but not executed, because there is no Docker daemon. [PGlite](https://pglite.dev) is Postgres
compiled to WebAssembly and runs in-process, so the migrations are now *applied* and the
policies are exercised between two actual users — the difference between a reviewed schema and
a verified one.

Building that harness surfaced two ways it could have passed for the wrong reason, both fixed:
`set local role` outside a transaction reverts immediately, leaving the query to run as the
owner, who bypasses RLS; and without the grants Supabase gives `authenticated` by default, the
role receives permission-denied rather than an RLS-filtered result. Either would have reported
every policy as working.

**Still to do in this wave.** The five Deno entrypoints and their Google upstream adapters.
Entrypoints were drafted and then removed rather than committed, because they imported modules
that did not exist yet — a file with a dangling import is a placeholder wearing a costume, and
the constitution forbids both. The upstream adapters are also the part decision I2 defers:
without credentials they cannot be exercised against Google at all, only against MSW.

**Not covered by what is verified so far:** no call has been made to any Google API.

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
| **W2a** | Migrations applied against a real Postgres; no table in `public` without RLS; ownership verified between two distinct users; pipeline order verified — entitlement before rate limit, cache after quota; 401, 402 and both 429 paths verified; every request schema tested at its boundaries |
| **W2b** | Each of the five endpoints tested against [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) with MSW standing in for Google; retry and timeout behaviour verified; field masks asserted minimal |
| **W3a** | The offline conflict table verified case by case, including that exactly one situation reaches the user; route progress cannot orphan an entry or leave a route unfinishable; every facade interface typechecks against the domain types |
| **W3b** | MSW integration tests for every hook that calls an Edge Function, failure paths included; no query result copied into a store; draft route survives process death |
| **W4** | Every component with a state machine tested in all its states; contrast verified in both themes; accessible labels present; no hardcoded values |
| **W5** | The three journeys of [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) traversable in tests; three taps from open to optimized route; every screen state implemented |
| **W6** | Full suite green; [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) walked item by item, with hardware-only items explicitly marked rather than ticked |
| **W7** | Written only once everything compiles, builds and the full suite is green. Someone with no context can follow it end to end and reach a working live configuration without asking a question |

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

### Wave 7 — the go-live runbook

**Requested by the product owner, 2026-08-07.** It is recorded here rather than held in a
conversation, because conversations do not survive a reclaimed container and this is the
document a cold session reads.

**When.** After wave 6, once nothing is missing, everything compiles and builds, and the full
suite is green. Not before: a runbook written against code that is still moving describes a
configuration that will not be the one shipped.

**What it must contain**, per external service, in the order a person actually performs them:

1. **Account creation** — which account, which plan, which region (Supabase must be EU, risk C8),
   and what it costs at that moment.
2. **What to enable** — the exact APIs to switch on, and just as importantly the ones to leave
   off. An enabled API nobody calls is an attack surface and a billing surface.
3. **Spending caps and quotas, before any key exists.** Budget alerts and per-API quotas in
   Google Cloud, set at creation time rather than afterwards: the risk begins when the key
   exists, not when the code first calls it.
4. **Key creation and restriction** — the Maps SDK key restricted by bundle ID and SHA-1 and
   scoped to the Maps SDK alone; the server key IP-unrestricted but server-only; the service
   account for Route Optimization, which cannot exist on a client under any circumstances
   (ADR-0006).
5. **Where each secret goes** — `.env` local, Supabase secrets, EAS secrets — and the fact that
   none of them is ever pasted into a chat or committed.
6. **Applying the migrations** and verifying every RLS policy with two distinct users, which is
   the same check the PGlite suite runs but against the real project.
7. **Cloud-based Map Styling** — one Map ID per theme, and the fallback if one fails to resolve
   (risk C15).
8. **RevenueCat** — products, offerings, the webhook endpoint and its signing secret.
9. **Store setup** — Apple Developer Program, App Store Connect, Play Console, and the
   declarations each requires.
10. **A verification step per service**, so the reader knows the step worked rather than assuming
    it, and **a rollback note** for anything that costs money if left on.

**Figures must be re-verified at the time of writing.** The costs in
[`31_COST_MODEL.md`](31_COST_MODEL.md) carry medium confidence: `developers.google.com` was
unreachable from the authoring environment, so they came from secondary sources, and Google has
changed Maps Platform pricing unilaterally before. A runbook repeating an unverified figure is
worse than one that says where to look.

### Wave 3a outcome — recorded 2026-08-07

Gate passed. 258 tests. Three modules, all pure and all in `lib/`, plus the facade contracts.

**Conflict resolution** verifies the table of §8 case by case, including a test asserting that no
mutation kind other than reorder-versus-reorder can ever reach the user. That asymmetry is the
design: a dialog for a case the system can decide is noise, and noise trains people to dismiss
the dialog that matters.

**Route progress** is tested for what must never happen rather than for the happy path, because
it accumulates across a working day while the app is backgrounded: no mutation of a caller's
reference, no orphan entry holding a route permanently unfinishable, no route that cannot end.

**The facade interfaces** are the seam ADR-0012 depends on. They return expected failures rather
than throwing them, and they name product concepts rather than SDK ones.

**Split from 3b for the same reason wave 2 was split**: the concrete adapters, React Query wiring
and Zustand stores are a coherent unit of their own, and holding these contracts back would block
wave 4, which builds components against them.

**Not covered by this gate:** nothing here touches the network or React. No hook, store or
adapter exists yet.

### Wave 3b progress — recorded 2026-08-07, **open**

`main` carries this increment even though the wave is not closed. It is complete, tested and
breaks nothing, and `main` is meant to be releasable rather than to mark my own bookkeeping —
holding finished work on a branch to preserve a wave boundary would serve the ledger and not the
project.

**Done.** The typed Edge Function client, the draft-route domain, and the draft-route store.
325 tests.

**Still open.** The concrete facade adapters over the client, React Query with its persisted
cache, and the remaining stores — route progress, preferences, mutation queue.

**MSW does not run here**, and [`22_TESTING.md`](22_TESTING.md) is corrected rather than
quietly deviated from: v2 pulls ESM-only transitive dependencies that Jest's CommonJS runtime
refuses before any transform runs. The network is substituted through the `fetchImpl` the client
already accepts, which serves the underlying rule more directly than interception — no global is
patched, and the substitution is visible in the call signature.

**Two defects the tests found, both real.** Cancelling before the fetch was reached still issued
the request, so a superseded keystroke was paid for. And TypeScript narrowed `signal.aborted` to
false after that guard and never widened it, because control-flow analysis cannot see the signal
change mid-flight — which is exactly when a cancellation happens.

### How the app is actually tried — decided 2026-08-07

Recorded because it changed the shape of several documents, and because my first answer on it was
wrong.

**The decision.** Verification is Android-first, on a real phone, through a development build
that CI produces as a downloadable artifact ([ADR-0014](adr/0014-android-first-verification.md)).
It is installed once; after that every change arrives by QR code with instant reload — the Expo
Go loop, but carrying this app's own native capabilities. iOS stays in the codebase and is
explicitly unverified.

**The correction.** I first said hands-on iOS testing was impossible without a Mac or the $99
Developer Program, and the product owner made a scope decision on that basis. It was wrong: an
iOS *simulator* build needs no paid account and can be streamed to a browser and operated by
hand. The $99 buys installation on a *physical* iPhone and publication, not hands-on use. The
decision landed in the same place for a different and better reason — an Android phone gives a
real device with real GPS and real navigation apps installed, which a simulator cannot — but the
reasoning offered at the time was not sound.

**Why not Expo Go**, more precisely than "native modules": detecting which navigation apps are
installed needs build-time manifest declarations that Expo Go cannot carry, and in-app purchases
need native configuration it does not have. Those are the product's two edges. Expo Go would
verify the middle and neither end.

**What stays unverified, and stays written down as such.** Handoff to installed navigation apps
on iOS, and the performance budgets on an iPhone. Neither threshold is lowered. A budget chosen
because it can be measured is no longer a budget.

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
