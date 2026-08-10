# 03 — User Journeys

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`02_USER_PERSONAS.md`](02_USER_PERSONAS.md) · [`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md) · [`10_NAVIGATION_FLOW.md`](10_NAVIGATION_FLOW.md)

---

## 1. Purpose

This document traces the end-to-end paths users take through the product, including the paths
where things go wrong. Each journey names its trigger, its steps, the state at each step, and
every way it can terminate.

These journeys are the source for the E2E test suite in [`22_TESTING.md`](22_TESTING.md): a
journey without a test is an unverified claim.

It does not specify screens ([`08`](08_SCREEN_SPECIFICATIONS.md)) or routing between them
([`10`](10_NAVIGATION_FLOW.md)).

## 2. Goals

1. Prove the four-tap constraint (NFR-06) holds on the critical path.
2. Trace every journey through its failure branches, not only its happy path.
3. Identify the moments where a user abandons, and what prevents each.
4. Provide the specification the E2E suite is written against.

**Non-goals.** No visual design, no copy, no screen layout.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Journey correctness | Product owner | Revised against real usage data |
| Tap-count enforcement | Design | J1 is measured, not estimated |
| E2E coverage | QA | Every journey in §6 has a Maestro flow |

---

## 4. Text diagrams

### Journey map

```
                    ┌──────────────┐
     first launch → │  J0 Onboard  │ → trial started
                    └──────┬───────┘
                           ▼
    ┌──────────────────────────────────────────────┐
    │              J1  Plan and optimize           │ ◀── the four-tap path
    │   add stops → Optimize → ordered route       │
    └──────┬───────────────────────────────┬───────┘
           │                               │
           ▼                               ▼
    ┌──────────────┐               ┌───────────────┐
    │  J2  Drive   │               │  J4  Save     │
    │  handoff →   │               │  route stored │
    │  stop → next │               └───────┬───────┘
    └──────┬───────┘                       │
           ▼                               ▼
    ┌──────────────┐               ┌───────────────┐
    │ J3  Complete │               │  J5  Reuse    │
    └──────────────┘               │  from history │
                                   └───────┬───────┘
                                           └──────▶ back to J1

    Cross-cutting: J6 offline · J7 quota/entitlement · J8 import
```

### The four-tap path (NFR-06)

```
  App open  ─┬─▶  [tap 1]  Route      (the app opens on the map; the
             │              from the dock             route is one section across)
             │
             ├─▶  [tap 2]  Add stop   (repeat per stop — additions are not
             │              from address book or search      counted, they
             │                                               are the input)
             ├─▶  [tap 3]  Optimize
             │
             └─▶  [tap 4]  Start  ──▶  external navigation app
```

It was three until [ADR-0018](adr/0018-bottom-dock-navigation.md), when the stop list stopped
being a sheet dragged up from the bottom and became a dock section. The tap was added
deliberately: a tap in a place the user can see is worth more than a tap saved by a gesture
they cannot.

Adding stops is the user's input, not navigation overhead. The constraint is that **no
intermediate screen, confirmation or menu** sits between having stops and driving. Any
proposed feature adding a step here must remove one.

---

## 5. Flows

Every journey below shares one spine. The detail differs; the shape does not.

```
  enter ──▶ collect stops ──▶ optimize ──▶ inspect ──▶ hand off ──▶ progress ──▶ finish
              │                  │           │            │            │
              │                  │           │            │            └── stop marked done,
              │                  │           │            │                manually or on return
              │                  │           │            └── chunked or leg-by-leg (16)
              │                  │           └── degraded results labelled, never silent
              │                  └── tier chosen server-side; the user sees a wait, not an engine
              └── address book first, network second
```

**Every journey can terminate early, and each termination is designed.** The exits are: quota
exhausted, entitlement expired, network lost, upstream failure, no navigation app installed,
and the user simply leaving. None of them is an error dialog with an OK button; each has a
stated reason and a next action, per rule 5 of [`../CLAUDE.md`](../CLAUDE.md).

**State survives every exit.** The draft route is the user's work, and no termination path —
including process death — discards it ([`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md)).

## 6. Journeys

### J0 — Onboarding and trial start

**Trigger:** first launch.
**Persona:** all.
**Precondition:** none.

