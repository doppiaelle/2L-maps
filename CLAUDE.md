# CLAUDE.md — Project Constitution

> **This file is the authoritative source for all development in this repository.**
> Where this file conflicts with a habit, a tutorial, or a plausible-looking pattern found
> elsewhere, this file wins. Where it conflicts with an ADR in [`docs/adr/`](docs/adr/), the
> ADR wins and this file is wrong and must be corrected.

**Read before writing any code:** [`docs/00_PROJECT_OVERVIEW.md`](docs/00_PROJECT_OVERVIEW.md)
for the glossary, then the document owning the area you are changing
([`docs/INDEX.md`](docs/INDEX.md) maps areas to documents).

---

## Migration control — approved target, not current behaviour

[ADR-0030](docs/adr/0030-here-platform-and-navigation-target.md) and
[ADR-0031](docs/adr/0031-spike-before-flutter-migration.md) accept HERE and a gated Flutter
migration. [`docs/41_HERE_MIGRATION_PROGRAM.md`](docs/41_HERE_MIGRATION_PROGRAM.md) controls its
order and go/no-go evidence.

Until a migration pull request explicitly crosses a gate, the Google/Expo rules below describe the
implemented application and remain binding. For a scoped migration pull request:

1. the new ADRs override only the provider/runtime-specific rule being replaced;
2. Supabase authorization, entitlement, quota, History, RLS, validation, error, accessibility,
   safety, testing, and documentation rules remain binding;
3. server HERE credentials and the proprietary SDK package never enter this public repository;
4. the HERE SDK stays behind a Flutter interface, just as provider SDKs stay behind facades today;
5. provider-neutral internal IDs replace provider IDs at persisted domain boundaries;
6. Google location secrets and rollback code are removed only after Program Gate D;
7. Google OAuth is an authentication dependency and is not removed implicitly;
8. each program wave starts from latest `main` and uses a separate pull request.

The disposable spike is exempt from production structure only where ADR-0031 says so. It is not
exempt from credential hygiene, package licensing, two-platform evidence, or recorded measurements.
Flutter production rules are added before the rewrite begins; React Native/TypeScript conventions
must not be mechanically applied to Dart.

## 0. The five rules that must never be broken — current implementation

These are ordered by how expensive the violation is. Each is elaborated below.

1. **No Google credential in the client. None.** Every Google call goes through a Supabase
   Edge Function. → [ADR-0006](docs/adr/0006-mandatory-backend-proxy.md),
   [ADR-0021](docs/adr/0021-drawn-route-preview.md)
2. **No screen, hook or store imports a provider SDK directly.** All external SDKs sit behind
   a facade. → [ADR-0005](docs/adr/0005-map-engine-and-route-preview.md), [ADR-0012](docs/adr/0012-long-term-osm-exit-path.md)
3. **Coordinates are nullable everywhere and expire after 30 days. `place_id` is the durable
   key.** → [ADR-0007](docs/adr/0007-place-id-durable-coordinates-perishable.md)
4. **Entitlement and quota are decided server-side.** The client's RevenueCat state drives UI
   only, never access. → [ADR-0011](docs/adr/0011-server-side-quota-enforcement.md)
5. **No silent failure.** Every error path has a user-visible outcome and a next action.

A pull request violating any of these is rejected regardless of what else it does.

---

## 1. Architecture

### Layering

Dependencies point downward only. A layer never imports from a layer above it.

```
app/            Expo Router routes. Composition only — no business logic, no fetching.
  ↓
features/       Feature modules. One directory per feature; owns its screens,
                components, hooks and types.
  ↓
components/     Shared presentational components. No data fetching, no navigation.
  ↓
lib/            Facades, clients, domain logic, pure functions.
  ↓
types/          Shared types. Imports nothing.
```

**Enforcement:** an import from `lib/` into `app/` is correct; an import from `features/` into
`lib/` is a violation. If `lib/` needs something from a feature, the dependency is inverted —
the feature injects it.

### Facades are mandatory

Five external capabilities are wrapped. **No exceptions, including "just for a spike".**

