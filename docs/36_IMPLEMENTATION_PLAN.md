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
| 2b | `feat/w2b-upstream` | Seven Deno entrypoints, three upstream adapters, endpoint logic in `_shared/endpoints/` | §6 W2b | ✅ |
| 3a | `feat/w3-data-layer` | Sync conflict resolution, route progress, the five facade interfaces | §6 W3a | ✅ |
| 3b | `feat/w3b-adapters` | Edge Function client, all five concrete facade adapters, React Query policy, four Zustand stores | §6 W3b | ✅ |
| 4a | `feat/w4-design-system` | Tokens, contrast enforcement, generated Tailwind theme | §6 W4 | ✅ |
| 4b | `feat/w4b-components` | `<PrimaryAction>`, `<StopRow>`, `<AdSlot>` | §6 W4 | ✅ |
| 4c | `feat/w4c-map-list` | Marker clustering, the virtualised `<StopList>` | §6 W4 | ✅ |
| 4d | `feat/w4d-appmap` | `<AppMap>` over `react-native-maps`, route geometry, map style | §6 W4 | ✅ |
| 4e | `feat/w4e-feedback` | `<UndoToast>`, `<StatusChip>`, `<MetricPair>`, `<Skeleton>`, `<StateView>` | §6 W4 | ✅ |
| 5a | `feat/w5-screens` | Router tree, guards, deep links, restoration, sign-in | §6 W5 | ✅ |
| 5b | `feat/w5b-plan` | The sheet, the plan state machine, `<PlanView>` | §6 W5 | ✅ |
| 5c | `feat/w5c-data` | Stored-shape fix, query hooks, Plan's data wiring, the modal contents | §6 W5 | 🔵 |
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

**Done.** Three upstream adapters (Routes, Places, the address parser), the shared handler, and
seven entrypoints. **508 tests.**

**The rule that came out of this wave.** `supabase/functions/*/index.ts` is excluded from `tsc`
because those files import Deno globals — so anything written in an entrypoint is unchecked by
construction. I discovered this by putting ninety lines of routing logic in one and watching a
property named `id_placeholder` typecheck cleanly. The rule is therefore not "entrypoints should
be thin" but **an entrypoint contains no decisions**; logic lives in
`supabase/functions/_shared/endpoints/`, which is typed and tested. The move paid immediately —
`tsc` caught a client-only error code being used server-side the moment the file was covered.

**A wave-2a defect, not a contract gap.** `/optimize`'s documented request has always carried
`stopId` and `isPinned`; the schema written in wave 2a dropped both, leaving the server unable to
name the stops it reorders. The first instinct was to add the field to the document. The document
was right.
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
| **W2b** | Each of the six endpoints tested against [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) with MSW standing in for Google; retry and timeout behaviour verified; field masks asserted minimal |
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

### Wave 3b closed — recorded 2026-08-08

`main` carries this increment even though the wave is not closed. It is complete, tested and
breaks nothing, and `main` is meant to be releasable rather than to mark my own bookkeeping —
holding finished work on a branch to preserve a wave boundary would serve the ledger and not the
project.

**Done.** The typed Edge Function client and the draft-route domain and store, then the
routing, geocoding, navigation, billing and advertising adapters, the React Query policy, and the
route-progress, preferences, mutation-queue and UI stores. **441 tests.**

**Two contract gaps surfaced by writing the adapters rather than by reading the document.**
`/geocode` was specified to return a `place_id` and a formatted address and nothing else, while
`resolveBatch` exists precisely to turn expired coordinates back into usable ones — so the facade
needed a field the contract never promised. And `/place-details` appeared in the timeout table
with its own budget and retry policy while being defined nowhere. Both are now specified in
[`33_API_CONTRACTS.md`](33_API_CONTRACTS.md). Separately, the billing adapter was briefly written
against an `/entitlement` endpoint that does not exist; it was folded into `/usage-quota`, which
already returned the plan, rather than adding a seventh function for one read.

This is the pattern worth naming for later waves: **an adapter is the first consumer that has to
believe the contract**, and it finds the places where the document was written from the outside
in.

**MSW does not run here**, and [`22_TESTING.md`](22_TESTING.md) is corrected rather than
quietly deviated from: v2 pulls ESM-only transitive dependencies that Jest's CommonJS runtime
refuses before any transform runs. The network is substituted through the `fetchImpl` the client
already accepts, which serves the underlying rule more directly than interception — no global is
patched, and the substitution is visible in the call signature.