1. Value screen: one sentence and one image. What the app does, not how.
2. Sign in with Apple or Google Sign-In. *(No email/password — an extra form on first
   launch costs more users than it serves.)*
3. Location permission requested **in context**, with the reason stated: "to set your starting
   point". Denial is accepted without penalty.
4. Paywall: trial length, price after trial, renewal period and cancellation method, all
   visible without scrolling (CR-07).
5. Trial starts. The user lands on an empty plan screen with a single affordance: add a stop.

**Terminal states:** trial started (success) · paywall dismissed (see J7) · sign-in failed
(retry, with the other provider offered).

**Abandonment risk — highest in the product.** A user who has not yet seen a route reordered
is being asked for payment details on trust. Mitigations: step 1 shows the transformation
concretely; the paywall states "€0 today" as its most prominent element; steps are four, not
seven. The post-launch experiment in [`28_ROADMAP.md`](28_ROADMAP.md) tests revealing one
optimization before this screen.

---

### J1 — Plan and optimize · **the critical path**

**Trigger:** the user has stops to visit.
**Persona:** Marco, Elena.
**Precondition:** active entitlement.

1. **Origin** defaults to current location, or to the last used origin if permission was
   denied. Changeable but never blocking.
2. **Add stops** by one of:
   - address book — recents and favourites, zero network cost, shown first;
   - Places address search — submitted by a press, minimum three characters, session-tokened;
   - import — see J8.
3. The stop list appears in the Route section, in entry order, each row showing its
   ordinal.
4. **Tap Optimize.** The client sends the stop set; the server selects a tier
   ([ADR-0003](adr/0003-tiered-optimization-cascade.md)) and returns the order.
   - Progress appears after 1 s, not immediately — a spinner that flashes is worse than none.
   - Tier selection is invisible to the user. They asked for an optimized route, not an engine.
5. The route renders: polyline, numbered markers renumbered to the new order, total distance,
   total duration, arrival ETA.
6. The user may reorder manually, remove a stop, or re-optimize.

**Terminal states:** optimized route displayed (success) · degraded T0 result, labelled
(partial) · quota or entitlement block (J7) · upstream failure with the previous order intact
(failure, recoverable).

**Critical detail — never lose the previous order.** If optimization fails, the list stays
exactly as it was. A failure that also scrambles the user's manual work is unforgivable.

---

### J2 — Drive the route

**Trigger:** the user taps **Start**.
**Persona:** Marco, Elena.
**Precondition:** an optimized route.

1. First run only: choose a navigation app from those actually installed
   ([`16`](16_INTERNAL_NAVIGATION.md)). The choice is remembered.
2. The app hands off according to the provider's capability:
   - **Google Maps** — a chunk of up to ~9 stops in one handoff;
   - **Waze, Apple Maps** — one destination.
3. The user leaves the app and drives.
4. On return, the app shows the current stop with two actions: **Done** and **Skip**.
5. **Done** advances to the next stop and offers handoff again. **Skip** moves the stop to the
   end of the route without reordering the rest.
6. Repeat to the last stop.

**Terminal states:** route completed (J3) · route abandoned, resumable · app killed, state
restored on next launch (FR-36).

**Design tension.** The user returns to the app between every stop, which is the cost of
external handoff ([ADR-0004](adr/0004-external-navigation-handoff.md)). The return must
therefore be instant and land on exactly one decision — Done or Skip — with no navigation
required to reach it.

---

### J3 — Complete the route

**Trigger:** the final stop is marked Done.

1. A summary: stops completed, total distance, total time, time saved against the entry order.
2. The route moves to history.
3. One action: start a new route.

**Time saved is the retention mechanism.** "You saved 41 minutes today" is the only moment the
product proves its value numerically. It is computed as the difference between the optimized
duration and the duration of the user's original entry order, both from the same
calculation — never an estimate, because an inflated number discovered to be false destroys
trust in everything else.

---

### J4 — Save a route

**Trigger:** the user names and saves a route, or completes one.

1. Route persists with its stops, order and computed result.
2. `place_id` values persist indefinitely; coordinates carry
   `coords_refreshed_at` ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).
3. User labels and notes persist indefinitely — they are the user's content, not Google's.

---

### J5 — Reuse a saved route

