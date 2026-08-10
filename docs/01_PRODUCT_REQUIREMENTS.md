# 01 — Product Requirements

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) · [`04_FEATURES.md`](04_FEATURES.md) · [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md)

---

## 1. Purpose

This document states what must be true for the product to ship. It is the contract between
intent and implementation: every requirement here is testable, and a release that fails one is
not a release.

It does not describe *how* anything is built. Features are enumerated in
[`04_FEATURES.md`](04_FEATURES.md); mechanisms live in their area documents.

## 2. Goals

1. Define functional requirements that can be verified, not interpreted.
2. Define non-functional requirements with numbers rather than adjectives.
3. Fix the MVP boundary so scope creep is visible when it happens.
4. State the acceptance criteria for shipping to both stores.

**Non-goals.** No implementation detail, no screen design, no cost figures — those live in
[`08`](08_SCREEN_SPECIFICATIONS.md), [`09`](09_COMPONENT_LIBRARY.md) and
[`31`](31_COST_MODEL.md).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Requirement content and priority | Product owner | Changes require a decision-log entry |
| Verification that a requirement is met | QA, via [`22_TESTING.md`](22_TESTING.md) | Each FR maps to at least one test |
| Feasibility challenge | Architecture | Raised before acceptance, not after |
| Scope boundary enforcement | Product owner | MoSCoW below is the boundary |

---

## 4. Text diagrams

### Requirement structure

```
FR-nn   Functional requirement    what the product does
NFR-nn  Non-functional            how well it does it
CR-nn   Constraint                what it may not do — external, non-negotiable

Priority:  MUST    MVP blocker. No release without it.
           SHOULD  MVP if capacity allows; first out if not.
           COULD   Post-MVP.
           WON'T   Explicitly excluded, with the reason.
```

### The MVP boundary

```
        ┌──────────────── MUST ────────────────┐
        │  add stops · optimize · preview ·    │
        │  handoff · save · history · trial    │
        │  to paid · offline own data          │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────── SHOULD ──────────────┐
        │  list import · favourites ·          │
        │  round trip toggle · re-optimize     │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────── COULD ───────────────┐
        │  Live Activity · arrival geofence ·  │
        │  route sharing · stop notes          │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────── WON'T ───────────────┐
        │  turn-by-turn · offline maps ·       │
        │  multi-vehicle · web · dispatcher    │
        └──────────────────────────────────────┘
```

---

## 5. Flows

**How a requirement enters this document.** A requirement is not written because someone wants
the capability; it is written because a decision has been made and needs a testable statement.

```
  proposal ──▶ does it serve a persona in 02? ──no──▶ rejected, recorded in 04
                        │ yes
                        ▼
              does it contradict an ADR? ──yes──▶ ADR superseded first, or proposal dies
                        │ no
                        ▼
              stated here with an ID, a priority and a verification method
                        │
                        ▼
              test written in 22 against that verification method
                        │
                        ▼
              implemented ──▶ verified ──▶ counts toward the release
```

**How a requirement leaves.** Deletion requires the same weight as addition: the decision log
below records what was removed and why. A requirement silently dropped is a specification that
no longer describes the product, which is worse than no specification at all.

**How a conflict is settled.** Two requirements that cannot both hold are escalated to the
constraint list — a constraint is external and non-negotiable, so the requirement that survives
is the one the constraint permits. If neither is constrained, the persona in
[`02_USER_PERSONAS.md`](02_USER_PERSONAS.md) decides.

## 6. Functional requirements

### Stops

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-01 | The user can add a stop by searching an address with Google Places autocomplete | MUST | E2E, integration |
| FR-02 | The user can add a stop from their address book of previously used places | MUST | E2E |
| FR-03 | The user can set the origin to their current location or to any searched address | MUST | E2E |
| FR-04 | The user can reorder stops manually by dragging | MUST | Component, E2E |
| FR-05 | The user can remove a stop, with an undo affordance | MUST | Component |
| FR-06 | The user can label a stop with their own text, which persists indefinitely | MUST | Integration |
| FR-07 | A route accepts between 2 and 25 stops; the limit is stated before it is reached | MUST | Unit, E2E |
| FR-08 | The user can import a list of addresses from pasted text or a CSV file | SHOULD | Integration |
| FR-09 | The user can mark a place as a favourite for one-tap reuse | SHOULD | Integration |
| FR-10 | The user can attach a note to a stop | COULD | — |

