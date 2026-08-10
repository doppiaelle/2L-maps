# ADR-0020 — The dock has four sections and the map is one of them

**Status:** Accepted
**Date:** 2026-08-10
**Amends:** [ADR-0018](0018-bottom-dock-navigation.md)
**Related:** [ADR-0009](0009-visual-direction.md), [`docs/18_PERMISSIONS.md`](../18_PERMISSIONS.md)

## Context

[ADR-0018](0018-bottom-dock-navigation.md) replaced a bottom sheet and two
floating glyphs with a dock. That decision holds. Three details of how it was
built did not survive first contact with the device.

**The dock changed width.** It carried three sections plus a close control that
appeared only while a section was open. The reasoning was sound as far as it
went — a permanently visible ✕ on the bare map is a control that does nothing,
which is worse than an absent one. The conclusion did not follow. Because the
items divide the available width between them, adding a fourth moved all three:
opening History shifted every item left, closing it shifted them back. A user
moving between two sections watched the row re-lay-out twice on the way, with
their thumb already travelling toward where an item used to be.

A dock's whole value is that a position becomes muscle memory. A dock whose
positions depend on state has given that away for a control that appears once
per visit.

**It read as a wall, not as a control.** It was full-bleed, welded to the bottom
edge, bordered only along its top. The map did not continue underneath it; the
map *ended* at it. The outermost items also ran their touch targets off the side
of the screen, so the two most-used positions were the two least precise.

**The map had no name.** `ActiveSection` was `DockSection | null`, where `null`
meant the map. The most common state in the app was the one expressed as an
absence, and every reader translated it: the screen, the store, the selection
handler, the tests. Nothing was marked selected while the map was showing, which
told the user they were nowhere.

## Decision

**Four sections — Map, Route, History, Settings — and the row never changes.**

- **The map is a destination, not a fallback.** `ActiveSection` is no longer
  nullable. `'map'` is where the app opens, what `closeSection` returns to, and
  what shows as selected while it is showing.
- **The close control is removed, not replaced.** Tapping the open section
  returns to the map, and so does the leftmost item. Both are always in the same
  place. Tapping Map while the map shows is a no-op: pressing the section you are
  already in confirms where you are, and toggling it into something else would
  make one item mean two things.
- **The dock floats.** Inset from both sides and the bottom, fully bordered,
  fully rounded, with the pills padded inside it. It reads as one object with
  four parts, and the map is visible around it — which is what says the map
  continues rather than stops.
- **Selection is a filled pill**, not only a tint, because colour alone is not a
  state anyone can rely on (`CLAUDE.md` §10 rule 4).

## Consequences

**`SectionPanel` stops higher.** It offsets by the dock's full footprint —
`DOCK_OUTER_HEIGHT`, gap included — rather than the pill row alone, or its bottom
edge would run underneath a dock that no longer touches the edge. The map's
camera padding uses the same number, so a marker still never lands beneath the
dock.

**Four items is the ceiling, and it is now a real constraint.** A fifth section
would take the pills below a comfortable width at 200% Dynamic Type. The dock was
already the place a new top-level destination has to justify itself; it is now
also the place one has to displace something.

**`showsClose` is deleted.** Any caller expecting it fails to compile, which is
the intended way to find them.
