# 09 — Component Library

> **Status:** Approved
> **Owner:** Design + Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) · [`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md) · [`23_ACCESSIBILITY.md`](23_ACCESSIBILITY.md)

---

## 1. Purpose

This document specifies every shared component: what it is responsible for, the states it must
implement, its animation, accessibility, performance characteristics, interactions, and its
error and loading behaviour.

A component is not finished until every state listed for it exists and is tested.

## 2. Goals

1. Give each component one responsibility and a complete state list.
2. Isolate the fragile native dependency behind `<AppMap>`.
3. Guarantee accessibility at the component level rather than retrofitting per screen.
4. Meet the performance budgets in [`24_PERFORMANCE.md`](24_PERFORMANCE.md) at 25 stops.

**Non-goals.** No tokens ([`07`](07_DESIGN_SYSTEM.md)), no screen composition
([`08`](08_SCREEN_SPECIFICATIONS.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Component contracts | This document | Props in product vocabulary |
| Token consumption | Components | Tokens only; literals are review-blocking |
| Facade boundary | `<AppMap>` | The sole importer of `react-native-maps` |

---

## 4. Text diagrams

### Component hierarchy

```
  Plan screen
   ├── <AppMap>                    ← facade. The only SDK importer.
   │    ├── <StopMarker>           numbered, stateful
   │    ├── <ClusterMarker>        count, above 15 markers
   │    ├── <RoutePolyline>        solid mint, or dashed for T0
   │    └── <MapAttribution>       never covered, ever
   │
   ├── <SectionPanel>              full-screen, above the map
   │    ├── <RouteSummaryHeader>   metrics + status chips
   │    ├── <StopList>             virtualised
   │    │    └── <StopRow>         badge · label · meta · remove · reorder
   │    └── <PrimaryAction>        pinned to the section bottom
   │
   └── <Dock>                      three sections + close

  Shared
   ├── <Skeleton>          matches its eventual layout
   ├── <StateView>         empty · error · offline · blocked
   ├── <UndoToast>         destructive action recovery
   ├── <MetricPair>        oversized numeral + uppercase label
   └── <StatusChip>        degraded · offline · stale
```

---

## 5. Flows

**How a component is added.** The library grows on the third occurrence, never the first —
premature abstraction costs more than duplication ([`../CLAUDE.md`](../CLAUDE.md) §12).

```
  a pattern appears once   ──▶  build it locally in the feature
  it appears twice         ──▶  note it; still local
  it appears a third time  ──▶  extract to components/, with every state
                                     │
                                     ▼
                          tokens only, no fetching, no navigation
                                     │
                                     ▼
                          state tests + accessibility labels + contrast in both themes
```

**How a component receives data.** Components render and never fetch. Data arrives as props
from a hook; a component that calls React Query directly has taken on a second reason to
change and is refactored ([`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md)).

**How a component fails.** Each component owns its own error and empty states rather than
delegating to a page-level banner. An error attached to its subject tells the user which thing
broke; a global banner tells them only that something did.

## 6. Map components

### `<AppMap>`

**Responsibility:** render the map and everything on it. **The only module in the codebase that
imports `react-native-maps`** ([`../CLAUDE.md`](../CLAUDE.md) §0 rule 2).

Props are expressed in product vocabulary — `stops`, `route`, `selectedStopId`, `theme`,
`layers` — never in library vocabulary. If a prop is named after a library concept, the facade
is leaking.

| Concern | Specification |
|---|---|
| **States** | loading · ready · offline · failed · degraded route |
| **Animation** | Camera eases with `motion-standard`. Marker reorder uses `motion-deliberate` — the product's proof moment |
| **Accessibility** | The map is one accessibility element with a summary label ("Route map, 12 stops"). Individual markers are **not** traversable; the stop list is the accessible equivalent |
| **Performance** | Markers memoised by id and state. Polyline decoded once at receipt and memoised. Clustering above 15. 60 fps at 25 markers |
| **Interaction** | Marker tap selects · map tap deselects · pan/zoom stops camera following |
| **Errors** | Failure shows an explicit state; **the sheet remains fully functional** |
| **Loading** | Neutral surface at `bg`, never a grey void |

### `<StopMarker>`

| State | Appearance |
|---|---|
| Pending | `surface` fill, `text-primary` border, ordinal number |
| Selected | `accent` fill, enlarged, raised z-index, always rendered outside its cluster |
| Completed | `accent` fill with a **checkmark** |
| Unreachable | `surface` fill, `danger` border, warning glyph |
| Origin | Filled dot, no number, visually distinct |

