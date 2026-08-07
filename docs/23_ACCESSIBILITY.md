# 23 — Accessibility

> **Status:** Approved
> **Owner:** Design
> **Last reviewed:** 2026-08-06
> **Related:** [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) · [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) · [`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md)

---

## 1. Purpose

This document specifies the accessibility requirements every screen and component must meet, how
they are verified, and the reasoning behind the choices that are less obvious.

Accessibility here is not only a compliance obligation. The product's normal operating
conditions — sunlight, gloves, one hand, a moving vehicle, divided attention — impose
constraints nearly identical to those of permanent impairments. **Designing for accessibility
and designing for a driver produce the same interface.**

## 2. Goals

1. WCAG 2.1 AA in both themes, including content over the map.
2. Full operability with VoiceOver and TalkBack.
3. Dynamic Type to 200% without truncation or loss of function.
4. No information conveyed by colour alone, anywhere.
5. Every gesture action available without the gesture.

**Non-goals.** No AAA commitment. No custom assistive hardware support.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Contrast tokens | [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) | Verified in CI |
| Component labels | [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) | Composed at the component |
| Screen-level verification | QA | Manual, both platforms, every release |
| Store declarations | [`26`](26_APP_STORE.md), [`27`](27_PLAY_STORE.md) | Accessibility statements |

---

## 4. Text diagrams

### The overlap

```
   PERMANENT              SITUATIONAL             OUR USER
   ─────────              ───────────             ────────
   low vision      ←→     sunlight glare     ←→   Marco, in a car
   motor impairment ←→    gloves, cold       ←→   Elena, in winter
   one hand        ←→     holding a parcel   ←→   both, constantly
   cognitive load  ←→     driving            ←→   both, constantly
   colour blindness ←→    bad screen angle   ←→   both

   The same interface serves all three columns. This is why
   accessibility work here is not overhead — it is the brief.
```

### The map's accessibility model

```
  VISUAL                          ASSISTIVE TECHNOLOGY
  ──────                          ────────────────────
  ┌──────────────┐
  │  map with    │  ────────▶     one element:
  │  25 markers  │                "Route map, 12 stops,
  │  ①②③④⑤…      │                 34 kilometres, 1 hour 12 minutes"
  └──────────────┘
                                  ↓ the equivalent, and the better one
  ┌──────────────┐
  │ stop list    │  ────────▶     linear traversal, one element per
  │ ⑴ ⑵ ⑶ …      │                stop, with actions attached
  └──────────────┘

  The list is not a fallback. For a screen-reader user it is
  strictly better than traversing 25 markers, and it carries
  exactly the same information.
```

---

## 5. Requirements

### Contrast

| Element | Ratio | Verified against |
|---|---|---|
| Body text | 4.5:1 | Its own background, both themes |
| Large text (≥ 24 pt) | 3:1 | Same |
| Interface elements, icons | 3:1 | Same |
| **Content over the map** | 4.5:1 | Against the lightest and darkest map regions |
| Route polyline | 3:1 | Against the map base — the reason for the casing in light theme |
| Marker fills | 3:1 | Against the map base |

Content over imagery is the case automated tooling misses, because the background is not a token.
Every element that floats over the map sits on a `surface`, never directly on tiles
([`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md)).

**The light-theme mint was darkened from the visual reference** specifically to reach 4.5:1
against `surface`. Preserving the reference exactly would have shipped a contrast failure on the
most-used control in the product.

### Never colour alone

| State | Colour | **Plus** |
|---|---|---|
| Completed stop | mint | **checkmark glyph** |
| Unreachable stop | red border | **warning glyph** + inline reason text |
| Degraded result | amber chip | **text: "Estimated without traffic"** |
| Selected marker | mint fill | **size increase + z-order** |
| Active route line | mint | **the only line on the map** |
| Disabled action | reduced opacity | **stated reason in text** |

A user with deuteranopia — roughly one in twelve men, and this product's users skew male — must
be able to distinguish every state.

### Touch targets

Minimum **44×44 pt**, including map markers, whose hit area exceeds the drawn pin. Adjacent
targets are separated by at least `space-2` so a gloved or imprecise touch cannot hit the wrong
one.

### Dynamic Type

Supported to **200%**. Layouts reflow: rows grow vertically, metrics may drop one step in the
type scale, and text wraps to a second line. **Nothing truncates and no function is lost.**

The densest case is Plan at 25 stops with the sheet at full detent, and it is the case that must
be tested.

### Screen readers

| Element | Label pattern |
|---|---|
| Stop row | "Stop 3, Farmacia Centrale, Via Roma 12, 2.4 kilometres, 8 minutes" |
| Map | "Route map, 12 stops, 34 kilometres, 1 hour 12 minutes" |
| Primary action | Its outcome — "Optimize route", "Start navigation" — never "Button" |
| Sheet handle | "Route details, half open. Double-tap to expand" |
| Marker (when reached) | Same composed label as the row |
| Degraded chip | "Warning: route estimated without traffic data" |

**Labels state outcomes, not element types.** "Optimize route" tells a user what will happen;
"Optimize button" does not.

**State changes are announced**: optimization complete, stop marked done, quota reached, offline
entered and left. A silent state change leaves a screen-reader user with a stale mental model.

### Motion

**Reduce Motion** removes every transition. The marker reorder becomes instant — but the number
change remains perceptible, because the reorder is information, not decoration
([`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md)).

Nothing in the product requires perceiving an animation to be understood.

### Gestures

Every gesture has a visible, non-gesture equivalent
([`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md) P7):

