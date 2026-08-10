# 05 — Information Architecture

> **Status:** Approved
> **Owner:** Design
> **Last reviewed:** 2026-08-06
> **Related:** [`10_NAVIGATION_FLOW.md`](10_NAVIGATION_FLOW.md) · [`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md) · [ADR-0010](adr/0010-mobile-only-scope.md)

---

## 1. Purpose

This document defines how the product is organised: what its top-level destinations are, where
every piece of information lives, and why the structure is as flat as it is.

The organising decision is that **the product has one primary surface**, not a set of equal
sections. Everything else is either a mode of that surface or a place the user visits
occasionally.

## 2. Goals

1. Keep the critical path free of navigation entirely.
2. Give every piece of information exactly one home.
3. Keep depth shallow enough that no user is ever lost.
4. Make the structure survive the phase-2 features without reorganisation.

**Non-goals.** No routing mechanics ([`10`](10_NAVIGATION_FLOW.md)), no screen layouts
([`08`](08_SCREEN_SPECIFICATIONS.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Structure | This document | Changes require a decision-log entry |
| Route implementation | [`10_NAVIGATION_FLOW.md`](10_NAVIGATION_FLOW.md) | Expo Router file structure |
| Content placement | This document | One home per item, §7 |

---

## 4. Text diagrams

### Structure

```
  ROOT
   │
   ├── (auth)                     shown only when signed out
   │     └── sign-in
   │
   └── (app)
         │
         ├── PLAN  ◀══════════ the product. Opens here, always.
         │    │                A map with a sheet over it.
         │    │
         │    ├── sheet: peek | half | full   ← the stop list
         │    ├── add stop        modal
         │    ├── import list     modal
         │    ├── stop detail     sheet-within-sheet
         │    └── provider picker modal (first run)
         │
         ├── HISTORY              past and saved routes
         │    └── route detail  → opens in PLAN
         │
         └── SETTINGS             account, preferences, legal
              ├── subscription
              ├── navigation app
              └── data & privacy

  Maximum depth: 3. Most interactions happen at depth 1.
```

### Where the sections fit

The stop list is not a pushed screen. It is one of three sections of the map surface, opened
from the dock and closed back to the map ([ADR-0018](adr/0018-bottom-dock-navigation.md)).

```
  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │                 │  │                 │  │   Route         │
  │      MAP        │  │      MAP        │  ├─────────────────┤
  │                 │  │                 │  │ ① Via Roma 12   │
  │                 │  ├─────────────────┤  │ ② Via Verdi 4   │
  │                 │  │ ① Via Roma 12   │  │ ③ Corso It. 88  │
  ├─────────────────┤  │ ② Via Verdi 4   │  │ ④ …             │
  │ Route · 12 · ⌃  │  │ ③ Corso It. 88  │  │ ⑤ …             │
  │ 34 KM · 1H 12M  │  │ ④ …             │  │ …               │
  │ [   Optimize  ] │  │ [   Optimize  ] │  │ [   Optimize  ] │
  └─────────────────┘  └─────────────────┘  └─────────────────┘
        PEEK                 HALF                  FULL
   route summary        list + map both      list + per-stop
   map dominant         visible              actions

  The primary action stays pinned in the thumb zone at every
  section. Opening or closing a section never moves it.
```

---

## 5. Flows

**How a user reaches anything.** The structure is flat enough that this diagram is complete —
there is no fourth level, and adding one requires an ADR.

```
  Plan (the product)
    ├── sheet: peek ──▶ half ──▶ full        stops, in order
    │      └── stop detail                   sheet within sheet
    ├── add stop        modal                search · favourites · recents
    ├── import list     modal                paste · CSV
    └── summary         after handoff        completion, time saved

  History          saved and past routes ──▶ opens into Plan
  Settings         account · preferences · legal
```

**How new information finds its home.** The question is answered in one pass:

```
  is it about the route being planned?   ──yes──▶  Plan, in the sheet
  is it about a route already run?       ──yes──▶  History
  is it about the account or the app?    ──yes──▶  Settings
  none of the three                      ────────▶  it does not belong in the product yet
```

That last branch is the point of the structure. A place for everything is how an app grows a
fourth tab and loses the three-tap guarantee in
[`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md).