### Optimization

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-11 | The user can optimize the stop order with a single action | MUST | E2E |
| FR-12 | The optimized route shows total distance, total duration and arrival ETA | MUST | E2E |
| FR-13 | Each leg shows its own distance and duration | MUST | Component |
| FR-14 | The user can choose between round trip and one way | MUST | Unit, E2E |
| FR-15 | The user can re-optimize after editing stops | MUST | E2E |
| FR-16 | Optimization is traffic-aware at the time of calculation | MUST | Integration |
| FR-17 | When optimization is degraded (tier T0), the result is visibly labelled as such | MUST | Component, E2E |
| FR-18 | A stop that cannot be reached by road is reported to the user, never silently dropped | MUST | Integration |
| FR-19 | The user can pin a stop to a fixed position, excluded from reordering | COULD | — |
| FR-20 | The user can set a time window for a stop | WON'T (MVP) | — |

### Preview and map

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-21 | The optimized route renders as a polyline over the map | MUST | Component |
| FR-22 | Each stop renders as a numbered marker reflecting its visiting order | MUST | Component |
| FR-23 | Selecting a marker highlights it and reveals its detail | MUST | Component |
| FR-24 | Markers cluster when density would make them unreadable | MUST | Component |
| FR-25 | The camera fits the whole route on load, and the user can pan and zoom freely | MUST | E2E |
| FR-26 | The map supports a light and a dark style, following the system theme | MUST | Visual |
| FR-27 | The user can toggle a traffic layer | SHOULD | Component |
| FR-28 | The user can toggle satellite imagery | COULD | — |
| FR-29 | The user can export a snapshot image of the route | COULD | — |

### Navigation handoff

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-30 | The user can start navigation to the next stop in an external app | MUST | E2E |
| FR-31 | Only navigation apps actually installed are offered | MUST | Integration |
| FR-32 | The user can set a default navigation app and change it later | MUST | E2E |
| FR-33 | When Google Maps is chosen, up to ~9 stops are passed in one handoff | MUST | Unit, integration |
| FR-34 | For providers accepting one destination, the app orchestrates stop-by-stop progression | MUST | E2E |
| FR-35 | The user can mark a stop as completed and advance to the next | MUST | E2E |
| FR-36 | Route progress survives the app being killed and restarted | MUST | Integration |
| FR-37 | A Live Activity or persistent notification shows route progress | COULD | — |
| FR-38 | Arrival is detected automatically by geofence, opt-in | COULD | — |

### Persistence

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-39 | The user can save a route and reopen it later | MUST | Integration |
| FR-40 | Completed routes appear in a history list | MUST | Integration |
| FR-41 | A route reopened after any interval is usable, re-resolving expired coordinates transparently | MUST | Integration |
| FR-42 | The user can duplicate a saved route as the basis for a new one | SHOULD | Integration |
| FR-43 | The user can delete a route and their entire account with all data | MUST | Integration |

### Account and subscription

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-44 | The user can create an account with Sign in with Apple or Google Sign-In | MUST | E2E |
| FR-45 | A 7-day free trial starts on subscribing and converts automatically unless cancelled | MUST | E2E, manual |
| FR-46 | The paywall states trial length, price after trial, renewal period and how to cancel | MUST | Manual, review checklist |
| FR-47 | The user can restore purchases on a new device | MUST | Manual |
| FR-48 | Entitlement is determined server-side; the client never grants access | MUST | Integration |
| FR-49 | Quota exhaustion states what limit was reached, when it resets, and what still works | MUST | Integration, component |

### Offline

| ID | Requirement | Priority | Verified by |
|---|---|---|---|
| FR-50 | Saved routes, history and the address book are readable without a network | MUST | Integration |
| FR-51 | Stop edits made offline are queued and synchronised on reconnection | MUST | Integration |
| FR-52 | With ≤8 stops and no network, a degraded T0 optimization is offered | MUST | Unit, integration |
| FR-53 | Surfaces requiring a network show an explicit offline state, never a blank or a spinner | MUST | Component |

---

## 7. Non-functional requirements

| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-01 | Cold start to interactive | < 2.5 s on a 3-generation-old device | Performance test |
| NFR-02 | Optimization request to result, tier T1 | < 3 s p95; progress shown after 1 s | Performance test |
| NFR-03 | Autocomplete keystroke to suggestions | < 400 ms perceived | Performance test |
| NFR-04 | Stop list scrolling at 25 stops | 60 fps, no dropped frames | Performance test |
| NFR-05 | Crash-free session rate | > 99.5% | Crashlytics |
| NFR-06 | Three taps maximum from app open to optimized route | Exactly 3 | E2E tap count |
| NFR-07 | Every primary control reachable one-handed | Lower third of the screen | Design review |
| NFR-08 | Contrast, both themes | WCAG AA: 4.5:1 text, 3:1 UI | Automated + manual |
| NFR-09 | Dynamic Type support | To 200% without truncation | Manual |
| NFR-10 | Per-user monthly API cost, target profile | < $1.50 | Usage records vs [`31`](31_COST_MODEL.md) |
| NFR-11 | Backend availability | Degrades to T0 rather than failing outright | Chaos test |
| NFR-12 | Data residency | EU region | Configuration review |

