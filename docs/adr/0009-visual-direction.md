# ADR-0009 — Visual direction: quiet monochrome base, single mint accent

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Product owner
**Implements decisions:** D7, D8

---

## Context

Three reference images were supplied, each contributing a different layer and each using a
different accent colour — which meant a synthesis decision was unavoidable rather than
optional.

**Reference 1 — a speed widget.** A near-white "paper" map, desaturated to the point where
roads are barely visible and labels are pale grey. A thick black route line fading to
transparent at its tail. Spaced uppercase micro-labels (`SPEED`, `KM/H`, `M`) paired with
oversized numerals. Information anchored at the four corners, with the map deliberately
receding to become a quiet background. A single chromatic accent — red — used only for the
speed-limit roundel.

**Reference 2 — a mobile route app.** Structural patterns: an origin/destination card joined
by a dotted connector with edit affordances, a full-width primary call to action, a maneuver
chip, side-by-side statistic cards for distance and ETA, a bottom tab bar, a position puck
with a halo. Generous corner radii, soft shadows. Indigo accent.

**Reference 3 — a dark dashboard.** A list of places: circular badge, title, a
`distance • status` meta line, trailing icons, generous vertical rhythm with no dividers, and
the final row fading out. Full dark theme. Mint green accent.

The product owner's direction: reference 1 for the map and the overall minimal restraint,
reference 2 for structural patterns, reference 3 for the stop list — which on mobile becomes a
collapsible panel rather than a persistent sidebar.

## Decision

**The base is monochrome and quiet.** A paper-white map in light theme and a near-black map in
dark theme, both heavily desaturated, with the map treated as background rather than subject.
Both themes are first-class; neither is an afterthought.

**Exactly one chromatic accent: mint green.** It marks the active route polyline, the primary
call to action, the selected marker and completed stops. Its semantics are consistent —
mint means *this is the route, this is the action, this is done*.

**Red is reserved exclusively for errors, warnings and limits.** It never appears
decoratively and never marks a route. A user must be able to learn, in the first session, that
red always means attention.

Mint was chosen over the alternatives for reasons that are specific rather than aesthetic: it
holds contrast against both a paper-white and a near-black map, where indigo dims on dark
surfaces and red conflicts with the near-universal cartographic convention of red meaning
heavy traffic or hazard. Reserving red entirely for alerts is only possible if the accent is
something else.

**Typography speaks in two voices.** A condensed face in spaced uppercase for metrics and
labels — ETA, distance, stop number, section headers. A neutral geometric sans for body text
and interface copy. Numerals are oversized wherever a number is the point of the screen, as in
reference 1.

**The stop list is a bottom sheet with detents** — peek, half, full — opened by tapping
**Route**. It is never a persistent sidebar, on any screen size
([ADR-0010](0010-mobile-only-scope.md)). The circular brand avatar of reference 3 becomes the
stop's ordinal number.

**The three-tap constraint is a hard design rule**, not an aspiration: from app open to an
optimized route must never exceed three taps. Any proposed screen or flow that breaks it is
rejected at design review.

## Consequences

**Positive.** A quiet monochrome map with one accent is genuinely differentiated from Google
Maps, Waze and Apple Maps, all of which are chromatically busy. For a professional tool used
many times a day, visual calm is a feature.

**Positive.** A single accent colour makes the design system small and the component states
easy to reason about. A component is default, accented, or in error — there is no fourth
chromatic case.

**Positive.** Restricting red to alerts makes warnings genuinely legible. In an app where red
is decorative, a red warning is invisible.

**Negative.** The paper map style requires Cloud-based Map Styling with a Map ID per theme,
configured in the Google Cloud console outside version control
([ADR-0005](0005-map-engine-and-route-preview.md)). A console edit changes the shipped app
with no code review, and a Map ID that fails to resolve must fall back to the default style.

**Negative.** A heavily desaturated map reduces the legibility of landmarks that drivers use
to orient themselves. Mitigated by keeping road hierarchy and major labels above a minimum
contrast, and by verifying legibility in direct sunlight rather than only on a desk.

**Negative.** Mint green on a near-white map is the weakest contrast pairing in the system.
The route polyline therefore carries a subtle dark casing in light theme to guarantee it
reads. Contrast ratios are specified and tested in
[`23_ACCESSIBILITY.md`](../23_ACCESSIBILITY.md).

**Negative.** Condensed uppercase micro-labels are harder to read at small sizes and for users
with dyslexia. They are therefore confined to short metric labels, never to body copy, and
minimum sizes and letter-spacing are fixed in [`07_DESIGN_SYSTEM.md`](../07_DESIGN_SYSTEM.md).

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Monochrome with red as the only accent (reference 1 verbatim) | Strongest identity; most faithful to the preferred reference | On maps, red is the established convention for heavy traffic and hazards. A red route line is ambiguous, and using red decoratively would leave no colour available for genuine warnings. |
| Indigo accent (reference 2) | Familiar, friendly, strong on light backgrounds | Loses presence on the near-black dark-theme map, where mint holds. Also the most common accent in this product category, so the least distinguishing. |
| User-selectable accent | Personalisation is welcome in professional tools | Doubles the visual test matrix, complicates store screenshots, and dilutes brand recognition — for a preference few users would change. Reconsider post-launch if requested. |
| Full-colour conventional map style | Familiar; better landmark legibility | Indistinguishable from Google Maps, which is the one thing this product must not look like. The quiet map is the identity. |

## References

- [`docs/07_DESIGN_SYSTEM.md`](../07_DESIGN_SYSTEM.md) — tokens, type scale, contrast
- [`docs/06_UX_GUIDELINES.md`](../06_UX_GUIDELINES.md) — interaction principles
- [`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md) — map styles and Map IDs
- [ADR-0010](0010-mobile-only-scope.md) — why the stop list is never a sidebar