## 6. The three destinations

### Plan — the primary surface

The app opens here every time. It holds the entire critical path: add stops, optimize, preview,
start.

**It is never navigated to**, because the user is never anywhere else when they need it. Both
other destinations return here rather than layering on top.

Plan is a single surface with modes, not a stack of screens. Adding a stop opens a modal over
it; a dock section opens over the map; the route optimizes in place. Nothing pushes.

### History

Past and saved routes. A secondary destination visited deliberately, typically at the start of a
day to reuse yesterday's route ([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J5).

Opening a route from History **replaces the Plan surface** rather than pushing a detail screen.
The user wanted to work on that route, not to look at it.

### Settings

Account, subscription, navigation-app preference, data and privacy, legal. Visited rarely, and
never during a route.

Grouped so the two things users actually come here for — managing the subscription and changing
the navigation app — are immediately visible rather than buried under preferences nobody
changes.

---

## 7. Where information lives

**One home per item.** Duplication in the interface has the same failure mode as duplication in
the specification: the copies diverge.

| Information | Home | Never appears in |
|---|---|---|
| Stop order | Sheet list; marker numbers on the map | A separate ordering screen |
| Total distance and ETA | Top of the Route section | The map surface itself |
| Per-leg distance and duration | Stop row in the sheet | The map |
| Stop label and note | Stop detail | The list row (label only, truncated) |
| Degraded-result warning | Sheet header **and** map polyline style | — |
| Unreachable stop | The stop's own row, with a reason | A separate error list |
| Quota state | Settings, and inline when an action is blocked | A persistent banner |
| Subscription state | Settings → Subscription; paywall when blocking | Anywhere ambient |
| Time saved | Route completion summary | The plan surface |
| Attribution | Map surface, permanently | — |

Two items appear in two places deliberately. The **degraded warning** appears in the sheet
header and in the polyline style because a user might see either without the other. **Quota
state** appears in Settings for the curious and inline at the moment of blocking, because a
persistent banner would be noise every day to prevent a rare event.

---

## 8. Structural rules