| Facade | Wraps | Why |
|---|---|---|
| `<RouteCanvas>` | nothing — it draws | The preview is ours ([ADR-0021](docs/adr/0021-drawn-route-preview.md)). It wraps no SDK; what it isolates is the projection and the SVG, so `lib/map/` stays pure and testable |
| `RoutingProvider` | Routes API via Edge Function | Migration seam to Valhalla |
| `GeocodingProvider` | Places API via Edge Function | Migration seam; cost control point |
| `NavigationProvider` | External app handoff | Per-provider capability differences |
| `BillingProvider` | RevenueCat | UI only; entitlement comes from the server |

A facade exposes the product's vocabulary — stops, routes, legs, handoffs — never the
library's. If a facade method is named after an SDK method, it is a pass-through and the
facade is not doing its job.

### Business logic lives in `lib/`, as pure functions

A function that takes data and returns data belongs in `lib/` and is unit tested there.
Components render; hooks orchestrate; `lib/` decides. If a component contains an `if` about
domain rules — which tier, whether a stop is reachable, whether a coordinate is stale — that
logic is in the wrong place.

### SOLID, applied to this codebase specifically

- **Single responsibility** — a file has one reason to change. A screen that both fetches and
  formats has two.
- **Open/closed** — adding a navigation provider means adding a strategy, not editing a
  `switch` in five files.
- **Liskov** — every `NavigationProvider` implementation must be substitutable. A provider
  that cannot do chunked handoff reports that through its capability matrix; it does not throw.
- **Interface segregation** — `<RouteCanvas>` takes stops and a route, not a camera, a
  viewport or a tile source. It had all three when a map engine was underneath it.
- **Dependency inversion** — `lib/` defines the interface; the adapter implements it. `lib/`
  never imports an SDK.

---

## 2. Naming

