# 08 — Screen Specifications

> **Status:** Approved
> **Owner:** Design
> **Last reviewed:** 2026-08-06
> **Related:** [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) · [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) · [`05_INFORMATION_ARCHITECTURE.md`](05_INFORMATION_ARCHITECTURE.md)

---

## 1. Purpose

This document specifies every screen and every state it can be in. A screen is not finished
until each state listed here is implemented and tested.

Layouts are described in text and diagram rather than pixel measurements; measurements come from
the tokens in [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md).

## 2. Goals

1. Specify every state, including the ones that are easy to skip.
2. Keep the primary action fixed in the thumb zone across every screen and detent.
3. Make the optimization result legible in a glance.
4. Give every failure a designed appearance.

**Non-goals.** No component internals ([`09`](09_COMPONENT_LIBRARY.md)), no tokens
([`07`](07_DESIGN_SYSTEM.md)), no routing ([`10`](10_NAVIGATION_FLOW.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Screen states | This document | Every state enumerated |
| Component behaviour | [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) | Referenced, not restated |
| State completeness | QA | A missing state is a defect |

---

## 4. Text diagrams

Screen layouts are drawn in place, beside the state tables that govern them — the Plan layout in
§7, the sheet detents in §7, and the route summary in §8. They are not collected here because a
layout separated from its states is read without the constraints that shaped it.

```
   Plan  ──tap Route──▶  sheet detents  ──tap Start──▶  handoff
     │                    peek/half/full                   │
     │                                                     ▼
     └──tap stop──▶ stop detail                    external nav app
```

## 5. Flows

**How a screen moves between its states.** Every screen in this document implements the same
state machine; only the content differs.

```
        ┌──────────── loading ────────────┐
        │                                 │
        ▼                                 ▼
     empty ──── content arrives ────▶ populated ──── action ────▶ populated'
        ▲                                 │
        │                                 ├──▶ degraded   (labelled, never silent)
        │                                 ├──▶ offline    (capabilities reduced, stated)
        │                                 ├──▶ error      (named cause, next action)
        └───────── cleared ───────────────┴──▶ quota-exhausted (limit, reset time, what still works)
```

**A screen is not finished until every reachable state above is built and tested.** A spinner
is not the loading state; the loading state is a skeleton matching the eventual layout, so the
transition does not reflow.

**How the primary action stays constant.** Across all three sheet detents the primary action
holds its position. The sheet moves; the button does not — a control that relocates under the
thumb during a gesture is a control the user misses while driving.

## 6. Screen inventory

| Screen | Route | Purpose |
|---|---|---|
| Sign in | `(auth)/sign-in` | Apple / Google authentication |
| Paywall | `(app)/paywall` | Trial start; modal |
| **Plan** | `(app)/index` | **The product.** Map + sheet |
| Add stop | `(app)/add-stop` | Modal: search plus the address book |
| Import list | `(app)/import` | Modal: paste or CSV |
| Stop detail | sheet-within-sheet | Label, note, actions |
| Provider picker | `(app)/provider` | Modal, first run |
| Route summary | `(app)/summary` | Completion, time saved |
| History | `(app)/history` | Saved and past routes |
| Settings | `(app)/settings` | Account, preferences, legal |

---

## 7. Plan — the primary screen

### Layout

```
  ┌──────────────────────────────────────┐
  │                             ⟳ ⚙      │  ← recenter, settings
  │                                      │     small, upper area,
  │            MAP                       │     secondary only
  │      ①────②                          │
  │       ╲    ╲     mint polyline       │
  │        ③────④                        │
  │                                      │
  │  Powered by Google        ▣ traffic  │  ← attribution, never covered
  ├──────────────────────────────────────┤
  │            ▁▁▁▁                      │  ← drag handle
  │  ROUTE · 12 STOPS                    │  ← label-sm, uppercase
  │  34 KM · 1H 12M                      │  ← metric-lg, tabular
  │                                      │
  │  ┌────────────────────────────────┐  │
  │  │          Optimize              │  │  ← pinned. Never moves.
  │  └────────────────────────────────┘  │
  └──────────────────────────────────────┘
```

### Sheet detents

| Detent | Height | Contents |
|---|---|---|
| Peek | ~180 pt | Summary metrics + primary action |
| Half | ~50% | Above, plus a scrollable stop list |
| Full | ~90% | Above, plus per-stop actions and reorder handles |

The primary action is **pinned to the sheet bottom at every detent**. Changing detent never
moves it — its position is learned once and stays true.

### States

| State | Appearance |
|---|---|
| **Empty** | Map at current location. Sheet at peek: "Add your first stop". One affordance. No metrics. |
| **Stops added, not optimized** | Markers in entry order. No polyline. Metrics show straight-line estimate marked as an estimate. Primary action: **Optimize** |
| **Optimizing** | Primary action becomes a progress state after 1 s. Sheet stays interactive. **The existing order remains visible and unchanged** |
| **Optimized** | Markers renumber with `motion-deliberate`. Polyline draws. Metrics update. Primary action becomes **Start** |
| **Optimized, degraded (T0)** | As above, but: dashed `warning` connectors instead of a polyline; a `warning` chip in the sheet header reading "Estimated without traffic"; the label persists into history |
| **Already optimal** | "Already the fastest order" stated positively in the header. Not silence, not an error |
| **In progress** | Sheet at peek showing the current stop. Two actions: **Done** and **Skip**. Completed stops mint with checkmarks |
| **Offline** | Persistent unobtrusive indicator. Map shows an explicit offline state. Search disabled with a reason. T0 offered if ≤8 stops |
| **Optimization failed** | Inline error in the sheet header with retry. **The order is untouched** |
| **Quota exhausted** | Sheet header states the limit, the reset date, and what still works. Primary action disabled with an explanation, not greyed silently |
| **Loading a saved route** | Skeleton rows matching the eventual layout. Expired coordinates re-hydrate invisibly |

### Interaction

| Action | Result |
|---|---|
| Tap a marker | Selects it; the sheet scrolls to that row; the row highlights |
| Tap a row | Selects the marker; the camera eases to it |
| Long-press a row, drag | Reorder. Marker numbers update live |
| Swipe a row left | Delete with undo. **Also available in stop detail** — gestures never gate |
| Drag the sheet | Detent change, interruptible, gesture-driven |
| Pan or zoom the map | Camera stops following; **Recenter** appears |
| Tap **Optimize** | Optimization begins. Order preserved throughout |
| Tap **Start** | Handoff, or provider picker on first run |

---

## 8. Other screens

### Add stop (modal)

Search field focused on open. Below it, in priority order: **Recent**, then **Saved**, then
autocomplete results once three characters are typed.

Recent and Saved come first because reuse is free and search costs money
([`31_COST_MODEL.md`](31_COST_MODEL.md)) — the cheapest interaction is also the fastest.

**They are two sections of one address book, not two stores.**
[`12_DATABASE.md`](12_DATABASE.md) has a single `favourites` table — "the address book" — with
`use_count`, `last_used_at` and an index built for exactly this query. The split is derived, not
stored: **Recent** is what was used inside the coordinate window, **Saved** is everything older.
An earlier version of this document described them as separate lists, which would have given the
same address two places to live and two counts to disagree about.

The window is the same 30 days as [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md).
That is not a coupling — past it the coordinates for that place have been purged anyway, so the
sections also happen to divide "instant" from "may need one lookup".

**Every added stop is recorded, including one found by search.** A book that only remembers what
was already in it never fills, and a place found by search is the one most worth remembering: it
has just cost the most it ever will.

An entry whose coordinates have been purged and that the user never named has nothing readable
left, so it is not offered — and not deleted. The `place_id` is durable; the next resolution of
that place refills the cache and the row returns with its street on it.

| State | Appearance |
|---|---|
| Initial | Recent and Saved. No network call has been made |
| Typing, under 3 characters | Recent and Saved still shown, narrowed locally. No request |
| Searching | Skeleton rows below the existing list, which stays visible |
| Results | Primary text bold, secondary text in `text-secondary`, matching the third reference's row rhythm |
| No results | "No match" plus an option to add the text as a manual label |
| Offline | Search disabled with a reason; the address book remains searchable locally |
| At 25 stops | Adding is blocked **before the attempt**, with the limit explained |

### Import list (modal)

Paste area or file picker. After resolution, two sections: **Added** (count) and **Needs
attention** (each row with its reason and an edit action).

Partial success is presented as success: the primary action reads "Add 22 stops" while three
rows still need attention.

### Route summary

Shown on completing the final stop.

```
  ┌──────────────────────────────┐
  │                              │
  │        41 MIN                │  ← metric-xl. The proof.
  │        SAVED                 │  ← label-sm
  │                              │
  │   12 stops · 34 km · 1h 12m  │  ← caption
  │                              │
  │  ┌────────────────────────┐  │
  │  │      New route         │  │
  │  └────────────────────────┘  │
  └──────────────────────────────┘
```

Time saved is the measured difference between the optimized duration and the duration of the
user's original entry order ([`12_DATABASE.md`](12_DATABASE.md) `baseline_duration_s`). **If the
saving is zero or negative, the screen says so honestly** and shows the totals instead — an
inflated number discovered to be false would destroy trust in every other number.

### History

Rows in the third reference's rhythm: ordinal-style badge, route name, `date · stops · distance`
meta line, generous spacing, no dividers, final row fading. Tapping a row replaces Plan with
that route.

| State | Appearance |
|---|---|
| Empty | "Your completed routes appear here" |
| Loading | Skeleton rows |
| Offline | Full list — history is local |
| Sync conflict | Affected row flagged with a resolution action |

### Paywall

The highest-risk screen in the product ([`26_APP_STORE.md`](26_APP_STORE.md)). Above the fold,
without scrolling:

- what the trial gives and for how long;
- **the price after the trial and the renewal period**;
- how to cancel;
- the subscribe action;
- restore purchases;
- links to terms and privacy.

Guideline 3.1.2 compliance is verified before every submission. Exact copy in
[`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md).

### Settings

Grouped so the two things users come for are immediately visible: **Subscription** and
**Navigation app**. Then account, data and privacy (export, delete), legal, and version.

---

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0010](adr/0010-mobile-only-scope.md) | The stop list is a bottom sheet with detents, never a sidebar | Plan, and every screen that lists stops |
| [0009](adr/0009-visual-direction.md) | Degraded results are visibly labelled | Plan header, polyline style, history rows |
| [0004](adr/0004-external-navigation-handoff.md) | Handoff replaces in-app navigation | The absence of a navigation screen |
| [0011](adr/0011-server-side-quota-enforcement.md) | Quota decided server-side | The quota-exhausted state on every metered screen |

**Decided here:** Plan is the product and everything else is a modal over it. There is no
screen the user must pass through to reach it, which is what makes the three-tap guarantee
achievable at all.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | 25 stops at the full detent | List scrolls; header and primary action stay pinned |
| 2 | Very long address | Two lines, then ellipsis; full text in stop detail |
| 3 | Dynamic Type at 200% | Rows grow; metrics drop one step; nothing truncates |
| 4 | Marker tapped while the sheet is full | Sheet drops to half so the marker is visible |
| 5 | Optimization completes while the sheet is dragging | Result applies on gesture end, never mid-gesture |
| 6 | Two stops at identical coordinates | Cluster opens a list rather than zooming further |
| 7 | Route in progress, app relaunched | Plan opens in progress mode at the correct stop |
| 8 | Import of 40 addresses | First 25 added, limit explained, remainder offered as a second route |
| 9 | All stops unreachable | Sheet states the specific cause; the map shows markers without a route |
| 10 | Trial expires while Plan is open | Paywall appears modally; the current route stays intact underneath |
| 11 | Theme changes with the sheet open | Tokens swap without remount; detent preserved |
| 12 | Recenter tapped with no location permission | Camera fits the route instead; no error |

## 11. Error handling

| Failure | Screen | Presentation |
|---|---|---|
| Optimization failed | Plan | Inline in the sheet header, retry action, **order preserved** |
| Search failed | Add stop | Inline in the modal; recents still usable |
| Import partly failed | Import | Two sections; proceed with what worked |
| Quota exhausted | Plan | Header states limit, reset, alternatives |
| No entitlement | Any | Paywall modally; context preserved beneath |
| Map failed to load | Plan | Explicit map error state; **the sheet remains fully functional** |
| Handoff failed | Plan | Non-blocking bottom surface with alternatives |
| Sync conflict | History | Row-level flag with a resolution action |

## 12. Best practices

1. **Pin the primary action.** Its position is learned once.
2. **Never mutate the list during optimization.** The user must see their order the whole time.
3. **Skeletons match the eventual layout**; no bare spinners; progress after 1 s.
4. **Recents before search**, always — cheapest and fastest coincide.
5. **State limits before they are reached.**
6. **Errors attach to their subject**, never to a global banner.
7. **The sheet must work when the map fails.** The list is the product.

## 13. Checklist

- [ ] Every state in §7 and §8 implemented and tested.
- [ ] Primary action position identical across all three detents.
- [ ] Order preserved through every optimization failure, verified by test.
- [ ] Degraded label present in header, polyline style, and history.
- [ ] Attribution visible at every detent.
- [ ] Dynamic Type verified at 200% on Plan at 25 stops.
- [ ] Every gesture has a non-gesture equivalent.
- [ ] Paywall verified against Guideline 3.1.2.
- [ ] Time saved verified as a true measurement, including the zero case.
- [ ] Plan verified functional with the map failed.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All screens and states above | — |
| 1.1 | Import with CSV column mapping; favourites management | Feature delivery |
| 1.2 | Live Activity surface; stop notes in detail | Release 1.2 |
| 2.0 | Time-window editing in stop detail | Gate D3 |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Primary action pinned across detents | Position learned once; thumb reach | Design |
| 2026-08-06 | Recents and favourites before search results | Reuse is free; search is the dominant cost | Design |
| 2026-08-06 | List remains visible and unchanged during optimization | Losing the visible order on failure is the worst outcome | Design |
| 2026-08-06 | Route summary states honestly when saving is zero | An inflated number, once disbelieved, discredits every other number | Design |

## 16. Rationale

Plan carries almost the entire product, which is why it has eleven specified states while every
other screen has four or five. The states that matter most are the unglamorous ones — degraded,
offline, quota-exhausted, failed — because they are the moments a user decides whether the app
is trustworthy.

Keeping the list visible and unchanged during optimization is a deliberate constraint that
costs a more impressive animation. An interface that clears the list and shows a spinner looks
more responsive, and destroys the user's work if the request fails. The list stays; only the
action changes.

Recents before search is a cost decision wearing an interaction-design costume. Because the
address book is free and search is the dominant COGS line, the ordering that saves money is
also the ordering that saves the user time. That alignment is rare and worth exploiting.

The route summary's honesty rule matters more than it appears. Time saved is the product's only
numeric proof of value, and the temptation to compare against a deliberately bad baseline is
real. Comparing against the user's own entry order — and admitting when it was already optimal —
is what makes the number believable the other ninety percent of the time.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Full-screen list separate from the map | More room; simpler layout | Breaks the connection between order and geography, which is what the user is checking |
| Clearing the list during optimization | Feels responsive; allows a richer animation | Destroys the user's visible work if the request fails |
| Primary action floating over the map | More list space; conventional FAB | Position shifts with detent, and it covers map content at the peek detent |
| Search results before recents | Conventional search behaviour | Triples the dominant cost line and is slower for the common case of revisiting a customer |
| Silent handling of an already-optimal order | Avoids explaining a non-result | Reads as a failure. Stating it positively is the honest and reassuring option |
| Confirmation before deleting a stop | Prevents accidental loss | [`06`](06_UX_GUIDELINES.md) P8: undo protects only the user who erred, rather than taxing everyone |