**Two defects the tests found, both real.** Cancelling before the fetch was reached still issued
the request, so a superseded keystroke was paid for. And TypeScript narrowed `signal.aborted` to
false after that guard and never widened it, because control-flow analysis cannot see the signal
change mid-flight — which is exactly when a cancellation happens.

### Wave 4 closed — recorded 2026-08-09

**Done.** Tokens with their contrast enforced by test, a Tailwind theme generated from them,
then `<PrimaryAction>`, `<StopRow>`, `<AdSlot>`, marker clustering, the virtualised `<StopList>`,
`<AppMap>`, and the feedback set — `<UndoToast>`, `<StatusChip>`, `<MetricPair>`, `<Skeleton>`,
`<StateView>`. **699 tests.**

**Three real contrast failures, found by measuring rather than by looking.** The accent recorded
in [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) as "darkened to reach 4.5:1" measured 3.00:1
with a white label, and 2.80:1 against `bg` — below even the 3:1 interface threshold. `danger`
measured 4.44:1 on its own tinted background. Near enough to pass a glance; not near enough to
pass the rule. The tokens and the document are both corrected, and the document records what the
old value actually measured rather than silently showing a new hex.

**`<AppMap>` is where the facade earns itself.** `react-native-maps` is imported in exactly one
file, and the component decides nothing: clustering, route geometry, stroke style and Map ID
resolution are pure functions in `lib/map/`, tested without a renderer. What is left in the
component is driving the SDK — the one part that cannot be unit tested and the one part an Expo
upgrade breaks. That is risk C6 reduced to a single file.

**Two specification gaps the components found.** The wave-4c clusterer had no notion of
selection, while [`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md) §7 requires
that a selected stop is never folded into a cluster — the user selected it, and a map that
answers by hiding it has not answered. And the undo window had no documented duration anywhere,
so one is now decided and recorded in [`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md) rather than
invented in a component.

**The map's failure states are bounded, not blank.** Offline and load failure both say the same
thing — the stops, the order and the handoff do not depend on tiles rendering — because that is
the product's actual behaviour and it is the sentence the user needs. A missing or revoked Map ID
falls back to Google's default style rather than to a blank map, which is the mitigation risk C15
promised and which now has a test.

### Wave 5a closed — recorded 2026-08-09

**Done.** The route tree of [`10_NAVIGATION_FLOW.md`](10_NAVIGATION_FLOW.md), both guards, deep
links, restoration, the `AuthProvider` facade with its Supabase adapter, and the sign-in screen.
**749 tests.**

**The launch decision is a pure function.** `decideLaunch` takes restoration, session,
in-progress route and held deep link, and returns where to land. The ordering in it is
load-bearing — an in-progress route outranks a deep link, restoration outranks everything — and
the scenarios that matter most are the ones nobody can reproduce on a device on demand: a
notification tapped mid-delivery, a cold start with a route half driven. As a function they cost
one line each to test.

**A deep link is untrusted input, and is parsed like one.** The route id is checked against a
UUID shape before it can reach a query; query strings and fragments are dropped rather than
accepted, because nothing in this product takes a deep-link parameter and accepting one would be
an input surface added for no feature.

**Two defects the wiring found.** The session subscription has to be registered *before* the
first `currentSession()` read is awaited — a sign-in completing in the gap between them would
otherwise be missed, leaving the app on the sign-in screen holding a valid session. And
`<PrimaryAction>` was 44 pt while [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) §7
specifies 56: 44 is the floor any control must clear, 56 is what this one is, and the test that
"verified" it had asserted the floor.

**`expo-splash-screen` was not added as a dependency.** `expo-router` re-exports it, and it
already owns the splash lifecycle — a second copy of the module would race it.

### Wave 5b closed — recorded 2026-08-09

**Done.** `<RouteSheet>` with its three detents and snapping, `lib/route/plan-state.ts` for the
screen's eleven states, `<RouteSummaryHeader>`, and `<PlanView>` composing map, sheet, list,
header and action. **817 tests.**

**Snapping is a pure function, because it is the part that is wrong in most sheets.** A sheet
that only snaps to the nearest detent ignores a deliberate flick; one that only follows velocity
jumps two detents from a nudge. Both feel broken in a way nobody can describe afterwards, and
neither is visible in review. The tie case resolves to the *lower* detent: at an exact midpoint
the user has not committed, and revealing less is the recoverable mistake.