| Kind | Convention | Example |
|---|---|---|
| Directories | `kebab-case` | `features/route-planning/` |
| React components | `PascalCase.tsx` | `StopListSheet.tsx` |
| Hooks | `camelCase.ts`, `use` prefix | `useOptimizeRoute.ts` |
| Non-component modules | `kebab-case.ts` | `tier-selection.ts` |
| Types and interfaces | `PascalCase`, no `I` prefix | `OptimizationResult` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_STOPS_T1` |
| Database tables and columns | `snake_case`, plural tables | `places_cache`, `coords_refreshed_at` |
| Edge Functions | `kebab-case` | `routes-compute` |
| Test files | mirror the source, `.test.ts` — **never under `app/`** | `tier-selection.test.ts` |

**Domain vocabulary is fixed by the glossary** in
[`docs/00_PROJECT_OVERVIEW.md`](docs/00_PROJECT_OVERVIEW.md#8-glossary). A stop is a `Stop`,
never a `Location`, `Point`, `Destination` or `Address`. Renaming a domain concept requires
updating the glossary first.

**A test file may not live under `app/`.** Expo Router compiles a `require.context` over that
whole directory, so every `.tsx` in it is a route and enters Metro's graph — a `.test.tsx` beside
a screen is a route that imports the testing library, and the release bundle dies on `console`
and `util` while Jest and `tsc` stay green. This is the layering rule in §1 with teeth: `app/` is
composition, the screen lives in `features/`, and its test lives beside the screen.
`lib/navigation/route-files.test.ts` enforces it.

**Booleans read as assertions:** `isOptimized`, `hasEntitlement`, `canChunkHandoff`. Never
`optimized`, `flag`, `check`.

**No abbreviations** except the established ones: `id`, `url`, `api`, `eta`, `lat`, `lng`.

---

## 3. TypeScript

- **`strict: true`.** Non-negotiable.
- **`any` is forbidden.** Use `unknown` and narrow. If a third-party type is wrong, write a
  local declaration with a comment explaining why.
- **No non-null assertion (`!`).** If a value may be absent, handle absence. This matters
  most for coordinates, which are genuinely nullable by design
  ([ADR-0007](docs/adr/0007-place-id-durable-coordinates-perishable.md)) — `stop.lat!` is a
  compliance bug wearing a syntax costume.
- **No type assertions (`as`)** except for parsing at a boundary, immediately after runtime
  validation.
- **Validate at every boundary.** Data from the network, from storage, from a deep link is
  `unknown` until parsed by a schema. Trusting a response shape is how production breaks
  quietly.
- **Database types are generated**, never hand-written. Regenerate after every migration.
- **Discriminated unions over optional fields.** An `OptimizationResult` is
  `{ tier: 'T0', degraded: true, … } | { tier: 'T1', … }`, not one type with six optional
  properties.

---

## 4. State

Four kinds of state, four homes. Putting state in the wrong one is the most common
architectural mistake in this stack.

| Kind | Home | Example |
|---|---|---|
| Server state | React Query | Saved routes, optimization results, entitlement |
| Global client state | Zustand | Current draft route, selected stop, sheet detent |
| Local UI state | `useState` | Whether a menu is open |
| Navigation state | Expo Router | Which screen is showing |

**Server data never goes into Zustand.** React Query owns caching, staleness, refetching and
retry. Copying a query result into a store creates a second source of truth that will
disagree with the first.

**Zustand stores are small and feature-scoped.** No single global store. A store holding
unrelated concerns is a god object.

Full specification: [`docs/11_STATE_MANAGEMENT.md`](docs/11_STATE_MANAGEMENT.md).

---

## 5. Testing policy

**A pull request without tests for changed logic does not merge.**

| Layer | Tool | Required for |
|---|---|---|
| Unit | Jest | Every function in `lib/`. Tier selection, chunking, quota, coordinate staleness, polyline decoding — all pure, all tested. |
| Component | React Native Testing Library | Every component with a state machine: loading, empty, error, degraded, offline. |
| Integration | Jest + MSW | Every hook that talks to an Edge Function, including its failure paths. |
| Contract | Jest | Every Edge Function's request/response shape against [`docs/33_API_CONTRACTS.md`](docs/33_API_CONTRACTS.md). |
| E2E | Maestro | The three journeys in [`docs/03_USER_JOURNEYS.md`](docs/03_USER_JOURNEYS.md). |

**Non-negotiable coverage**, regardless of any global percentage:

- Every tier-selection boundary — 8, 9, 25, 26 stops.
- Every error path in §0 rule 5. An untested error path is an unwritten one.
- Every handoff strategy against its capability matrix.
- Coordinate expiry and re-hydration.
- Entitlement and quota decisions, including the 402 and 429 responses.

**Never mock what you are testing.** Mock the network, mock the map, mock the clock. Do not
mock the function under test.

**A bug fix begins with a failing test** that reproduces it. No test, no fix.

Full specification: [`docs/22_TESTING.md`](docs/22_TESTING.md).

---

## 6. Performance

Budgets, measured on a mid-range Android device and an iPhone at least three generations old
— not on the newest hardware.

| Metric | Budget |
|---|---|
| Cold start to interactive | < 2.5 s |
| Stop list scroll | 60 fps, no dropped frames at 25 stops |
| Dock section transition | < 300 ms, interruptible |
| Address search pressed → suggestions | < 400 ms perceived ([ADR-0019](docs/adr/0019-explicit-address-search.md)) |
| Optimization request → result (T1) | < 3 s, with progress shown after 1 s |
| Map marker render, 25 stops | < 16 ms per frame |

Rules that keep these true:

1. **Never let a keystroke cost money.** Autocomplete is the largest COGS line
   ([`docs/31_COST_MODEL.md`](docs/31_COST_MODEL.md)), and a debounce bounds requests per
   *pause*, not per address — which made the free allowance a function of typing rhythm. Address
   search is submitted by a press ([ADR-0019](docs/adr/0019-explicit-address-search.md)). Minimum
   3 characters, minimum 300 ms between two different queries, session tokens always.
2. **Check the local address book before the network.** A reused `place_id` is free.
3. **Lists are virtualised** above 20 items.
4. **Markers are memoised** and clustered above 15.
5. **No work on the JS thread during a gesture.** Sheet and map interactions use the native
   driver or Reanimated worklets.
6. **Measure before optimising, and record the measurement** in the pull request. An
   unmeasured optimisation is a guess.

Full specification: [`docs/24_PERFORMANCE.md`](docs/24_PERFORMANCE.md).

---

## 7. UX rules

These are product constraints, not preferences. A design that violates them is rejected.

1. **Three taps maximum** from app open to an optimized route: Add a stop → choose →
   Optimize. Any new screen in that path must remove one elsewhere. It was four for one
   day, while the app opened onto a map — and an empty map orients nobody, so the tap
   spent reaching the route came back ([ADR-0022](docs/adr/0022-one-route-section.md)).
2. **One-handed operation.** Every primary control sits in the lower third. The map is for
   looking, not reaching.
3. **Navigation is a dock at the bottom**, never a sidebar, never a drawer, and never a
   gesture ([ADR-0018](docs/adr/0018-bottom-dock-navigation.md)). Three sections, always
   three, and the row never changes width — an item that moves is an item nobody learns
   ([ADR-0020](docs/adr/0020-four-section-dock.md)). The route preview is not one of them:
   it is what an optimization produces, shown inside Route
   ([ADR-0022](docs/adr/0022-one-route-section.md)). Every section stays reachable while a
   route is in progress: hiding someone's way out is not the same as protecting them.
4. **Gestures have visible alternatives.** A swipe-only action is inaccessible.
5. **Every state is designed** — loading, empty, error, offline, degraded, quota-exhausted.
   A spinner is not a loading state; a skeleton that matches the eventual layout is.
6. **Degraded results are labelled.** A T0 result never looks like a T1 result.
7. **Destructive actions are undoable**, not confirmed. A toast with undo beats a dialog.
8. **No blocking dialogs during a route.** The user is driving.

---

## 8. UI rules

1. **Tokens only.** No literal colour, spacing, radius or font size in a component. Everything
   from [`docs/07_DESIGN_SYSTEM.md`](docs/07_DESIGN_SYSTEM.md).
2. **One accent: mint.** Active route, primary action, selected marker, completed stop.
3. **Red means error or warning. Never anything else.** Not a route, not a marker, not an
   emphasis ([ADR-0009](docs/adr/0009-visual-direction.md)).
4. **Both themes are first-class.** Every component is verified in light and dark. Dark is not
   an inverted afterthought.
5. **The map is quiet.** Desaturated, receding. Content sits above it, never competes with it.
6. **Two type voices**: condensed uppercase for metrics and labels, geometric sans for
   everything else. Condensed uppercase never carries body copy.
7. **Oversized numerals** where the number is the point — ETA, distance, stop count.
8. **NativeWind for layout; StyleSheet for animated values.** Do not mix in one component.

---

## 9. Security rules

1. **No Google credential in the client at all.** The Maps SDK rendering key was the one
   exception, and it existed to let the SDK draw tiles. The route preview is drawn from our
   own geometry and there is no SDK left to authorise
   ([ADR-0021](docs/adr/0021-drawn-route-preview.md)), so the key and its restrictions are
   gone. Every Google call is a Supabase Edge Function with a server-side key.
2. **Service-account credentials live in Supabase secrets.** Never in the repository, never in
   `app.config`, never in an EAS build secret read at runtime.
3. **RLS is on for every table, with no exceptions.** A table without a policy is unreachable
   by design, not by accident.
4. **Never trust the client for authorisation.** Entitlement, quota and ownership are decided
   server-side ([ADR-0011](docs/adr/0011-server-side-quota-enforcement.md)).
5. **Validate every Edge Function input** against a schema before use.
6. **Verify webhook signatures.** An unverified RevenueCat webhook is an open door to free
   entitlement.
7. **No personal data in logs, analytics or crash reports.** No addresses, no coordinates, no
   `place_id` tied to a user. See [`docs/21_ANALYTICS.md`](docs/21_ANALYTICS.md).
8. **Secrets never enter a log line**, including in error objects that get serialised.

---

## 10. Accessibility rules

1. **Every interactive element has an accessible label**, and the label says what happens, not
   what the element is.
2. **Minimum touch target 44×44 pt.** Map markers included — the visual pin may be smaller
   than its hit area.
3. **Contrast** meets WCAG AA: 4.5:1 for text, 3:1 for interface elements, in both themes,
   including content over the map.
4. **Never colour alone.** A completed stop shows a checkmark as well as mint. A user with
   deuteranopia must be able to use this app.
5. **Dynamic Type is supported** to at least 200%; layouts reflow rather than truncate.
6. **Reduced motion is honoured**: transitions become instant, nothing depends on animation to
   be understood.
7. **Screen readers announce state changes** — optimization complete, stop marked done, quota
   reached.

Full specification: [`docs/23_ACCESSIBILITY.md`](docs/23_ACCESSIBILITY.md).

---

## 11. Git and review

### Branches

```
main                    always releasable, protected
feat/<short-slug>       new capability
fix/<short-slug>        defect
chore/<short-slug>      tooling, dependencies
docs/<short-slug>       documentation only
```

Branch from `main`, rebase onto `main`, merge by squash. No merge commits into `main`.

**Push after every meaningful unit of work.** This repository is developed in ephemeral
containers; a commit that exists only locally is work that is not saved.

### Commits

Conventional Commits, and the body explains **why**, not what — the diff already shows what.

```
feat(optimize): escalate to T2 above 25 stops

