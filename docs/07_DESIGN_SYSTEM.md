# 07 — Design System

> **Status:** Approved
> **Owner:** Design
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0009](adr/0009-visual-direction.md) · [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) · [`23_ACCESSIBILITY.md`](23_ACCESSIBILITY.md)

---

> **This document is the single source of truth for design tokens.** No component defines a
> colour, spacing value, radius, font size or duration of its own. A literal value in a
> component is a review-blocking defect ([`../CLAUDE.md`](../CLAUDE.md) §8).

---

## 1. Purpose

This document defines the visual language: colour, type, spacing, elevation, motion and the
rules governing their use. It translates the visual direction of
[ADR-0009](adr/0009-visual-direction.md) into tokens a component can consume.

## 2. Goals

1. One accent colour, used with consistent meaning throughout.
2. Both themes first-class, verified rather than derived by inversion.
3. Legibility in a vehicle, in sunlight, with one hand — the actual operating conditions.
4. A token set small enough to hold in memory.
5. WCAG AA contrast in every combination that ships.

**Non-goals.** No component specifications ([`09`](09_COMPONENT_LIBRARY.md)), no screen layouts
([`08`](08_SCREEN_SPECIFICATIONS.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Token definitions | This document | The only source |
| Token implementation | NativeWind theme configuration | Generated from these values |
| Contrast verification | Design + automated check | Both themes, including over the map |
| Map style alignment | [`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md) | Map IDs must match these tokens |

---

## 4. Text diagrams

### Colour architecture

```
  ┌─── NEUTRAL RAMP ──────────────────────────────────────┐
  │  The entire interface. Paper-white → near-black.       │
  │  Carries all structure, text and surfaces.             │
  └────────────────────────────────────────────────────────┘
                            +
  ┌─── ONE ACCENT: MINT ──────────────────────────────────┐
  │  active route · primary action · selected marker ·     │
  │  completed stop                                        │
  │  Meaning is consistent: "this is the route, this is    │
  │  the action, this is done"                             │
  └────────────────────────────────────────────────────────┘
                            +
  ┌─── RED — RESERVED ────────────────────────────────────┐
  │  errors · warnings · limits · destructive actions      │
  │  NEVER decorative. NEVER a route. NEVER emphasis.      │
  └────────────────────────────────────────────────────────┘

  There is no fourth colour. A component is neutral,
  accented, or in error.
```

### Screen composition

```
  ┌────────────────────────────┐
  │                            │  MAP ZONE — for looking
  │      map (quiet)           │  Desaturated. Recedes.
  │                            │  Content floats above it.
  │      ◉ ◉ ◉  markers        │
  │       ╲│╱   mint polyline  │
  │                            │
  ├────────────────────────────┤  ← thumb reach boundary
  │  ▁▁▁                       │
  │  Route · 12 stops          │  CONTROL ZONE — for touching
  │  34 KM · 1H 12M            │  Every primary control lives
  │  ┌──────────────────────┐  │  in the lower third.
  │  │      Optimize        │  │
  │  └──────────────────────┘  │
  └────────────────────────────┘
```

---

## 5. Flows

**How a token is added.** Components never define values, so every visual change enters here
first and propagates outward.

```
  need for a value that no token expresses
            │
            ▼
  can an existing token serve?  ──yes──▶  use it; no token added
            │ no
            ▼
  add the token here, in both themes, with its contrast measured
            │
            ▼
  verified against 23_ACCESSIBILITY thresholds  ──fails──▶  value adjusted, not the threshold
            │ passes
            ▼
  referenced by 08 and 09; never redefined there
```

**How a theme is verified.** Light and dark are not variants of one another — each token is
checked against its own background in its own theme, because an inverted palette produces
contrast failures that a single-theme check cannot see.

**How the accent stays single.** Mint is claimed by the active route, the primary action, the
selected marker and the completed stop. A proposal for a second accent is a proposal to change
[ADR-0009](adr/0009-visual-direction.md), and is handled as one.

## 6. Colour tokens

### Neutral ramp

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F7F7F5` | `#0B0B0C` | App background, matching the map base |
| `surface` | `#FFFFFF` | `#161618` | Sheets, cards |
| `surface-raised` | `#FFFFFF` | `#1F1F22` | Elevated cards, callouts |
| `border` | `#E4E4E1` | `#2A2A2E` | Hairlines, dividers where unavoidable |
| `text-primary` | `#111112` | `#F5F5F3` | Body, headings, numerals |
| `text-secondary` | `#6B6B70` | `#9A9AA0` | Meta lines, labels |
| `text-tertiary` | `#9A9AA0` | `#6B6B70` | Placeholders, disabled |

`bg` deliberately matches the paper map base so the map and the interface read as one surface.

### Accent — mint

| Token | Light | Dark | Use |
|---|---|---|---|
| `accent` | `#0A7D5C` | `#2FD3A5` | Primary action, active route, selected marker |
| `accent-pressed` | `#08694D` | `#26B98F` | Pressed state |
| `accent-subtle` | `#E6F7F1` | `#12332A` | Accent-tinted backgrounds |
| `accent-on` | `#FFFFFF` | `#04231A` | Text and icons on an accent fill |

The dark-theme mint is deliberately lighter and more saturated. The light-theme value is
darkened from the reference — twice.

**Corrected 2026-08-09, and worth recording how.** This table previously read `#0FA97E` with the
claim that it reached 4.5:1 against `surface`. It reaches **3.00:1**: a white label on it fails
the text threshold, and as a control it fails even the 3:1 interface threshold against `bg`
(2.80:1). The claim had been in the document since the palette was written and nothing had ever
measured it. `lib/design/tokens.test.ts` now computes every ratio from the shipped values, and it
failed on the first run — which is the only reason this is a correction rather than an
accessibility defect in a released build.

The values below measure **5.12:1** and **6.69:1** with a white label, and **4.77:1** against
`bg`. `danger` moved for the same reason: `#D92D20` measured 4.44:1 on `danger-subtle`, close
enough to pass a glance and not close enough to pass the rule.

### Semantic — red and support

| Token | Light | Dark | Use |
|---|---|---|---|
| `danger` | `#D0271B` | `#FF5C4D` | Errors, destructive actions, unreachable stops |
| `danger-subtle` | `#FEF3F2` | `#3A1512` | Error backgrounds |
| `warning` | `#B54708` | `#F79009` | Degraded results, quota approaching |
| `info` | `#3538CD` | `#8098F9` | Neutral informational states only |

**`warning` is used for the degraded (T0) label**, not `danger`. A degraded optimization is not
an error — it is a lower-confidence result, and colouring it red would misrepresent it
([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)).

### Map-specific

| Token | Light | Dark | Use |
|---|---|---|---|
| `route-line` | `accent` | `accent` | Optimized polyline |
| `route-casing` | `#0B3B2E` @ 40% | none | Contrast outline in light theme only |
| `route-degraded` | `warning`, dashed | `warning`, dashed | T0 straight connectors |
| `marker-pending` | `surface` fill, `text-primary` border | same | Default stop |
| `marker-completed` | `accent` fill + checkmark | same | Completed |
| `marker-unreachable` | `surface`, `danger` border + glyph | same | Unreachable |

---

## 7. Typography

Two voices, from [ADR-0009](adr/0009-visual-direction.md).

### Voice 1 — condensed uppercase, for metrics and labels

| Token | Size | Weight | Tracking | Case | Use |
|---|---|---|---|---|---|
| `metric-xl` | 44 | 700 | −1% | as-is | The hero number: total duration, distance |
| `metric-lg` | 32 | 700 | −0.5% | as-is | Secondary numbers |
| `metric-md` | 24 | 600 | 0 | as-is | Per-leg values |
| `label-sm` | 11 | 600 | **+8%** | UPPERCASE | `KM`, `MIN`, `STOP 3 OF 12` |
| `label-xs` | 10 | 600 | +10% | UPPERCASE | Section headers |

**Numerals are tabular** in every metric style, so a changing ETA does not shift layout.

**Uppercase is confined to labels of at most three words.** It is measurably harder to read at
length and for users with dyslexia, so it never carries body copy
([`23_ACCESSIBILITY.md`](23_ACCESSIBILITY.md)).

### Voice 2 — geometric sans, for everything else

| Token | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `title-lg` | 22 | 600 | 28 | Screen titles |
| `title-md` | 17 | 600 | 22 | Sheet headers, card titles |
| `body` | 16 | 400 | 22 | Default. Stop addresses |
| `body-strong` | 16 | 600 | 22 | Stop labels |
| `caption` | 13 | 400 | 18 | Meta lines: `2.4 km · 8 min` |
| `caption-strong` | 13 | 600 | 18 | Emphasis in meta lines |

**Minimum shipped size is 10 pt** (`label-xs`) and only for uppercase labels. Body text never
goes below 13.

**Dynamic Type is supported to 200%.** Layouts reflow; they never truncate
([`23`](23_ACCESSIBILITY.md)).

---

## 8. Spacing, radius, elevation

**4 pt base grid.** Every spacing value is a multiple of 4.

| Token | Value | Use |
|---|---|---|
| `space-1` … `space-8` | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 | General spacing |
| `screen-padding` | 20 | Horizontal screen margin |
| `list-row-gap` | 20 | Between stop rows — generous, no dividers |
| `touch-min` | **44** | Minimum touch target. Non-negotiable |

| Radius token | Value | Use |
|---|---|---|
| `radius-sm` | 8 | Chips, small controls |
| `radius-md` | 14 | Cards, inputs |
| `radius-lg` | 22 | Sheets, primary buttons |
| `radius-full` | 999 | Pills, avatars, ordinal badges |

Generous radii come from the second reference. `radius-lg` on the sheet's top corners is the
product's most recognisable shape.

**Elevation is a single soft shadow**, never a stack. In dark theme, elevation is expressed by
surface lightness rather than shadow, since shadows are invisible on near-black.

| Token | Light | Dark |
|---|---|---|
| `elev-sheet` | `0 −4 24 rgba(0,0,0,0.10)` | `surface` lightness step |
| `elev-card` | `0 2 12 rgba(0,0,0,0.06)` | `surface-raised` |
| `elev-marker` | `0 2 8 rgba(0,0,0,0.20)` | same |

---

## 9. Motion

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion-instant` | 100 ms | ease-out | Press feedback |
| `motion-quick` | 180 ms | ease-out | Selection, toggles |
| `motion-standard` | 240 ms | spring (damping 0.8) | Sheet detents, card entry |
| `motion-deliberate` | 400 ms | spring (damping 0.75) | **Marker reorder after optimization** |

`motion-deliberate` is the only slow animation in the product, and it earns its length: the
markers renumbering and the list resequencing is the moment the user sees what they paid for.
It is the one place where animation is communication rather than decoration.

**Rules.** Sheet and map gestures run on the native driver or Reanimated worklets, never the JS
thread. All motion is interruptible — a user can grab a sheet mid-animation. When *Reduce
Motion* is enabled, every transition becomes instant and nothing depends on animation to be
understood.

---

## 10. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0009](adr/0009-visual-direction.md) | Quiet monochrome base, single mint accent, red reserved for alerts | Every colour token |
| [0009](adr/0009-visual-direction.md) | Two type voices: condensed uppercase for metrics, geometric sans for everything else | Typography |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only | Spacing scale and touch-target minimums |

**Decided here:** the light-theme mint is darker than the visual reference, because the
reference value fails 4.5:1 against `surface`. Fidelity to the source images lost to contrast,
and the trade is recorded rather than quietly made — see
[`23_ACCESSIBILITY.md`](23_ACCESSIBILITY.md).

## 11. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Dynamic Type at 200% | Rows grow vertically; metrics may drop one step; nothing truncates |
| 2 | Very long address | Two lines maximum, then ellipsis; full text in the detail view |
| 3 | Theme changes while a sheet is open | Tokens swap without remounting; position preserved |
| 4 | Accent over the traffic layer | The casing guarantees the route reads over red-orange traffic |
| 5 | Content over map imagery | Always on a `surface`, never directly on tiles |
| 6 | Reduce Motion enabled | All durations become 0; the reorder is instant but still visible |
| 7 | Direct sunlight | Verified outdoors; the neutral ramp holds because contrast is high by construction |
| 8 | Numerals changing rapidly (live ETA) | Tabular figures prevent layout shift |

## 12. Error handling

| Failure | Result | Fallback |
|---|---|---|
| Custom font fails to load | System font at the same metrics | System font stack |
| Token missing in a theme | **Build error, not a runtime fallback** — every token exists in both themes | None |
| Contrast check fails in CI | Build blocked | Fix the token |
| Map style unavailable | Default Google style; interface tokens unaffected | Default map |

## 13. Best practices

1. **Tokens only.** A literal value in a component is a review-blocking defect.
2. **Red is never decorative.** If something needs emphasis and is not an error, it is
   `accent` or `text-primary`.
3. **Never colour alone.** Every state that uses colour also uses a glyph, a weight or a
   position.
4. **Design dark first for the map surfaces.** The paper theme is more forgiving; problems
   surface in dark.
5. **Verify contrast over the map**, not only over `surface`. Content over imagery is the
   failure case automated checks miss.
6. **Uppercase for labels only**, at most three words.
7. **Tabular numerals in every metric.**

## 14. Checklist

- [ ] Every token defined in both themes; a missing token fails the build.
- [ ] Contrast verified: 4.5:1 text, 3:1 UI, both themes, including over the map.
- [ ] Light-theme accent verified at 4.5:1 against `surface`.
- [ ] Touch targets ≥ 44 pt everywhere, map markers included.
- [ ] Dynamic Type verified at 200% on the densest screen.
- [ ] Reduce Motion verified on every animated surface.
- [ ] Tabular numerals confirmed on all metric styles.
- [ ] No literal colour, spacing, radius or duration anywhere in components.
- [ ] Sunlight legibility verified on a physical device outdoors.

## 15. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Full token set, both themes, motion | — |
| 1.x | Marker reorder choreography refined | Post-launch polish |
| 1.2 | High-contrast variant for extreme sunlight | User feedback |
| 2.0 | Token export for a web companion | [ADR-0010](adr/0010-mobile-only-scope.md) reopened |

## 16. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Mint accent adopted | Holds contrast on both paper-white and near-black; frees red entirely for alerts | Product owner |
| 2026-08-06 | Light-theme mint darkened from the reference | The reference value was chosen against dark and fails 4.5:1 on white | Design |
| 2026-08-06 | `warning`, not `danger`, for degraded results | A T0 result is lower-confidence, not an error | Design |
| 2026-08-06 | Route casing added in light theme only | Mint on paper-white is the system's weakest contrast pairing | Design |
| 2026-08-06 | `motion-deliberate` reserved for marker reorder | The reorder is the product's proof moment and deserves to be seen | Design |

## 17. Rationale

The system is small on purpose. One accent, one reserved semantic colour, two type voices, a
4 pt grid. A driver glancing at a phone between stops cannot decode a rich visual hierarchy,
and a small system is one a solo developer can apply consistently without a design review on
every screen.

Reserving red entirely for alerts is the highest-value constraint here. In most map
applications red is decorative — traffic, pins, emphasis — which makes a genuine red warning
invisible. Because mint carries the route and the primary action, red retains its meaning, and
a red element on this screen always means the same thing.

The two type voices come directly from the first reference, and the split is functional rather
than stylistic. Condensed uppercase micro-labels beside oversized numerals is how instrument
panels work: the number is read at a glance, the label only confirms the unit. That is exactly
the reading pattern of a driver checking an ETA.

The light-theme accent was changed from the reference and this is worth recording. The
reference's mint sits on a dark dashboard where it reads well; on paper-white it falls below
4.5:1. Preserving the reference exactly would have shipped an accessibility failure on the
product's most-used surface.

## 18. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Red accent, per the first reference | Strongest identity; most faithful to the preferred image | On maps red means heavy traffic and hazard; a red route is ambiguous, and it would leave no colour for genuine warnings |
| Indigo accent, per the second reference | Familiar, friendly, strong on light | Loses presence on the near-black map where mint holds, and is the most common accent in this category |
| Multi-colour semantic palette | More expressive; conventional | Every additional colour competes with the route line, which must be the only saturated element |
| Dark theme derived by inverting light | Half the tokens; less to maintain | Inverted shadows are invisible and inverted map styles are unreadable. Both themes are authored |
| System fonts only | No loading risk; native feel | The condensed uppercase voice is the identity. System fonts fall back gracefully, so the risk is already handled |
| 8 pt grid | Fewer values; coarser rhythm | Too coarse for the dense stop rows the sheet must hold at 25 stops |
