# ADR-0018 — A bottom dock replaces the sheet and the floating controls

**Status:** Accepted
**Date:** 2026-08-10
**Supersedes:** the sheet-detent model in [`docs/08_SCREEN_SPECIFICATIONS.md`](../08_SCREEN_SPECIFICATIONS.md) §7
**Reverses:** the rejection of tab-style navigation in [`docs/10_NAVIGATION_FLOW.md`](../10_NAVIGATION_FLOW.md) §16
**Amends:** [`CLAUDE.md`](../../CLAUDE.md) §7 rule 1 and rule 3, [ADR-0010](0010-mobile-only-scope.md)

## Context

The first build reached a real phone and the navigation was the first thing its
owner named: the sheet was "horrible".

The design was internally coherent and wrong in use. The stop list lived in a
bottom sheet with three detents, dragged up from the bottom of the map. History
and Settings lived in two 44 pt glyphs in the **top-right corner** — the furthest
reachable point from a thumb on a phone held one-handed — and
`MapControls` returned `null` outright while a route was in progress, so the
person actually driving could reach neither.

Three failures, and only the first was a matter of taste:

1. **The work was behind a gesture.** `CLAUDE.md` §7 rule 4 says gestures have
   visible alternatives. The sheet had a tap target on its handle, which is
   technically an alternative and practically a secret: nothing on the screen
   says that the strip at the bottom is a control, or that a list is behind it.
2. **Navigation was where the hand is not.** §7 rule 2 puts every primary control
   in the lower third. The two controls that changed what you were looking at
   were in the upper right.
3. **The controls disappeared when they were most needed.** Hiding History and
   Settings mid-route was meant to protect a driver from distraction. What it
   actually did was remove the way out — including the way to change which
   navigation app a twelve-stop day is about to be handed to.

`docs/10` §16 had rejected a tab navigator on the grounds that it "consumes
permanent thumb-zone space for navigation rather than action, and implies three
equal activities". Both objections are real. Both are outweighed: the space it
consumes is space the sheet was consuming anyway in its collapsed state, and the
three activities *are* equal in the only sense that matters — each is a place the
user goes deliberately.

## Decision

**A dock at the bottom of the screen, with three sections and a close control.**

- **Route · History · Settings.** Each opens full-screen above a map that stays
  mounted underneath. The map is never unmounted, so closing a section costs
  nothing — no tile fetch, no camera animation.
- **The close control appears only when a section is open.** A permanently
  visible X on the bare map would invite a tap and answer with silence.
- **Tapping the open section closes it**, so the dock is a second way back to the
  map and not only a way in.
- **Every section stays reachable mid-route.** This is the direct reversal of the
  old behaviour and the one with a safety argument behind it.
- **The panel stops above the dock**, never edge to edge, or it would cover the
  control it is meant to be closed by.
- **No `expo-blur`.** The translucency is a background colour. Blur is a native
  module and would put the Expo SDK / `react-native-maps` pair back through C6
  verification ([ADR-0005](0005-map-engine-and-route-preview.md)) for a visual
  effect. The seam is one background in one file if it is ever wanted.

### What this costs, stated plainly

**The three-tap rule becomes four.** `CLAUDE.md` §7 rule 1 promised app-open to
optimized route in three taps: Add a stop → choose → Optimize. With a clean map
as the starting view it is Route → Add a stop → choose → Optimize.

This was chosen deliberately over two alternatives that would have kept the
three:

- *Open the Route section on launch.* Cheapest, and wrong: the app would open on
  a list, and the map is what orients someone who has just unlocked their phone
  in a street they do not know.
- *A compact metrics-and-action bar over the map.* Keeps the count and puts
  permanent furniture back on the map — the exact thing the sheet was criticised
  for.

The rule is amended rather than quietly broken. A tap in a place the user can see
is worth more than a tap saved by a gesture they cannot.

## Consequences

**Deleted, not deprecated** (`CLAUDE.md` §12 rule 5): `components/sheet/RouteSheet.tsx`,
`lib/ui/sheet.ts`, `components/map/MapControls.tsx`, and the two pushed screens
`app/(app)/history.tsx` and `app/(app)/settings.tsx`, whose containers moved to
`features/routes/HistorySection.tsx` and `features/settings/SettingsSection.tsx`.

`showsRowActions` went with `lib/ui/sheet.ts`. It was specified in docs/08 §7,
unit tested, and never passed to `StopList` — row actions are now always visible,
so the concept it described no longer exists.

`SheetDetent` was declared twice, in `lib/ui/sheet.ts` and in
`features/ui/ui-store.ts`, as two structurally identical types with no
relationship. There is now one `DockSection`, imported.

`AppMap`'s `sheetFraction` became `bottomObstructionFraction`, and its default
went from `0.4` to `0`. The old default meant "a half-open sheet" and would have
gone on padding the camera for a component that no longer exists.

**Deep links start working.** `decideLaunch` has always been able to return
`history` and `settings`, and `lib/navigation/deep-links.ts` has always parsed
`twolmaps://history` and `twolmaps://settings` — nothing consumed either, and
both quietly landed on Plan. They are now `openSection(...)`, which is the line
that was missing.

## Alternatives considered

**Keep the sheet, add a visible "Stops" button.** Cheapest fix, and it treats the
symptom: the list would still be in a container whose size is a gesture, and
History and Settings would still be in the corner.

**Push History and Settings as screens, keep the sheet for stops.** What exists
today. It is the arrangement that produced the complaint.

**A drawer from the side.** Rejected for the reason a sidebar was rejected in
ADR-0010: it is a desktop pattern, and the edge swipe that opens it is another
invisible gesture.