**Trigger:** the user opens a route from history.
**Persona:** Marco, weekly; Elena, daily.

1. Route loads from local storage — instant, no network required for the list itself.
2. Stops whose coordinates have expired are re-resolved from `place_id`, in batch, with a
   skeleton on the affected rows only. The user is not told; it is not their problem.
3. The user edits for today: add, remove, reorder.
4. Re-optimize (J1 step 4) and drive (J2).

**This is the retention journey.** The second month is faster than the first because the
address book has grown and routes repeat. A product where week ten is as slow as week one has
no reason to be subscribed to.

---

### J6 — Working offline

**Trigger:** network lost, at any point.
**Persona:** Elena, routinely.

1. Loss is detected and shown as a persistent but unobtrusive indicator — never a dialog.
2. Available: saved routes, history, address book, current route order, last computed ETA with
   its age.
3. Unavailable, each with an explicit state rather than a spinner: address search, T1/T2
   optimization, fresh traffic.
4. Edits queue locally.
5. With ≤8 stops, T0 optimization is offered and clearly labelled degraded.
6. On reconnection: queue drains, ETA refreshes, the indicator disappears.

**Terminal states:** reconnected and synchronised · still offline with full read access ·
sync conflict, surfaced only on genuine divergence ([`11`](11_STATE_MANAGEMENT.md)).

---

### J7 — Blocked by entitlement or quota

**Trigger:** a 402 or 429 from a metered endpoint.

**Trial expired (402).** The paywall appears with a restore path. Saved routes, history, the
address book and T0 remain fully available — **the user's own data is never held hostage.**
A route in progress completes normally; only the next optimization is blocked.

**Quota exhausted (429).** The response states which limit was reached, when it resets, and
what still works. In normal use this should never fire, so every occurrence is alerted on
server-side as a probable defect rather than a user problem
([ADR-0011](adr/0011-server-side-quota-enforcement.md)).

---

### J8 — Import a list

**Trigger:** the user pastes text or selects a CSV.
**Persona:** Elena, every morning.

1. Input accepted as pasted text (one address per line) or a CSV file.
2. Addresses resolve by **Geocoding in batch**, not autocomplete — the cost difference is
   substantial ([`31`](31_COST_MODEL.md)).
3. Results split into two lists: resolved, and needing attention.
4. The user fixes or discards the failures individually. **Partial success is a success** — she
   proceeds with what worked.
5. Resolved stops append to the current route.

**Terminal states:** all resolved · partially resolved and proceeding · nothing resolved, with
the likely reason stated (wrong format, wrong country, empty input).

---

## 7. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | Trial-to-paid shapes J0 and J7 | Onboarding, blocking |
| [0003](adr/0003-tiered-optimization-cascade.md) | Tier selection is invisible in J1 | Optimization step |
| [0004](adr/0004-external-navigation-handoff.md) | J2 is handoff-based, hence the return loop | Driving |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | J5 step 2 re-hydration | Reuse |
| [0008](adr/0008-offline-scope.md) | J6 scope | Offline |

## 8. Edge cases

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|
| 1 | Optimization fails in J1 | Previous order preserved exactly; retry offered | [`15`](15_ROUTE_OPTIMIZATION.md) |
| 2 | User adds a stop while optimizing | Request cancelled; the new stop is included in a fresh optimization | [`11`](11_STATE_MANAGEMENT.md) |
| 3 | User returns from navigation without moving | Stop stays current; no false arrival | [`16`](16_INTERNAL_NAVIGATION.md) |
| 4 | All remaining stops skipped in J2 | Route completes with skipped stops recorded distinctly from completed ones | [`12`](12_DATABASE.md) |
| 5 | Trial expires between J1 and J2 | The route in progress completes; the next optimization is blocked | [`20`](20_SUBSCRIPTIONS.md) |
| 6 | Import contains 40 addresses | First 25 accepted with the limit explained; the rest offered as a second route | [`08`](08_SCREEN_SPECIFICATIONS.md) |
| 7 | Same address twice in one route | Allowed and treated as distinct stops — a legitimate case (morning and afternoon visit) | [`15`](15_ROUTE_OPTIMIZATION.md) |
| 8 | App killed during J2 | Progress restored to the next incomplete stop | [`11`](11_STATE_MANAGEMENT.md) |
| 9 | Location permission denied in J0 | Origin defaults to a searched address; no journey is blocked | [`18`](18_PERMISSIONS.md) |

