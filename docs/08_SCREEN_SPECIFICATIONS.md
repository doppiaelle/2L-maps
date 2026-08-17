# 08 — Screen Specifications

> **UI implementation note (2026-08-12).** The current mobile design has six visual states in
> order: Login, Route, Route/Search Open, Optimized Map, History, and Settings. Route and History
> are the only bottom-dock destinations; Settings is always available from the top-right utility.
> The palette is black/white by theme with mint reserved for navigation and confirmation. Settings
> exposes Light, System, and Dark choices. Route includes a small destructive reset utility that
> clears the current draft, result and transient failure while preserving saved endpoint defaults.
> Address search remains an overlay/modal over Route so the underlying planning context is retained.

> The Optimized Map is a synthetic procedural navigation environment: real stop coordinates and
> routed polyline determine its geometry, while a deterministic, anonymous street grid and urban
> blocks are generated around that route. It never fetches or copies map tiles. Pan, pinch zoom,
> numbered stops, route-leg selection, and route emphasis are implemented by the drawn canvas.

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
2. Keep the primary action fixed in the thumb zone across every screen and section.
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
§7, the Route section in §7, and the route summary in §8. They are not collected here because a
layout separated from its states is read without the constraints that shaped it.

```
   Map  ──tap Route──▶  Route section  ──tap Start──▶  handoff
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

**How the primary action stays constant.** Across every section the primary action
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

### The Route section

Opened from the dock, full-screen above a map that stays mounted underneath
([ADR-0018](adr/0018-bottom-dock-navigation.md)). One layout, not three: what used to be
three sheet detents was three sizes of the same content, and the two smaller ones existed
only because the container could be dragged.

| Region | Contents |
|---|---|
| Top | Official logo, Settings utility, title, subtitle and address search |
| Middle | The stop list — scrollable, with remove and reorder on every row |
| Bottom | Endpoint choices, readiness card, Optimize action and the Route / History dock |

The primary action is **pinned to the bottom of the section**. Its position is learned once
and stays true, which is the property the pinned-at-every-detent rule was protecting.

### States

| State | Appearance |
|---|---|
| **Empty** | Route composition from the reference: search, compact start/end choices, empty guidance and no map or invented metrics |
| **Stops added, not optimized** | Markers in entry order. No polyline. Metrics show straight-line estimate marked as an estimate. Primary action: **Optimize** |
| **Optimizing** | Primary action becomes a progress state after 1 s. Sheet stays interactive. **The existing order remains visible and unchanged** |
| **Optimized** | Markers renumber with `motion-deliberate`. Polyline draws. Metrics update. Primary action becomes **Start** |
| **Optimized, degraded (T0)** | As above, but: dashed `warning` connectors instead of a polyline; a `warning` chip in the sheet header reading "Estimated without traffic"; the label persists into history |
| **Already optimal** | "Already the fastest order" stated positively in the header. Not silence, not an error |
| **Handed over** | Unchanged from **Optimized**. The driver left with Google Maps driving the whole sequence and comes back to what they left; Confirm hands it over again ([ADR-0027](adr/0027-the-drive-happens-elsewhere.md)). There is no per-stop state to show |
| **Offline** | Persistent unobtrusive indicator. Map shows an explicit offline state. Search disabled with a reason. T0 offered if ≤8 stops |
| **Optimization failed** | Inline error in the sheet header with retry. **The order is untouched** |
| **Quota exhausted** | Sheet header states the limit, the reset date, and what still works. Primary action disabled with an explanation, not greyed silently |
| **Loading a saved route** | Skeleton rows matching the eventual layout. Expired coordinates re-hydrate invisibly |

**Where the round starts and ends is on the list, not in a dialog.**

```
  ROUTE · 4 STOPS
  34 KM        1H 12M

  START  [ First added stop ▾ ]
  END    [ Last added stop ▾ ]
  2 of 4 stops can be reordered
```

The start menu contains **First added stop** (default) and **My current location**. The end menu
contains **Last added stop** (default), **Return to starting point** and **Return to my current
location**. Choosing the last option also selects current location as the start, producing one
unambiguous closed loop. Non-default choices persist for the next new route. They are endpoint
constraints, not ordinary draggable stop rows.

A compact reset action sits beside these controls and clears the whole current draft only after
an explicit press; it never changes the persisted defaults.

A control rather than a question in front of Optimize: it costs no tap on the three-tap path,
and `CLAUDE.md` §7 rule 8 rules out a blocking dialog before an action the driver takes in a
cab.

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
| Tap the search field | Opens the inline dropdown; Route remains visible under a dimmed blur |
| Choose **My current location** | Requests permission if needed and applies it as the route origin |

---

## 8. Other screens

### Add stop (modal)

The add-stop experience is an inline overlay over Route rather than a detached visual language.
The search field stays aligned with the reference composition and receives focus on open. Before
typing, **My current location** is the first result, followed by **Recent** and **Saved** places.
After the query no longer matches that shortcut, autocomplete results replace it. The underlying
Route page is dimmed and blurred, remains recognisable and is not interactive until dismissal.

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

### Sign in

The first screen anybody sees and the only one they cannot skip. It has no map, no dock and one
decision on it.

```
        ┌────────────────────────────┐
        │                            │   quiet end of the photograph
        │           ( logo )         │   baked graduated blur, gone by 55%
        │                            │
        │         2L Maps            │   `display`, 44
        │  Smart routes. Less time.  │   `body`, `text-secondary`
        │       More freedom.        │
        │                            │
        │      ( the interchange,    │   the picture, as photographed
        │        as photographed )   │
        │                            │
        │  ┌──────────────────────┐  │
        │  │  G  Continue with…   │  │   lower third; `radius-lg`, `elev-pill`
        │  └──────────────────────┘  │
        └────────────────────────────┘
