# ADR-0022 — One Route section, with the map as its second face

**Status:** Accepted
**Date:** 2026-08-10
**Amends:** [ADR-0018](0018-bottom-dock-navigation.md), [ADR-0020](0020-four-section-dock.md)
**Related:** [ADR-0021](0021-drawn-route-preview.md)

## Context

[ADR-0020](0020-four-section-dock.md) was written this morning and is being
amended this evening. That is worth stating plainly rather than glossing: it was
reasoned from the code, and this is reasoned from the device, and the device
wins.

Its subject was a dock that changed width — three items on the bare map and four
with a section open, so every open and close shifted every item under the user's
thumb. That diagnosis was right and the fix for it stands. What did not survive
first use was the other half of the decision: making the map a **destination**.

Two things went wrong with that.

**The app opened on nothing.** The map is empty until a route exists, so a new
user, and any returning user who had finished yesterday's round, was met with a
blank rectangle of countryside and had to find the Route tab before the product
did anything. [ADR-0018](0018-bottom-dock-navigation.md) had considered opening
on the list and rejected it — "the map is what orients someone who has just
unlocked their phone in a street they do not know" — which is true of a map with
their position and their route on it, and not true of an empty one. It also cost
a tap: `CLAUDE.md` §7 rule 1 went from three to four to pay for it.

**The map is not a place.** Nobody opens this app to look at a map. They open it
to build a round and to be told the order to drive it in, and the map is how that
answer is delivered. A destination is somewhere you go and stay; this is
something that appears when there is something to show and leaves when there is
not.

## Decision

**Three dock sections — Route, History, Settings — and the Route section shows
one of two faces.**

- **List**, while the route is being built. This is where the app opens.
- **Map**, from the moment a result lands until the user leaves it. Same space,
  same header, same primary control position; only the middle changes.

`lib/route/route-view.ts` owns the transitions and they are four:

| Event | Result |
|---|---|
| A result arrives | Map — without a second tap. The user pressed Optimize and this is the answer. |
| The X | List, **keeping the stops**. The result goes; the work does not. |
| Any edit to the list | List. A result describes a set of stops; change the set and it describes something that no longer exists. |
| The section is reopened | Whatever it was, if the result is still there. |

**The X sits top right, on the canvas.** ADR-0018 spent a whole decision moving
controls out of that corner, and this is not a reversal of it: what ADR-0018
moved was *navigation*, which a thumb must reach one-handed while driving. This
dismisses what is on the canvas, it sits on the canvas, and the thumb-zone rule
is served by Confirm being exactly where every primary action has always been.

**"Start" becomes "Confirm".** It sits under a drawn route the user is being
asked to accept, and what it does is hand the day to another app. "Start"
described navigation, which this product has never done
([ADR-0004](0004-external-navigation-handoff.md)).

## Amended by ADR-0027 — a third face, and a different control

The section has three faces rather than two: **list**, **preparing**, **map**. The middle one
is the seconds between pressing Optimize and the answer arriving, which were previously spent
on the stop list under a button reading "Optimizing" — a label, not a state. It appears after a
second, so a cached optimization goes straight from list to route and the user sees nothing in
between, which is the correct experience for work that did not have to be done again.

The control that leaves the map is now **three parallel lines** rather than a cross. A cross
says "close this and lose it"; what happens is that the stop list comes back with every stop on
it. The same glyph marks Route in the dock, and that is the point — both mean *the list*.

What did **not** change: the map is still not a destination, the dock is still three fixed
items, and the map still appears because an optimization produced it.

## Consequences

**Back to three taps.** Route opens by default, so the tap ADR-0018 spent on
opening the section is not spent. `CLAUDE.md` §7 rule 1 returns to three: Add a
stop → choose → Optimize.

**The row still never changes width**, which was ADR-0020's real subject. Three
fixed items, no close control, nothing added or removed while the app runs.

**The map is no longer always mounted.** ADR-0018 kept it mounted so closing a
section cost no tile fetch and no camera animation. Neither exists now: the drawn
preview has no tiles and no camera ([ADR-0021](0021-drawn-route-preview.md)), and
mounting it is a projection over at most twenty-five points.

**The list and the map stop coexisting.**
[`docs/05_INFORMATION_ARCHITECTURE.md`](../05_INFORMATION_ARCHITECTURE.md) said
"there is one route, visible two ways simultaneously", and now it is visible two
ways alternately. That is a real loss on a tablet-sized screen and no loss at all
on a phone, where the sheet that made them simultaneous was the thing the user
called horrible in the first place.

**Confirm has to answer.** `handoff.start()` returns six outcomes and the screen
handled one. Moving the control was the moment to fix that, and
`lib/handoff/outcome-notice.ts` now covers all six — including success, because a
route split into three parts is something the driver has to know before setting
off rather than at the end of the first part.