**Two native modules had to be mocked, and one of them earns more than it costs.**
`react-native-gesture-handler` had to be — the real package imports React Native's deprecated
Switch spec and the bundled codegen plugin dies parsing it, taking the whole suite with it. The
mock records the pan handlers, so a synthetic release can be delivered and the velocity sign
asserted: the gesture reports positive when the finger moves *down*, the snapping function takes
it positive when the sheet *grows*, and inverting that gives a sheet that closes when flicked
open. That now has a test rather than needing a thumb on a device. Reanimated is mocked by hand
rather than through its own `mock.js`, which loads the real entry point and pulls in the worklets
ESM build; the export that matters is `runOnJS`, which under the real implementation schedules
onto a thread Jest never drives — a gesture callback would silently never run and the test would
pass for the wrong reason.

**Animation timing stays uncovered, and both mocks say so.** The 300 ms detent budget needs
hardware ([ADR-0014](adr/0014-android-first-verification.md)).

**One inconsistency found and left standing, deliberately.** `DraftRoute`'s docblock promises
that "`entryOrder` on each stop preserves the original" order, and `Stop` in
[`types/domain.ts`](../types/domain.ts) has no such field — only `position`. The database has
both `entry_order` and `optimized_order` ([`12_DATABASE.md`](12_DATABASE.md)), so the schema is
right and the client type is short of it. Nothing can currently distinguish an order the user
typed from one an optimization produced, which is exactly what "Already the fastest order"
depends on. It is recorded rather than patched at the end of a wave: it changes a stored shape
and belongs in the same change as the query layer that reads it.

**Plan's data wiring is wave 5c, not an oversight.** `<PlanView>` is complete and tested against
every state; the screen behind it needs `stops` joined to `places_cache` for addresses — which is
the correct architecture, `place_id` being the durable key and the address arriving from the
cached places query (ADR-0007, ADR-0008). That join is a React Query hook that does not exist
yet, and faking it in the screen would have made the tests describe something the product does
not do.

### The stored shape corrected — recorded 2026-08-09

The inconsistency wave 5b recorded is fixed, and fixing it turned up a second one
underneath it.

**`Stop.entryOrder` now exists**, matching `stops.entry_order`, which the schema has always
had ([`12_DATABASE.md`](12_DATABASE.md)). `DraftRoute.isOptimized` joins it, because comparing
the current order to the entry order cannot answer the question on its own: an optimization that
changes nothing is a real and common outcome, and it has to be reported as an answer rather than
as "no optimization has happened". Every structural edit clears the flag; a relabel does not.
Setting a new origin clears it too — which stop is nearest depends on where the user starts.

**The second one: `formatted_address` is purged with the coordinates.** The schema says so —
"Google-derived, same rule" — and the purge job nulls it alongside `lat` and `lng`. So a saved
route older than thirty days arrives holding a `place_id`, the user's own label, and no address
at all. `<StopRow>` required an address string, which means that row would have rendered an
empty line. It is now nullable through the row and the list: the user's label carries the row
when there is one, and when there is not, the row says the address needs refreshing rather than
showing nothing. ADR-0007's "never assume a coordinate is present" applies to the address the
cache carried with it.

**The persisted draft is versioned and migrated.** Nothing has shipped, so no user is affected —
but a store whose shape changed and whose contents live on the device needs the migration anyway
(`CLAUDE.md` §11), and a dev build with a stored draft would otherwise sort stops by `undefined`.
The migration validates as it reads: a draft written before `entryOrder` had exactly one order,
so its positions become its entry order, and `isOptimized` is never assumed true — an old draft
cannot prove an optimization produced its order, and claiming one would put "Already the fastest
order" on a list the user typed themselves.

### The query layer — recorded 2026-08-09

`/usage-quota` gets an adapter of its own, and the three hooks the screens need exist:
allowance, place resolution, optimization. **842 tests.**

**A defect the tests found before a device could have.** The quota query fired during the
cold-start gap before the session had been read, came back unauthenticated, cached that, and left
the interface showing free allowances until something invalidated it — for a paying user, on
every launch. The fix is to say what was already true: every endpoint behind these facades is
authenticated, so `useServices()` returns null until there is a session. A client with no token
is not a usable service.

**An unmentioned limit is unknown, never zero.** `/usage-quota` returns limits by name, and the
server tunes the free tier against realised ad revenue ([ADR-0015](adr/0015-ad-supported-free-tier.md))
— so it must be able to move one number without restating the rest. Reading an absent limit as
zero would tell a paying user they had run out of something nobody had measured.