**Never colour alone** — every state carries a shape or glyph difference. Hit area is 44×44 pt
regardless of the pin's drawn size.

### `<RoutePolyline>`

Solid mint with a dark casing in light theme; dashed `warning` straight connectors for a T0
result. The dashed form is a correctness requirement: a smooth road-shaped line would imply road
routing that did not happen ([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)).

### `<MapAttribution>`

Always visible, never covered by the dock, never dismissible. A terms obligation
([`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md)).

---

## 7. Navigation components

### `<Dock>`

**Responsibility:** the app's navigation, and the only one
([ADR-0018](adr/0018-bottom-dock-navigation.md)). Three sections plus a close control that
appears only when one is open.

| Concern | Specification |
|---|---|
| **States** | Nothing open (three items) · a section open (four, including close) |
| **Animation** | None of its own. The section it opens animates; the dock does not move |
| **Accessibility** | `tablist` / `tab`, with `selected` announced. Every label says what happens, not what the control is |
| **Performance** | No gesture, no shared values, nothing on the JS thread |
| **Interaction** | Tap an item to open · tap the open item to close · tap the close control |
| **Errors** | None reachable: it renders what `lib/ui/dock.ts` decided |
| **Loading** | Never loads. It is present from the first frame |

Every section stays reachable **while a route is in progress**. The controls this replaced
hid themselves mid-route, which removed the driver's way out rather than protecting them.

### `<SectionPanel>`

**Responsibility:** hold one section full-screen above the map.

| Concern | Specification |
|---|---|
| **States** | One. It is a container |
| **Animation** | < 300 ms, instant under reduced motion |
| **Accessibility** | `accessibilityViewIsModal`, so the map behind is not traversable |
| **Performance** | The map stays mounted underneath; closing costs no tile fetch |
| **Interaction** | None of its own — closed from the dock |

**It stops above the dock**, never edge to edge, or it would cover the control it is closed
by. The primary action inside it is pinned to the section's bottom and never moves.

### `<StopRow>`

The third reference's row rhythm, translated: the brand avatar becomes the ordinal badge.

```
  ┌──────────────────────────────────────────────┐
  │  ⑶   Farmacia Centrale              ⠿        │
  │      Via Roma 12, Bergamo                    │
  │      2.4 KM · 8 MIN                          │
  └──────────────────────────────────────────────┘
     │    │                                  │
   badge  label (user's, or address)      drag handle
          address in text-secondary
          meta in label-sm uppercase
```

| Concern | Specification |
|---|---|
| **States** | pending · selected · completed · skipped · unreachable · dragging · re-hydrating |
| **Animation** | Reorder uses `motion-deliberate`, synchronised with marker renumbering. Selection uses `motion-quick` |
| **Accessibility** | One element with a composed label: "Stop 3, Farmacia Centrale, Via Roma 12, 2.4 kilometres, 8 minutes". Actions exposed as accessibility actions, not gesture-only |
| **Performance** | Memoised by id and state. Fixed height per Dynamic Type size so the list can virtualise |
| **Interaction** | Tap selects · long-press drags · swipe deletes with undo · **every action also available in stop detail** |
| **Errors** | Unreachable shows a reason inline. Re-hydration failure shows a re-select action, **preserving the user's label** |
| **Loading** | Skeleton with the same height, preventing layout shift |

No dividers between rows — separation is by `list-row-gap`, per the reference.

### `<StopList>`

Virtualised above 20 rows. Maintains scroll position while a section stays open. Scrolls to the
selected row when a marker is tapped. Reordering updates marker numbers **live during the drag**,
not on release — the feedback is the point.

### `<RouteSummaryHeader>`

Oversized numerals with uppercase labels, from the first reference.

```
  ROUTE · 12 STOPS                 ← label-sm, text-secondary
  34 KM · 1H 12M                   ← metric-lg, tabular, text-primary
  [ ⚠ Estimated without traffic ]  ← StatusChip, only when degraded
```

Tabular numerals prevent layout shift as an ETA updates.

### `<PrimaryAction>`

| Route state | Label |
|---|---|
| Empty | Hidden |
| One stop | Hidden — nothing to optimize |
| Stops added | **Optimize** |
| Optimizing | Progress state, after 1 s |
| Optimized | **Start** |
| Over the canvas | **Confirm** as a pill: floating on a drawing rather than closing a column, so it takes the width of its own label and a soft shadow. Still 56 pt tall ([ADR-0027](adr/0027-the-drive-happens-elsewhere.md)) |
| Blocked | Disabled **with a visible reason** — never silently greyed |

Minimum height 56 pt; full width within `screen-padding`; `radius-lg`.

---

## 8. Shared components

### `<StateView>`

One component for every non-content state: empty, error, offline, quota-blocked,
entitlement-blocked.

**Every instance requires an action.** A `<StateView>` without one fails a prop-level check —
this is how [`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md)'s "no error without a next action" rule
is enforced mechanically rather than by review.

### `<Skeleton>`

Matches the layout it replaces, dimensions included. A skeleton that differs from the real
content causes layout shift, which is worse than a spinner. Respects Reduce Motion by dropping
the shimmer.

### `<UndoToast>`

Appears after every destructive action. Non-blocking, thumb-zone positioned, auto-dismissing.

**The timer pauses while the app is backgrounded** and resumes on return — otherwise an
interruption silently consumes the undo window, which is exactly when the user most needs it.

### `<MetricPair>` and `<StatusChip>`

`<MetricPair>` is the oversized-numeral-plus-uppercase-label unit from the first reference, with
tabular figures. `<StatusChip>` carries degraded, offline and stale-ETA states — always with a
glyph as well as colour.

---

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps` sits behind an `<AppMap>` facade | Every map component |
| [0009](adr/0009-visual-direction.md) | Tokens only; single mint accent; red for alerts | Every component |
| [0018](adr/0018-bottom-dock-navigation.md) | Dock with sections | Navigation components |
| [0012](adr/0012-long-term-osm-exit-path.md) | Provider-agnostic seams | Why map components take product types, not SDK types |

**Decided here:** components expose the product's vocabulary — stops, legs, sections — never the
SDK's. A prop named after a `react-native-maps` concept is a leak that makes
[ADR-0012](adr/0012-long-term-osm-exit-path.md) unaffordable later.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | 25 rows in an open section | Virtualised; 60 fps maintained |
| 2 | Dynamic Type at 200% | Row height grows; virtualisation recalculates; no truncation |
| 3 | Reorder during optimization | Blocked with an explanation; the request is not silently discarded |
| 4 | Marker tapped while the sheet is full | Sheet drops to half; the row scrolls into view |
| 5 | Dock tapped during a section animation | The new section takes over; the animation is interruptible |
| 6 | Undo tapped after the row is gone from view | List scrolls to the restored row |
| 7 | Very long user label | Two lines then ellipsis; full text in stop detail |
| 8 | Two rows re-hydrating simultaneously | Both show skeletons; the rest of the list stays interactive |
| 9 | Screen reader traversing the map | Map is one element; the list is the traversable equivalent |
| 10 | Reduce Motion enabled | Reorder is instant but the number change is still perceptible |

## 11. Error handling

| Component | Failure | Presentation | Fallback |
|---|---|---|---|
| `<AppMap>` | SDK init failure | Explicit state with retry | **Sheet stays fully functional** |
| `<AppMap>` | Polyline decode failure | Markers only; logged as a defect | Markers |
| `<StopRow>` | Re-hydration failure | Inline re-select action; **label preserved** | User re-selects |
| `<RouteSheet>` | Optimization failure | Header error with retry; **order untouched** | Previous order |
| `<PrimaryAction>` | Blocked | Disabled with a stated reason | Alternative action offered |
| `<StopList>` | Empty after a filter | `<StateView>` with a clear action | — |

## 12. Best practices

1. **Tokens only.** A literal value is review-blocking.
2. **Memoise markers and rows** by id and state.
3. **No JS-thread work during gestures.**
4. **Every gesture action is also a non-gesture action.**
5. **Skeletons match real dimensions.**
6. **Never colour alone** for any state.
7. **Compose accessibility labels once, at the row**, rather than exposing four sub-elements.
8. **`<StateView>` always carries an action.**

## 13. Checklist

Ticked boxes are enforced by a test or a lint rule; unticked ones need hardware
([ADR-0014](adr/0014-android-first-verification.md)) or a screen that does not exist yet.

- [x] `<AppMap>` is the only importer of `react-native-maps`. — lint rule, `eslint.config.js`
- [x] Every component implements every state listed for it. — one test per state
- [x] Markers and rows memoised — `getItemLayout` supplied, `tracksViewChanges` disabled.
      **60 fps at 25 stops is unverified**: it needs the physical device.
- [ ] Gestures run on the native driver; verified with the JS thread deliberately blocked.
- [ ] Every gesture action available without the gesture. — awaits the sheet
- [x] Accessibility labels composed at the row rather than per sub-element.
      **VoiceOver and TalkBack are unverified**: they need hardware.
- [x] Touch targets ≥ 44 pt including map markers. — asserted in `AppMap.test.tsx`
- [x] Skeleton dimensions match real content. — the skeleton takes the row height
- [x] Undo timer pauses on background. — `lib/ui/undo-window.test.ts`
- [x] Reduce Motion honoured by every animated component. — `<Skeleton>`, `<AppMap>` camera
- [x] No literal design values anywhere. — the Tailwind theme is generated from the tokens

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Every component above | — |
| 1.1 | `<ImportRow>` with an error-reason variant | Import feature |
| 1.2 | `<LiveActivityCard>`; `<NoteEditor>` | Release 1.2 |
| 2.0 | `<TimeWindowPicker>` in stop detail | Gate D3 |
| 3.0 | `<AppMap>` MapLibre adapter behind the same contract | [ADR-0012](adr/0012-long-term-osm-exit-path.md) |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | `<AppMap>` established as the sole SDK importer | Contains risk C6; enables E2E mocking | Architecture |
| 2026-08-06 | Map is a single accessibility element | Traversing 25 markers is a worse experience than the equivalent list | Design |
| 2026-08-06 | `<StateView>` requires an action prop | Enforces the no-dead-end rule mechanically | Design |
| 2026-08-06 | Undo timer pauses on background | An interruption otherwise consumes the window silently | Design |
| 2026-08-06 | Marker numbers update live during a drag | The feedback is the purpose of the interaction | Design |
| 2026-08-09 | The selected marker is held out of clustering entirely, not extracted afterwards | Otherwise it can be the marker that keeps a cell above one and forces a cluster to exist around it | Implementation |
| 2026-08-09 | A T0 route draws one dashed segment per pair, not one dashed path | A single path joins at the stops and reads as continuous, which is the impression a degraded result must not give | Implementation |
| 2026-08-09 | An undecodable road polyline draws markers only, never connectors | Connectors are how a degraded result is shown; using them here would relabel a road route as T0 | Implementation |

## 16. Rationale

Components are specified state-first rather than appearance-first because the states are what
gets skipped. Every developer builds the success state; error, offline, degraded and blocked
states are the ones that quietly never appear until a user finds them. Listing them in the
component contract makes their absence a review finding rather than a discovery.

`<AppMap>` earns its indirection through risk C6 rather than through architectural taste.
`react-native-maps` has current breakage against recent Expo SDKs and no viable substitute —
`expo-maps` renders Apple Maps on iOS, which the terms forbid for Google content, and the
Navigation SDK cannot coexist with the Maps SDK. Being locked to a fragile dependency with no
escape makes containment worth its cost, and the facade also makes the map mockable, which is
the difference between having E2E tests and not.

Treating the map as one accessibility element is a deliberate departure from the instinct to
expose everything. Twenty-five individually traversable markers is a hostile experience for a
screen-reader user; the stop list presents identical information in a linear order that
navigates naturally. Accessibility is served by the better equivalent, not by more elements.

The `<StateView>` action requirement is the clearest example of encoding a principle in a type
signature. "Never leave a dead end" is a rule people forget under deadline pressure; a required
prop is a rule the compiler remembers.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Direct `react-native-maps` use in screens | Less indirection; faster initially | Couples every screen to a fragile dependency and makes E2E require a real map surface |
| Individually accessible markers | More granular; feels more accessible | Traversing 25 markers is worse than a linear list carrying the same information |
| A generic `<Row>` used everywhere | Less code; more reuse | Stop rows and history rows have genuinely different states; a shared abstraction would accumulate conditional branches |
| Separate loading, error and empty components | Clearer names; simpler each | Three components with three chances to omit the action. One with a required prop cannot be misused |
| Confirmation dialogs instead of `<UndoToast>` | Simpler; no timer state | Taxes every user to protect against a rare, recoverable mistake ([`06`](06_UX_GUIDELINES.md) P8) |
| Marker numbers updating on drag release | Cheaper; less recomputation | The live feedback is the entire value of dragging; deferring it makes the interaction feel broken |
