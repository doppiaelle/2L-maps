# ADR-0010 — Mobile only; the stop list is never a sidebar

**Status:** Accepted, partially superseded
**Date:** 2026-08-06
**Deciders:** Product owner
**Implements decisions:** D9
**Superseded in part by:** [ADR-0018](0018-bottom-dock-navigation.md)

> **What still stands and what does not.** The decision this ADR exists for — mobile only, no
> sidebar, the thumb-reach argument behind it — is unchanged and is the reason a drawer was
> also rejected later. **The mechanism is superseded:** the stop list is no longer a
> collapsible sheet with three detents but a full-screen section opened from a bottom dock.
> The sheet lost on its own terms — it put the list behind a gesture — not on this ADR's.
> Every mention of detents below is history.

---

## Context

The third visual reference is a desktop layout with a persistent left sidebar listing places
beside a large map. It is an effective pattern, and it raised a scope question the original
brief had not addressed: the brief named only the App Store and Google Play, but the
reference implied a responsive or web surface.

The question is not merely about screen size. A web target changes authentication (sessions
outside the store ecosystem), billing (payments outside StoreKit and Play Billing, with the
consumer-law obligations that follow), the navigation architecture, the component library,
the testing matrix and the CI pipeline. It roughly doubles the delivery surface.

There is also a plausible use case pulling the other way: a professional preparing tomorrow's
route at a desk in the evening, then driving it the next morning. That is a real workflow for
the target segment.

## Decision

**Release targets are iOS and Android only.** No web application, no responsive desktop
layout, no tablet-specific layout in the MVP.

**The stop list exists solely as a collapsible bottom sheet.** It is never a persistent
sidebar at any breakpoint. The sidebar of the third reference contributes its *row design* —
circular badge, title, `distance • status` meta line, trailing icons, generous rhythm without
dividers, fading final row — and nothing of its *layout*.

The sheet has three detents:

```
┌─────────────────────────┐   Peek      route summary only:
│                         │             total distance, ETA, stop count
│        MAP              │             thumb-reachable, map stays dominant
│                         │
│                         │   Half      scrollable stop list,
├─────────────────────────┤             map still visible above
│ ▁▁▁                     │
│ Route · 12 stops        │   Full      list plus per-stop actions,
│ 34 km · 1h 12m          │             reorder, edit, remove
└─────────────────────────┘
```

Opened by tapping **Route**. Dismissed by dragging down or tapping the map. The sheet is the
only stop-list surface in the product.

**One-handed operation is a hard constraint.** Every primary control sits within thumb reach
in the lower third of the screen. The map occupies the upper region, which is for looking
rather than touching. This is why the sheet ascends from the bottom and why there is no
sidebar: a side panel puts primary controls where a driver's thumb cannot go.

## Consequences

**Positive.** One platform family, one component library, one test matrix, one release
pipeline. For a solo or very small team this is the difference between shipping and not.

**Positive.** The design system optimises for a single context — one hand, in a vehicle,
often in sunlight, often in a hurry — rather than compromising between phone and desktop.

**Positive.** Subscription handling stays entirely inside StoreKit and Play Billing. No
external payment flow, no separate web checkout, and none of the EU external-purchase
complications that would follow.

**Negative.** The "prepare at the desk in the evening" workflow is unserved. This is the
genuine cost. Partially mitigated by list import: a user can prepare a CSV or a text list
anywhere and import it on the phone in seconds.

**Negative.** Tablets receive a scaled phone layout rather than a designed one. Acceptable
because the target segment works from a phone in a vehicle; a tablet layout would serve very
few users at meaningful cost.

**Negative.** A bottom sheet holds less than a sidebar, so the stop list must work in a
constrained vertical space. This drives the row design: compact, scannable, no dividers,
information ordered by what a driver needs at a glance.

**Reopening condition.** A web companion should be reconsidered if list import proves
insufficient in practice — measured by import-feature usage and by support requests asking
for desktop entry — or if the product moves toward the B2B fleet segment, which requires a
dispatcher dashboard by definition.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Mobile plus a designed tablet layout with the sidebar | Uses the reference pattern where it fits; better on iPad | Serves few users in the target segment at the cost of a second layout for every screen. The sidebar also conflicts with the one-handed rule, which does not stop mattering on a larger device held in a van. |
| Mobile now, web companion in phase 2 | Serves the evening-preparation workflow; a realistic need | Requires designing the responsive system now to avoid a rewrite later, which is most of the cost with none of the near-term benefit. Deferred to the roadmap with an explicit trigger rather than assumed. |
| Mobile and web from day one | Maximum reach; strongest for B2B expansion | Roughly doubles the surface: separate auth, billing outside the stores, separate CI. Delays the mobile MVP, which is the only surface the target segment uses while driving. |
| Persistent sidebar on phones in landscape | Reuses the reference layout directly | Landscape is rare in one-handed in-vehicle use, and a side panel puts controls outside thumb reach. The sheet works in both orientations. |

## References

- [`docs/05_INFORMATION_ARCHITECTURE.md`](../05_INFORMATION_ARCHITECTURE.md) — screen structure
- [`docs/08_SCREEN_SPECIFICATIONS.md`](../08_SCREEN_SPECIFICATIONS.md) — sheet detents and behaviour
- [`docs/06_UX_GUIDELINES.md`](../06_UX_GUIDELINES.md) — one-handed operation, three-tap rule
- [ADR-0009](0009-visual-direction.md) — the row design taken from the reference