```

**Identity at the top, the decision in the lower third, and nothing in between.** The middle of
a phone screen is both the part a one-handed grip cannot comfortably reach and the part of this
picture that has something to look at, so it carries neither.

**Apple and Google only.** No password to lose, no email to verify, and nothing for us to store:
the only identity this product keeps is the `user_id` the JWT already carries. **Apple is
offered on iOS only** — Sign in with Apple on Android is a web flow that asks for an Apple ID
password on a phone the user probably did not buy from Apple, which is worse than the
alternative sitting next to it. App Review's equivalence requirement applies where Apple's own
sheet is available, which is the platform where it is shown.

The Google button carries **Google's own mark, drawn as SVG** and never recoloured
([`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) §6). Everything else about the button is this
system's: `radius-lg`, a `surface` fill and `elev-pill`, so two providers read as one row of the
same product rather than two vendors' widgets stacked.

**The photograph is not a texture; it is the reason the labels need a scrim.** Both are
specified in [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) §6, and neither is a decoration a
component may adjust.

| State | Appearance |
|---|---|
| Initial | Logo, wordmark, tagline, provider buttons |
| Working | The pressed button dims, shows a spinner in place of its mark, and announces `busy`. Neither button starts a second attempt |
| Cancelled | Nothing. The user changed their mind, and an error for it is the app arguing with them |
| Failed | "Sign-in did not complete. Check your connection and try again." above the buttons, announced politely, with the buttons still live |
| Unavailable | "Sign-in is not available in this build." — distinct, because "check your connection" is useless advice when the provider was never compiled in |
| Holding a deep link | A line naming what survives: the route will open once signed in |
| Dynamic Type at 200% | The composition scrolls rather than truncating; the air between the two blocks collapses first |

### Import list (modal)

Paste area or file picker. After resolution, two sections: **Added** (count) and **Needs
attention** (each row with its reason and an edit action).

Partial success is presented as success: the primary action reads "Add 22 stops" while three
rows still need attention.

### Route summary — removed

There was a screen here, shown on marking the final stop, whose whole subject was a
figure it never got to display:

```
        41 MIN          ← metric-xl. The proof.
        SAVED
   12 stops · 34 km · 1h 12m
```

**Nothing ever reached it.** It was the end of J3, and J3 began with a per-stop
Done button that nobody pressed — the navigation app drives the whole route and
the driver does not return between stops
([ADR-0027](adr/0027-the-drive-happens-elsewhere.md)).

The honesty rule that governed the number is what removed it rather than
approximating it. Time saved had to be *the measured difference* between the
optimized duration and the duration of the user's own entry order
([`12_DATABASE.md`](12_DATABASE.md) `baseline_duration_s`) — never an estimate,
because an inflated number discovered to be false would destroy trust in every
other number on the screen. Measuring it honestly costs a third `computeRoutes`
request per optimization, and the product owner declined that
([`31_COST_MODEL.md`](31_COST_MODEL.md)). So there is no figure, and the finished
route shows what was actually measured: **total duration and total distance**.

### History

Rows in the third reference's rhythm: generous spacing, no dividers, final row fading. Tapping
a row loads that route into Route, ready to optimize.

**A row answers four questions, in the order a driver asks them.**

```
  Tue 11 Aug · 12 stops                        [ In progress ]
  12 stops · one way
  Corso Francia 12 → Via Meucci 3
  34 km · 1 h 12 min
```

*When* · *how big* · *where from and to* · *how far*. The third line is why this was rebuilt:
a name most routes do not have, a distance and a duration are identical across a week of
rounds, and a driver looking for last Tuesday had to open routes until they found it.

