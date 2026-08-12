# 39 — UI Reimplementation Gap

> **Status:** Superseded by [`40_UI_IMPLEMENTATION_AUDIT.md`](40_UI_IMPLEMENTATION_AUDIT.md)
> **Owner:** Mobile / Design  
> **Last reviewed:** 2026-08-12  
> **Priority:** The approved Figma layout and supplied visual brief override legacy screen layouts.

## 1. Why this document exists

The first UI change was incorrectly described as a UI reimplementation. It only added four
isolated behaviours to the existing interface: a two-item dock, a Settings shortcut, a theme
selector, and an optimization reset. It did not rebuild the screen compositions shown in Figma.
Passing CI proved that those incremental changes compiled and that existing behaviour remained
covered; it did not prove visual equivalence.

## 2. What is still legacy

### Login

- No supplied app logo or Figma logo lockup is rendered.
- The centered brand card, tagline, supporting copy, and compact Google action are absent.
- Spacing, scale, hierarchy, and surface treatment do not match frame 01.

### Route

- The Figma header (`2L` mark, Maps wordmark, Settings utility) is absent.
- The page is still driven by the legacy summary/route-ends layout rather than the compact
  `Your route` composition.
- Search is still a separate full-screen modal. The required 02A state—search field and elevated
  results dropdown over a dimmed but visible Route list—does not exist.
- Stop rows, numbering, reorder affordances, ready-state card, spacing, and bottom CTA group have
  not been rebuilt to the Figma component geometry.
- Reset currently appears only after optimization; its visual integration still needs device-level
  comparison against the CTA pair.

### Optimized Map

- Route geometry, pan, zoom, numbered stops, and deterministic scenery already exist, but the
  renderer is not yet the specified procedural city generator.
- The current scenery is predominantly a jittered grid of line segments and rectangles. It does
  not construct connected road corridors, road-bounded blocks, buildings inside those blocks,
  squares, parks, and contextual terrain as one coherent urban graph.
- Recenter, zoom controls, compass, scale, the bottom itinerary card, progress treatment, and the
  Figma confirm/open-navigator composition are incomplete or absent.
- The result therefore does not yet satisfy the visual acceptance test: “urban navigation map with
  a mint itinerary” must be immediate without knowing how it was generated.

### History

- Route cards have not been rebuilt to the compact Figma cards with name, time/date, mint metrics,
  stop count, and trailing action.
- Empty, offline, loading, and populated states still use the legacy full-page StateView hierarchy.

### Settings

- The theme selector works, but the rest of the screen remains the legacy text-row layout rather
  than the grouped rounded Navigation and Account surfaces in frame 05.
- Navigation-provider choices are still opened in another modal instead of appearing as the
  compact selected list shown in the approved layout.

### Global system

- The supplied logo assets were never imported or normalized for application use.
- Screen-specific Figma measurements were not translated into reusable layout/component tokens.
- Typography still uses the repository's previous large condensed presentation rather than the
  compact hierarchy visible in the approved frames.
- Emoji/text glyphs remain in navigation and utility controls instead of a coherent icon set.
- Light and dark were functionally wired, but neither theme received a complete screen-by-screen
  visual implementation and comparison.

## 3. Correct implementation sequence

1. Capture measurable references for all six final Figma frames and define a visual checklist for
   light and dark Android.
2. Add the approved logo assets and rebuild shared AppHeader, IconButton, Dock, card, input, row,
   segmented selector, and CTA primitives.
3. Rebuild Login, Route, Search Open, History, and Settings compositions without changing their
   existing service/store contracts.
4. Replace the scenery grid with a route-conditioned procedural urban graph: connected arterials
   and secondary roads → bounded blocks → buildings/parks/squares inside blocks.
5. Complete map chrome and the selected-leg/bottom-summary interaction.
6. Add screenshot-based Android visual checks for each screen/state and both themes. Unit tests and
   typechecking remain required, but are not visual acceptance evidence.

## 4. Acceptance gate

The reimplementation is not complete until Android screenshots for Login, Route, Search Open,
Optimized Map, History, and Settings are compared with the approved references at the same viewport.
CI success alone cannot close this item.

## 5. Resolution

The missing runtime compositions and procedural map generator were implemented on 2026-08-12.
Current source/build/device evidence and the physical-phone checklist live in
[`40_UI_IMPLEMENTATION_AUDIT.md`](40_UI_IMPLEMENTATION_AUDIT.md); this document remains as the
root-cause record for the first incomplete pass.