**No optimistic reorder.** The order on screen is untouched until a result arrives and not at all
if one does not. A route that rearranged itself and then failed would leave a driver holding an
order nobody chose, and "undo the optimistic update" is precisely the path that goes wrong under
the timeout that caused it.

**Quota is invalidated after a success, never decremented locally.** The server counts; a client
keeping its own tally eventually disagrees with the number the user is actually held to.

**Two test-harness lessons worth keeping.** React Query's garbage-collection timers are held for
this product's deliberately long retention — twenty-four hours, because that retention *is* the
offline story ([ADR-0008](adr/0008-offline-scope.md)) — and a test that does not clear the cache
holds the suite open long after its assertions pass. And a test that leaves a request in flight
waits out the client's own ten-second timeout. Both looked like a hanging suite and neither was.

### Plan wired to real data — recorded 2026-08-09

`buildPlanRows` performs the join the product rests on, and Plan now reads it. **857 tests.**

**Which coordinate wins is a domain rule, and it cuts both ways.** A fresh cached coordinate
beats a round trip — the map draws on the first frame instead of waiting for the network — and a
freshly resolved one beats a stale cache, because drawing a driver's route from month-old data is
the failure ADR-0007 exists to prevent. Preferring either unconditionally is wrong in a way that
only shows up on somebody's working day.

**Only expired place ids are asked about**, deduplicated. Asking for all of them on every launch
is a billed batch for data already held, and the same address twice in a day — a morning delivery
and an afternoon collection — is one lookup.

**A stop's state comes from progress, never from its stored flag.** `isCompleted` is what the
server last saw; the progress store is what happened since, including the marks made with no
signal at all.

**The draft shows a straight-line distance and no duration.** A number is more useful than a
blank, and `<RouteSummaryHeader>` labels it as an estimate — but a straight-line *time* would be
a road estimate we did not make, so there isn't one.

### Add stop — recorded 2026-08-09

The first of the three taps, and the screen where the product's largest cost line is either
controlled or not. **888 tests.**

**Most of `lib/places/search.ts` is about when *not* to ask.** Nothing below three characters,
nothing at all while offline, and recents and favourites always above search results — a reused
`place_id` is free and a search is not, so the cheapest interaction is also the one nearest the
thumb. The ordering *is* the cost decision, made visible.

**A full route is refused before the attempt**, at the *plan's* ceiling rather than the
product's. Letting a user search, choose, and only then be told the route is full wastes a billed
request and their time.

**Three cost rules meet in `usePlaceSearch`**, and each is invisible when missing: the debounce
is a spend control before it is a performance one; the session token spans the search and rotates
only after a selection, because Google bills a session as one unit and rotating per keystroke
pays per keystroke while looking identical from outside; and a superseded request is *cancelled*,
because ignoring the answer still pays for it.

It is deliberately not a React Query hook. This is a keystroke stream with a lifecycle — a token
that must not rotate mid-search and a request that must be aborted rather than resolve into a
cache nobody reads — and Query's model would fight all three.

**A stop is added with no coordinate.** The durable key is the `place_id`; the coordinate arrives
from the places query on Plan (ADR-0007). Inventing one at selection would create a coordinate
with no refresh date, which is the one thing the expiry rule cannot handle.

### The route reaches the map — recorded 2026-08-09

The optimization result is held on the draft store and Plan draws it. **893 tests.** The core
loop is now whole: add stops, optimize, see the route.

**The result is held in memory and never persisted, and that is a terms decision rather than a
storage one.** It carries Google-derived geometry — the encoded polyline and the per-leg figures
— and a client-side store has no expiry mechanism to hold it under the thirty-day rule
([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)). The server keeps it with a
purge job; here it is re-read after a cold start instead, which costs one request and removes the
question entirely. A test asserts it never reaches storage, because the field being outside
`partialize` is exactly the kind of thing a later edit undoes without noticing.

**The polyline is decoded once, on receipt, and memoised.** Decoding per render is the most
common cause of map jank in this class of app, and it is invisible until a twenty-five-stop route
meets a mid-range Android.

**A degraded result still shows no duration.** T0 produces an order, not a road time, so the
distance shown is the straight-line total and the duration stays absent rather than being
invented — the same rule the draft follows, for the same reason.

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