| Gesture | Equivalent |
|---|---|
| Drag to reorder | Move up / move down, as accessibility actions on the row |
| Swipe to delete | Delete action in stop detail, and as an accessibility action |
| Drag the sheet | Tap the handle to cycle detents |
| Pinch to zoom | Zoom controls, and the Recenter action |

---

## 6. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0009](adr/0009-visual-direction.md) | Mint accent darkened in light theme to reach 4.5:1 | Contrast |
| [0009](adr/0009-visual-direction.md) | Never colour alone; every state carries a glyph | All states |
| [0010](adr/0010-mobile-only-scope.md) | Sheet rather than sidebar — thumb reach serves motor impairment too | Layout |

**Decided here:** the map is a single accessibility element, with the stop list as its
traversable equivalent (§13). This is a departure from exposing every marker, and it is
deliberate.

## 7. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Dynamic Type 200% on Plan at 25 stops | Rows grow; list virtualisation recalculates; nothing truncates |
| 2 | VoiceOver traversing the map | One element with a summary; the list is the traversable equivalent |
| 3 | Reorder via accessibility actions | Marker numbers update; the change is announced |
| 4 | Reduce Motion during optimization | Reorder is instant; completion is announced |
| 5 | High-contrast system setting | Borders strengthen; the accent remains distinguishable |
| 6 | Screen reader active during handoff | The transition to the external app is announced |
| 7 | Gloved touch between two rows | Target separation prevents mis-hits |
| 8 | Bold Text system setting | Weights increase without layout breakage |
| 9 | Landscape with Dynamic Type at maximum | Sheet detents recompute; the primary action stays reachable |
| 10 | Colour filters active | All states remain distinguishable by glyph and shape |

## 8. Error handling

| Failure | Result |
|---|---|
| Label missing on an interactive element | **CI failure** — caught by an automated audit, not by review |
| Contrast below threshold | **Build blocked** |
| Touch target under 44 pt | Flagged in automated component tests |
| Announcement not fired on a state change | Manual QA finding; treated as a defect, not a polish item |
| Layout truncates at 200% | Defect; the layout is fixed rather than the limit lowered |

## 9. Best practices

1. **Compose labels at the component**, once, rather than exposing four sub-elements per row.
2. **Label outcomes, not element types.**
3. **Never rely on colour**, ever, for any state.
4. **Verify contrast over the map**, not only over surfaces.
5. **Test at 200% on the densest screen**, not the simplest.
6. **Announce every state change** the user did not directly cause.
7. **Test outdoors.** Sunlight legibility is the situational impairment this product's users face
   daily, and no simulator reproduces it.
8. **Prefer the better equivalent to more elements.** The stop list serves screen-reader users
   better than 25 traversable markers.

## 10. Checklist

- [ ] Contrast verified: 4.5:1 text, 3:1 UI, both themes, including over map imagery.
- [ ] Light-theme accent verified at 4.5:1 against `surface`.
- [ ] Every state distinguishable without colour.
- [ ] Touch targets ≥ 44 pt with adequate separation, markers included.
- [ ] Dynamic Type verified to 200% on Plan at 25 stops.
- [ ] VoiceOver walkthrough of all three journeys.
- [ ] TalkBack walkthrough of all three journeys.
- [ ] Every gesture has a verified non-gesture equivalent.
- [ ] Reduce Motion verified on every animated surface.
- [ ] State-change announcements verified.
- [ ] Outdoor sunlight legibility verified on a physical device.

## 11. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Full AA compliance; VoiceOver and TalkBack support | — |
| 1.x | Automated accessibility audit in CI | Post-launch |
| 1.2 | High-contrast variant for extreme sunlight | User feedback |
| 2.0 | Voice input for adding stops | Demand from the driving context |

## 12. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Map is a single accessibility element | 25 traversable markers is worse than the equivalent list | Design |
| 2026-08-06 | Light-theme mint darkened from the reference | The reference value fails 4.5:1 on white | Design |
| 2026-08-06 | Reorder remains perceptible under Reduce Motion | The reorder is information, not decoration | Design |
| 2026-08-06 | Outdoor legibility added to the release checklist | Sunlight is this product's defining situational impairment | Design |

## 13. Rationale

The situational-impairment overlap is the core argument of this document. A driver in sunlight
wearing gloves, holding a parcel, glancing at a phone for two seconds has, temporarily, reduced
vision, reduced motor precision, one hand and divided attention. The interface that serves them
is the interface that serves a permanently impaired user. There is no trade-off to manage here,
which is unusual and worth exploiting.

The map decision is the one most likely to be questioned. The instinct is that more accessible
elements means more accessible — but traversing 25 markers with a screen reader, in
non-deterministic spatial order, with no way to know where you are in the route, is a hostile
experience. The stop list carries identical information in the order the user cares about, with
actions attached. Accessibility is served by providing the better equivalent, not by
instrumenting the worse one.

Darkening the accent from the visual reference is recorded because it was a real trade-off
against fidelity to the source images. The reference's mint was chosen against a dark dashboard;
on paper-white it falls below 4.5:1. Shipping it unchanged would have put an accessibility
failure on the most-tapped control in the product.

## 14. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Individually accessible map markers | More granular; instinctively more accessible | Non-linear traversal of 25 elements with no positional context is worse than the list |
| AAA contrast throughout | Maximum legibility | Would force near-black text on white and eliminate the quiet map aesthetic entirely, for a threshold not required |
| Accessibility as a post-launch phase | Faster to ship; common practice | Retrofitting labels and reflow is far more expensive than building them in, and the operating conditions demand it from day one |
| Separate accessible mode | Optimised for each audience | Two interfaces to maintain and test, and the accessible one inevitably lags |
| Colour-blind palette as a toggle | Serves affected users precisely | The base design already never relies on colour, which serves everyone without a setting to discover |