---

## 8. Constraints

External and non-negotiable. Violating any of these is a legal or platform matter, not a
trade-off.

| ID | Constraint | Source | Enforced by |
|---|---|---|---|
| CR-01 | Coordinates from Google may be cached at most 30 consecutive days | Google Maps Platform terms | [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md) |
| CR-02 | Map tiles may not be cached or bulk pre-fetched | Google Maps Platform terms | [ADR-0008](adr/0008-offline-scope.md) |
| CR-03 | **Knowingly not met.** Google Maps Content is displayed on a canvas we draw. The decision, the recommendation against it and the exposure are recorded in [ADR-0021](adr/0021-drawn-route-preview.md) | Google Maps Platform terms, per API | [ADR-0021](adr/0021-drawn-route-preview.md), [ADR-0005](adr/0005-map-engine-and-route-preview.md) |
| CR-04 | Turn-by-turn guidance requires the Navigation SDK, which cannot coexist with the Maps SDK | Google licensing and SDK conflict | [ADR-0004](adr/0004-external-navigation-handoff.md) |
| CR-05 | `optimizeWaypointOrder` supports at most 25 intermediate waypoints, and is incompatible with `TRAFFIC_AWARE_OPTIMAL` | Routes API | [ADR-0003](adr/0003-tiered-optimization-cascade.md) |
| CR-06 | Apple Maps and Waze accept a single destination per deep link | Platform URL schemes | [ADR-0004](adr/0004-external-navigation-handoff.md) |
| CR-07 | Free trial with auto-renewal must disclose terms in the purchase flow | App Store Guideline 3.1.2 | [`26_APP_STORE.md`](26_APP_STORE.md) |
| CR-08 | Auto-renewal after a free trial requires pre-contractual information and a right of withdrawal | Codice del Consumo, Dir. 2011/83/EU | [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) |
| CR-09 | Location data is personal data under GDPR | GDPR | [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) |
| CR-10 | Expo Go cannot run this app; a development build is required | Native modules | [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md) |

---

## 9. Architectural decisions