1. **The critical path involves no navigation.** Add, optimize and start all happen on one
   surface ([`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md) P1).
2. **Maximum depth is three.** Anything deeper indicates the structure is wrong.
3. **Modals are for input, never for information.** Adding a stop is a modal; showing a route is
   not.
4. **The sheet is the only list surface.** No sidebar, no separate list screen, at any size
   ([ADR-0010](adr/0010-mobile-only-scope.md)).
5. **Opening a route replaces Plan; it never pushes a detail screen.**
6. **Settings is never reachable during a route.** The user is driving.
7. **New features extend an existing destination** or justify a fourth. There is no fourth
   today, and the bar for one is high.

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | Single professional, one vehicle | Why there is no fleet or dispatcher level |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only; the stop list is a sheet | The absence of a persistent panel at any width |

**Decided here:** three destinations, and a new one costs an existing one. The structure is
deliberately too small for what the product might become, because a hierarchy that anticipates
growth is a hierarchy the user navigates today for a feature that does not exist yet.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | App opens with a route in progress | Plan, at the current stop, in progress mode |
| 2 | App opens with no route | Plan, empty state, one affordance: add a stop |
| 3 | Deep link to a saved route | Plan with that route loaded — never History |
| 4 | Signed out | `(auth)` group; no app destination is reachable |
| 5 | Trial expired | All destinations remain reachable; only new optimization is blocked |
| 6 | Route opened from History while another is in progress | The in-progress route is offered for resumption before being replaced |
| 7 | Settings opened, subscription changed | Returning to Plan reflects the new entitlement without a reload |
| 8 | 25 stops in the Route section | The list scrolls; the header and primary action stay pinned |

## 11. Error handling

| Failure | Where it appears | Rationale |
|---|---|---|
| Optimization fails | Sheet header, inline, with retry | The user is looking at the list |
| Address search fails | Inside the add-stop modal | Local to the task |
| A stop is unreachable | That stop's row | Attached to the thing it concerns |
| Entitlement blocked | Paywall, presented modally over Plan | The user stays in context |
| Offline | Persistent unobtrusive indicator on Plan; explicit states on the surfaces that need a network | Ambient condition, not an event |
| Sync conflict | History, on the affected route | Where the user will look for it |

**Errors appear where the thing that failed lives**, never in a global error area.

## 12. Best practices

1. **Do not add a destination.** Three is enough; a fourth needs an ADR.
2. **Extend a section before adding a destination.** A section is a whole screen and absorbs most new information.
3. **Never duplicate information without a reason**, and record the reason when you do.
4. **Errors attach to their subject.**
5. **Keep the primary action pinned at the bottom of the section** so its position is learned once.
6. **Deep links land on Plan**, because that is where work happens.

## 13. Checklist

- [ ] The app opens on Plan in every launch scenario.
- [ ] The critical path requires no navigation.
- [ ] Maximum depth is three, verified across every flow.
- [ ] Each item in §7 has exactly one home, or a recorded reason for two.
- [ ] Settings is unreachable during a route.
- [ ] Deep links resolve to Plan.
- [ ] The primary action stays fixed when sections open and close.
- [ ] Errors appear attached to their subject.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Three destinations, reached from a bottom dock (ADR-0018) | — |
| 1.x | Favourites inside the add-stop modal; import as a second modal | Feature delivery |
| 1.2 | Live Activity as a system surface, not a destination | Release 1.2 |
| 2.0 | Time-window editing inside stop detail — no new destination | Gate D3 |
| 3.0 | Multi-vehicle would require restructuring | [ADR-0002](adr/0002-target-segment-and-monetization.md) |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Three destinations, Plan primary | The critical path must involve no navigation | Design |
| 2026-08-06 | Sheet as the only list surface | [ADR-0010](adr/0010-mobile-only-scope.md); thumb reach | Design |
| 2026-08-06 | History replaces Plan rather than pushing detail | The user wants to work on the route, not view it | Design |
| 2026-08-06 | Degraded warning duplicated in header and polyline | Either may be seen without the other | Design |

## 16. Rationale

The structure is flat because the product does one thing. A tab bar with five sections would
imply five equally important activities; this product has one activity and two places you
occasionally visit. Making Plan the permanent home means the user never navigates to do their
work — which is what makes three taps achievable at all.

Treating the sheet as a *mode* rather than a *screen* is the structural decision doing the most
work. A separate stop-list screen would push and pop, losing the map and forcing the user to
rebuild context each time. As a sheet, the list and the map coexist and the user's mental model
never breaks: there is one route, visible two ways simultaneously.

Replacing Plan when opening from History, instead of pushing a detail view, follows from
observing what the user is actually doing. Nobody opens yesterday's route to admire it — they
open it to run it again with today's changes. Landing them directly in the working surface
removes a step they would have taken anyway.

The one-home rule for information is a direct transfer of the single-source-of-truth principle
from the specification set. Two places showing a stop count will eventually show different
numbers, and the user will trust neither.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Tab bar with four or five sections | Familiar; scales; discoverable | Implies more top-level activities than exist, and consumes permanent thumb-zone space for navigation rather than action |
| Separate stop-list screen | More room; simpler layout; no sheet mechanics | Loses the map, breaking the connection between list order and geography — which is the thing the user is checking |
| History as the launch destination | Reuse is the common case for returning users | Adds a navigation step to the critical path for every user, every day |
| Sidebar list on larger devices | Uses the third reference's layout; more content visible | Violates thumb reach, and is excluded by [ADR-0010](adr/0010-mobile-only-scope.md) |
| Settings inside a drawer | Saves a destination; conventional | Drawer gestures conflict with map panning, and a drawer is discoverable only by accident |
| Route detail as a pushed screen from History | Conventional master-detail | Adds a step before the user reaches the surface where they can actually work |