The endpoints come off `places_cache` on the same query, through the foreign key `stops` already
has to it — **no upstream call and no unit of quota**
([`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)). They are null after the thirty-day purge, and
the row then shows what it still knows rather than a placeholder that fills the space and says
nothing.

The chip appears only for `in_progress` and `completed`. `optimized` is the ordinary state of a
row in History, and a chip on every row is a chip that means nothing.

| State | Appearance |
|---|---|
| Empty | "No confirmed routes yet" — confirmation, not optimization alone, creates History |
| Loading | Skeleton rows |
| Offline | Full list — history is local |
| Sync conflict | Affected row flagged with a resolution action |

### Subscription

Opened from a standard Settings row. It compares **Free**, **Day pass** and **Pro** in the same
rounded monochrome/mint component language and identifies the current server plan. Until a store
billing provider is composed, prices are labelled provisional and purchase controls are absent or
disabled with an honest "coming soon" explanation — the screen never simulates checkout.

### Settings

Grouped so the two things users come for are immediately visible: **Navigation** and
**Subscription**. Navigation provider exists only here; no duplicate picker is shown during
handoff. Appearance and account controls follow in the same section style.

---

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0018](adr/0018-bottom-dock-navigation.md) | Navigation is a bottom dock; the stop list is a full-screen section over the map | Every screen |
| [0009](adr/0009-visual-direction.md) | Degraded results are visibly labelled | Plan header, polyline style, history rows |
| [0004](adr/0004-external-navigation-handoff.md) | Handoff replaces in-app navigation | The absence of a navigation screen |
| [0011](adr/0011-server-side-quota-enforcement.md) | Quota decided server-side | The quota-exhausted state on every metered screen |

**Decided here:** Plan is the product and everything else is a modal over it. There is no
screen the user must pass through to reach it, which is what makes the three-tap guarantee
achievable at all.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | 25 stops in the Route section | List scrolls; header and primary action stay pinned |
| 2 | Very long address | Two lines, then ellipsis; full text in stop detail |
| 3 | Dynamic Type at 200% | Rows grow; metrics drop one step; nothing truncates |
| 4 | Marker tapped while the sheet is full | Sheet drops to half so the marker is visible |
| 5 | Optimization completes while the sheet is dragging | Result applies on gesture end, never mid-gesture |
| 6 | Two stops at identical coordinates | Cluster opens a list rather than zooming further |
| 7 | Route in progress, app relaunched | Plan opens in progress mode at the correct stop |
| 8 | Import of 40 addresses | First 25 added, limit explained, remainder offered as a second route |
| 9 | All stops unreachable | Sheet states the specific cause; the map shows markers without a route |
| 10 | Trial expires while Plan is open | Paywall appears modally; the current route stays intact underneath |
| 11 | Theme changes with a section open | Tokens swap without remount; the open section is preserved |
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
- [ ] Primary action position identical whichever section is open.
- [ ] Order preserved through every optimization failure, verified by test.
- [ ] Degraded label present in header, polyline style, and history.
- [ ] Attribution visible, and never covered by the dock.
- [ ] Dynamic Type verified at 200% on Plan at 25 stops.
- [ ] Every gesture has a non-gesture equivalent.
- [ ] Paywall verified against Guideline 3.1.2.
- [ ] No screen shows a time-saved figure. It is absent rather than estimated, and
      `baseline_duration_s` stays reserved (ADR-0027).
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
| 2026-08-06 | Primary action pinned to the section bottom | Position learned once; thumb reach | Design |
| 2026-08-10 | Sheet detents replaced by dock sections | The list was behind a gesture and navigation was out of thumb reach (ADR-0018) | Product |
| 2026-08-06 | Recents and favourites before search results | Reuse is free; search is the dominant cost | Design |
| 2026-08-06 | List remains visible and unchanged during optimization | Losing the visible order on failure is the worst outcome | Design |
| 2026-08-06 | Route summary states honestly when saving is zero | An inflated number, once disbelieved, discredits every other number | Design |
| 2026-08-17 | Sign in rebuilt on a photograph: logo and wordmark at the top, the provider button in the lower third | The screen was a card in the middle of an empty background and said nothing about what the product does. The blur is baked into the asset so the first screen adds no native module | Design |
| 2026-08-17 | Sign in's implementation moved to `features/auth/SignInScreen.tsx`; the route file is a re-export | A test beside the screen under `app/` is swept into Expo Router's `require.context` and becomes a route, which put the testing library in the release bundle and turned `verify` and `android-preview` red | Engineering |

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

The route summary's honesty rule outlived the screen it was written for, and that is the
interesting part. Time saved was to be the product's only numeric proof of value, and the
temptation to compare against a deliberately bad baseline was real; the rule said compare
against the user's own entry order and admit when it was already optimal. When it turned out
that honouring the rule cost a third upstream request per optimization, the rule won and the
number went ([ADR-0027](adr/0027-the-drive-happens-elsewhere.md)). A specification that only
binds when it is cheap is not a specification.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Full-screen list separate from the map | More room; simpler layout | Breaks the connection between order and geography, which is what the user is checking |
| Clearing the list during optimization | Feels responsive; allows a richer animation | Destroys the user's visible work if the request fails |
| Primary action floating over the map | More list space; conventional FAB | Covers map content, and puts permanent furniture on a surface whose whole job is to be quiet |
| Search results before recents | Conventional search behaviour | Triples the dominant cost line and is slower for the common case of revisiting a customer |
| Silent handling of an already-optimal order | Avoids explaining a non-result | Reads as a failure. Stating it positively is the honest and reassuring option |
| Confirmation before deleting a stop | Prevents accidental loss | [`06`](06_UX_GUIDELINES.md) P8: undo protects only the user who erred, rather than taxing everyone |