| ID | Decision | Requirements it governs |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | Single professional, 5–25 stops; trial to paid | Stop caps, entitlement, paywall |
| [0003](adr/0003-tiered-optimization-cascade.md) | Cost-aware cascade T0–T3 | Every optimization requirement |
| [0004](adr/0004-external-navigation-handoff.md) | Handoff, never in-app turn-by-turn | Navigation requirements |
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps` behind a facade | Map and preview requirements |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | `place_id` durable, coordinates perishable | Storage and re-hydration requirements |
| [0008](adr/0008-offline-scope.md) | Offline is your own data | Offline requirements |
| [0011](adr/0011-server-side-quota-enforcement.md) | Quota and entitlement server-side | Quota requirements, 402 and 429 handling |

**Decided here:** every requirement carries a verification method, and a requirement that
cannot state one is not accepted. This is what makes the document a contract rather than a wish
list — an unverifiable requirement cannot fail, and a requirement that cannot fail cannot block
a release.

## 10. Edge cases

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|
| 1 | User adds a 26th stop | Blocked with an explanation of the limit before the attempt, not after | [`08`](08_SCREEN_SPECIFICATIONS.md) |
| 2 | Two stops resolve to the same `place_id` | Allowed — a user may legitimately visit the same address twice; ordering treats them as distinct | [`15`](15_ROUTE_OPTIMIZATION.md) |
| 3 | Origin equals the single stop | Optimization is trivially complete; the app skips straight to handoff | [`15`](15_ROUTE_OPTIMIZATION.md) |
| 4 | Trial expires mid-route | The route in progress remains fully usable to completion; the next optimization is blocked | [`20`](20_SUBSCRIPTIONS.md) |
| 5 | User denies location permission | Current-location origin unavailable; a searched origin works normally | [`18`](18_PERMISSIONS.md) |
| 6 | Imported list contains unresolvable addresses | Resolved and unresolved are reported separately; the user fixes or discards the failures | [`04`](04_FEATURES.md) |
| 7 | Device clock is wrong | ETA calculations use server time, not device time | [`15`](15_ROUTE_OPTIMIZATION.md) |
| 8 | User uninstalls their only navigation app mid-route | Provider list refreshes; the web universal link remains | [`16`](16_INTERNAL_NAVIGATION.md) |

## 11. Error handling

Requirement-level principle: **a requirement is not met unless its failure path is also met.**
FR-18, FR-49 and FR-53 are requirements *about* failure, and are treated as first-class.
Endpoint-level handling is in [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md).

| Failure | Detection | User-facing result | Retry | Fallback |
|---|---|---|---|---|
| Optimization upstream fails | Edge Function | Named failure with a retry action | Bounded backoff | T0 if ≤8 stops |
| Address search unavailable | Client | Search disabled with explanation; address book still searchable | On reconnection | Local address book |
| Stop unreachable by road | Optimization response | Stop flagged in the list with a reason | No | User removes or replaces it |
| Entitlement absent | Edge Function 402 | Paywall with restore path | No | Read-only own data |
| Quota exhausted | Edge Function 429 | Limit, reset date, what still works | No | T0, saved routes |
| Handoff target missing | Client | Provider hidden; alternatives offered | No | Web universal link |

## 12. Best practices

1. **A requirement without a verification method is a wish.** Every FR names how it is checked.
2. **Numbers, not adjectives.** "Fast" is unverifiable; NFR-02 is.
3. **State the limit before the user hits it.** FR-07 and FR-49 both exist because a limit
   discovered by failure is a defect.
4. **Priority is a commitment.** Moving an item from SHOULD to MUST is a decision-log entry,
   not a quiet edit.
5. **Constraints are not requirements.** CR items cannot be traded away for scope or schedule.

## 13. Checklist

Release readiness against this document:

- [ ] Every MUST requirement implemented and verified.
- [ ] Every NFR measured on real devices, not simulators.
- [ ] Every CR demonstrably respected, with evidence for CR-01 through CR-03.
- [ ] Every edge case in §10 has a test.
- [ ] Every failure in §11 has a designed, tested state.
- [ ] No SHOULD silently promoted to MUST without a log entry.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All MUST requirements | — |
| 1.1 | Remaining SHOULD: import at scale, favourites, duplicate route | MVP shipped and stable |
| 1.2 | COULD: Live Activity, arrival geofence, notes, snapshot export | Retention data indicates demand |
| 2.0 | Time windows, pinned stops, priorities — requires tier T2 by default | Segment demand, see [`28`](28_ROADMAP.md) |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Document created; FR/NFR/CR fixed against ADR-0001…0012 | Project inception | Product owner |
| 2026-08-06 | FR-20 time windows moved to WON'T for MVP | Requires tier T2 for every optimization, multiplying COGS by stop count | Product owner |

## 16. Rationale

The requirement set is deliberately narrow. Twenty-two MUST requirements describe an app that
does one thing completely rather than five things partially — which is the only viable shape
for a product competing against free incumbents. Google Maps is free and excellent at
navigation; the only defensible position is being unambiguously better at the one thing it
refuses to do.

The non-functional requirements are weighted toward speed and one-handed use because of where
the product is used: in a vehicle, between stops, with one hand, often in sunlight, always in
a hurry. NFR-06 — exactly three taps — is the requirement most likely to be eroded by future
features, which is why it is stated as a hard number rather than a principle.

The constraints section exists because this product has an unusual number of external
non-negotiables, and because they are the requirements most likely to be violated by someone
who has not read them. Each is traced to its source so a future reader can verify it rather
than trust it.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Support 100 stops in the MVP | Serves couriers; a bigger claim in the store listing | Forces tier T2 on every large route, at ~$0.01 per stop. See [ADR-0002](adr/0002-target-segment-and-monetization.md). |
| Time windows in the MVP | The most requested constraint in route planning | Every optimization would need T2 regardless of stop count, multiplying COGS. Deferred to 2.0 with a pricing tier that supports it. |
| In-app navigation as a MUST | Owns the whole experience; stronger product | Excluded by CR-04. See [ADR-0004](adr/0004-external-navigation-handoff.md). |
| Free tier with a 5-stop limit as a MUST | Larger funnel; word of mouth | Perpetual per-user cost with no revenue. See [ADR-0002](adr/0002-target-segment-and-monetization.md). |
| No account required | Lower friction to first value | Entitlement and quota must be server-side (CR from [ADR-0011](adr/0011-server-side-quota-enforcement.md)), which requires identity. Anonymous auth with later linking is the compromise, specified in [`20`](20_SUBSCRIPTIONS.md). |