## 9. Error handling

| Failure | Journey | User-facing result | Recovery |
|---|---|---|---|
| Sign-in fails | J0 | Named error; the other provider offered | Retry |
| Optimization upstream fails | J1 | One line, retry action, order preserved | Retry, or T0 |
| Address unresolvable | J1, J8 | Row flagged with the reason; others unaffected | Edit or discard |
| Navigation app missing | J2 | Provider hidden; alternatives offered | Choose another, or web link |
| Sync conflict | J6 | Both versions shown, user chooses | Explicit resolution |
| Quota exhausted | J7 | Limit, reset time, what still works | Wait, or contact support |

## 10. Best practices

1. **Never lose user input on failure.** The manual order, the stop list and typed labels
   survive every error path. This is the single most important rule in this document.
2. **Progress after 1 s, not before.** A spinner appearing and vanishing reads as a glitch.
3. **The user's own data is never blocked.** Entitlement gates new computation, never access to
   what they already created.
4. **Partial success is success.** Import, optimization and sync all proceed with what worked
   and report what did not.
5. **Every journey must survive backgrounding at every step.** The phone rings constantly in
   this context.
6. **Count the taps in J1 on every release.** It is the one number that silently degrades.

## 11. Checklist

- [ ] J1 measured at exactly four taps on a physical device.
- [ ] Every journey has a Maestro E2E flow.
- [ ] Every failure branch in §9 is tested, not only the happy path.
- [ ] Every journey survives backgrounding and process death at each step.
- [ ] J6 verified in genuine airplane mode, not a simulated offline state.
- [ ] J0 paywall verified against Guideline 3.1.2 before every submission.
- [ ] Time saved in J3 verified as a true computed difference, never an estimate.

## 12. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | J0–J8 complete | — |
| 1.1 | J2 with Live Activity progress; J8 with column mapping for CSV | Usage data |
| 1.2 | J2 with opt-in geofenced arrival | Permission acceptance measured |
| 2.0 | J0 variant revealing one optimization before the paywall | Conversion baseline established |

## 13. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Journeys defined; three-tap path fixed as J1 | Project inception | Product owner |
| 2026-08-10 | Three taps became four | The map is the opening view and the route is a dock section (ADR-0018) | Product owner |
| 2026-08-06 | Paywall placed after onboarding, before first value | Product owner decision; experiment recorded in roadmap | Product owner |

## 14. Rationale

The journeys are shaped by one asymmetry: **planning happens once, driving happens all day.**
J1 is optimised for speed because it is the gate; J2 is optimised for interruption tolerance
because it runs for hours across dozens of app switches.

The return loop in J2 is the direct consequence of
[ADR-0004](adr/0004-external-navigation-handoff.md). Since no external app accepts a full
multi-stop route, the user comes back between stops. Rather than hiding that, the design makes
the return the fastest possible interaction: one screen, two buttons, no navigation.

J5 carries the retention argument. A route planner used once is a utility; a route planner
whose second month is measurably faster than its first is a subscription. Everything about
`place_id` durability and the growing address book exists to make J5 fast.

J7's rule — never block the user's own data — is a deliberate choice against a common dark
pattern. Holding a user's saved routes hostage after a trial converts a lapsed user into a
hostile one, and the marginal revenue is not worth it.

## 15. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Paywall after the first optimization | Higher conversion; the user has seen the value | Contradicts the product owner's decision. Retained as a post-launch experiment rather than discarded. |
| Optimize automatically on adding each stop | Removes a tap; always current | Every stop addition becomes a billable call — a 12-stop route costs 12× more. Also produces a list that reorders under the user's finger. |
| Show the chosen tier to the user | Transparency; explains a slow T2 | Meaningless to the user. Only the degraded T0 case affects their decisions, and that is labelled. |
| Keep the user in-app during navigation with a WebView | Preserves session; avoids the return loop | Violates the Google Maps terms and produces a worse navigation experience than the native app. |
| Block saved routes when the trial expires | Stronger conversion pressure | Converts a lapsed user into a hostile one. The data is theirs. |