T1 caps at 25 intermediates, so larger routes silently truncated.
Tier selection now escalates and the client shows the longer-wait state.

Refs: ADR-0003
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`.

**Every commit touching a decision references its ADR.** Every commit passes lint,
typecheck and tests locally — CI is a safety net, not a substitute.

### Versioning

Semantic versioning. `MAJOR` on a breaking change to a stored data shape or an Edge Function
contract; `MINOR` on a feature; `PATCH` on a fix. Build numbers increment monotonically and
never reset. See [`docs/25_DEPLOYMENT.md`](docs/25_DEPLOYMENT.md).

### Review

A reviewer blocks on any of these:

- Violates a rule in §0.
- Business logic in a component.
- Direct SDK import outside a facade.
- Missing tests for changed logic.
- An undesigned error state.
- Hardcoded colour, spacing or size.
- A number that duplicates one already in the documentation.
- Documentation not updated when a decision changed.

Non-blocking preferences are marked `nit:` and never hold a merge.

---

## 12. Refactoring rules

1. **Refactoring commits change no behaviour.** If behaviour changes, it is not a refactor and
   the commit type is wrong.
2. **Tests exist before the refactor begins.** Refactoring untested code is rewriting it.
3. **One refactor per pull request.** A rename mixed with a behaviour change is unreviewable.
4. **The three-strike rule**: duplicate once, notice twice, abstract on the third. Premature
   abstraction costs more than duplication.
5. **Delete rather than comment out.** History is in git.
6. **No speculative generality.** Build for the requirement in front of you. The facades are
   the sole exception and they are justified in [ADR-0012](docs/adr/0012-long-term-osm-exit-path.md).

---

## 13. Rules for not breaking the project

Concrete failure modes this project is exposed to, and the rule that prevents each.

1. **Never merge a native-module change without the Android prebuild gate passing.** Risk
   C6 was the Expo SDK and `react-native-maps` drifting apart; that pair is gone, and what
   remains is `expo-location` and `react-native-svg`. The gate is the same and the iOS half
   of it still cannot run ([ADR-0014](docs/adr/0014-android-first-verification.md)), which
   is why C6 stays open rather than closed.
2. **Never assume a coordinate is present.** Handle `null` at every read
   ([ADR-0007](docs/adr/0007-place-id-durable-coordinates-perishable.md)).
3. **Never cache a coordinate beyond 30 days**, anywhere — including analytics payloads and
   crash breadcrumbs. This is a terms violation, not a bug.
4. **Never cache map tiles or bulk pre-fetch.** Prohibited by the platform terms, and now
   trivially true: nothing fetches a tile.
5. **Google-derived content is displayed on a canvas we draw, over public-domain geometry,
   and this is a known exposure.** The Maps Platform terms forbid it, per API. Both decisions
   were taken by the product owner against an explicit recommendation: the drawn preview in
   [ADR-0021](docs/adr/0021-drawn-route-preview.md), and the coastline underneath it in
   [ADR-0028](docs/adr/0028-a-coastline-under-the-route.md), which is precisely the hybrid
   [ADR-0012](docs/adr/0012-long-term-osm-exit-path.md) rejects by name. The risk they carry —
   revocation of the Maps Platform key, which stops the app for every user at once — is
   recorded as C3 and is **larger since ADR-0028**, because the drawing now looks more like a
   map. **Widening it further requires an ADR, not a commit.** What still holds without
   exception: attribution stays wherever Google-derived content appears, **no tile is ever
   fetched or cached**, nothing is requested from any map service at runtime, and the
   thirty-day coordinate rule is unaffected. Reinstating a map engine, adding roads, borders
   or place names to the drawn ground, or removing the attribution all require reopening the
   ADRs.
6. **Never add a metered call without a quota check.** Every new upstream call goes through
   the seven-step Edge Function pipeline.
7. **Never ship a paywall change without re-reading Guideline 3.1.2.** Trial disclosure is the
   most likely cause of rejection ([`docs/26_APP_STORE.md`](docs/26_APP_STORE.md)).
8. **Never widen a `LSApplicationQueriesSchemes` list casually.** iOS caps it at 50 and App
   Review questions unexplained entries.
9. **Never let a documentation number and a code constant disagree.** The constant cites the
   document; the document is the source.
10. **Never merge a red build.** A skipped or disabled test is a decision requiring an issue
    and an owner.
11. **Never write a field of an external API from memory.** `developers.google.com` is not
    reachable from the environment this code is written in, and no test here can tell whether
    Google accepts a value — a fixture states what its author believed. A value written from
    recall took address search down for every user
    ([ADR-0026](docs/adr/0026-google-tells-us-what-is-wrong.md)). Either send it and read the
    refusal, or do not send it. **And never reduce an upstream refusal to its status code:**
    the body names the field and the value, and it is the only current description of these
    APIs available from here.

---

## 14. Definition of Done

A change is done when **all** of these hold. Not most.

- [ ] Behaviour matches the specification document; if it does not, the document was updated
      first and the ADR added.
- [ ] Typecheck, lint and format pass with no suppressions.
- [ ] Unit tests for all changed logic; integration tests for changed hooks.
- [ ] Loading, empty, error, offline and degraded states implemented and tested.
- [ ] Accessible labels present; contrast verified in both themes.
- [ ] Performance budget in §6 met and measured.
- [ ] No new hardcoded values; tokens used throughout.
- [ ] No new client credential; no new unmetered upstream call.
- [ ] Analytics events for new user-facing actions, with no personal data.
- [ ] Documentation updated, including the decision log of the affected file.
- [ ] Verified on a physical **Android** device, light and dark. iOS is **unverified on
      hardware** and the box stays unticked ([ADR-0014](docs/adr/0014-android-first-verification.md)).

Full specification: [`docs/29_DEFINITION_OF_DONE.md`](docs/29_DEFINITION_OF_DONE.md).

---

## 15. When this file is not enough

- **The rule blocks something clearly correct.** Do not work around it silently. Raise it,
  decide, record an ADR, then change this file in the same pull request.
- **Two documents disagree.** The ADR wins. If no ADR covers it, that is the gap — write one.
- **A specification is missing.** Do not invent and proceed. Missing specification is a
  question for the product owner, not a decision for the implementer.
- **An external service changed.** Update [`docs/33_API_CONTRACTS.md`](docs/33_API_CONTRACTS.md)
  and [`docs/31_COST_MODEL.md`](docs/31_COST_MODEL.md) with the new value, its source and the
  date, before changing any code that depends on it.
