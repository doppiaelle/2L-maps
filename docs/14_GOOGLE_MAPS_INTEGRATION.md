# 14 — Google Maps Integration

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0005](adr/0005-map-engine-and-route-preview.md) · [ADR-0009](adr/0009-visual-direction.md) · [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md)

---

## 1. Purpose

This document specifies everything the product does with Google Maps: map rendering, styling,
markers, clustering, polylines, camera, layers, and the terms obligations that constrain all of
it.

The map is a **preview surface**, not a navigation surface. It exists so the user can see and
trust the order before driving it ([ADR-0004](adr/0004-external-navigation-handoff.md)).

## 2. Goals

1. Render the optimized route so its correctness is obvious at a glance.
2. Deliver the quiet monochrome aesthetic of [ADR-0009](adr/0009-visual-direction.md) without
   sacrificing driver legibility.
3. Keep every map interaction at 60 fps with 25 markers.
4. Isolate `react-native-maps` behind `<AppMap>` so the known Expo fragility stays contained.
5. Satisfy every attribution and content obligation in the platform terms.

**Non-goals.** No turn-by-turn rendering, no offline tiles, no third-party map engine.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Map rendering | `<AppMap>` facade | The only module importing `react-native-maps` |
| Style definition | Cloud console, one Map ID per theme | Outside version control — see C15 |
| Marker and cluster logic | `<AppMap>` | Product vocabulary, not library vocabulary |
| Attribution | `<AppMap>` and export | Non-negotiable |
| API key restriction | [`19_SECURITY.md`](19_SECURITY.md) | Bundle ID and SHA-1 |

---

## 4. Text diagrams

### The facade boundary

```
  Screens ──▶ <AppMap>  ─────────────────────┐
              │  props in product terms:      │  Nothing else in the
              │    stops, selectedStopId,     │  codebase imports
              │    route, theme, layers       │  react-native-maps.
              │  events:                      │  Enforced at review;
              │    onStopPress, onMapPress    │  linted in phase 2.
              ▼                               │
        react-native-maps ──▶ Google Maps SDK │
                                (iOS/Android) ┘
```

### Map layer order

```
  ┌──────────────────────────────────────────┐  ← top
  │  attribution (always visible, never       │
  │  obscured by the sheet)                   │
  ├──────────────────────────────────────────┤
  │  selected stop callout                    │
  ├──────────────────────────────────────────┤
  │  stop markers (numbered) / clusters       │
  ├──────────────────────────────────────────┤
  │  route polyline  ── mint, with casing     │
  ├──────────────────────────────────────────┤
  │  traffic layer (optional)                 │
  ├──────────────────────────────────────────┤
  │  base map ── paper-white / near-black     │  ← bottom
  └──────────────────────────────────────────┘
```

---

## 5. Flows

**How a route reaches the map.**

```
  optimization result (13) ──▶ encoded polyline
                                     │
                                     ▼
                       decoded once, at receipt, then memoised
                                     │
                                     ▼
              drawn on a Google map — never a third-party map (terms)
                                     │
                                     ▼
              markers memoised by id and state; clustered above 15
                                     │
                                     ▼
              camera fitted to bounds with padding for the sheet's current detent
```

**How a map style is applied.** The paper and near-black styles are Cloud-based Map Styling,
selected by Map ID per theme. They live outside version control, which is risk C15 — so the Map
IDs are recorded here, the styles are exported into the repository as reference, and a missing
or revoked Map ID falls back to the default style rather than a blank map.

**What the terms forbid at every step.** No tile caching, no bulk pre-fetch, no Google-derived
content on a non-Google map, and attribution visible wherever the map or its data appears —
including in a shared snapshot ([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)).

## 6. Map styling

The paper aesthetic is delivered by **Cloud-based Map Styling**, configured in the Google Cloud
console and referenced by **Map ID**, one per theme.

| Theme | Base | Roads | Labels | POIs | Route |
|---|---|---|---|---|---|
| Light | Near-white paper | Barely visible pale grey; hierarchy preserved | Pale grey, minimal | Suppressed except transit and fuel | Mint with a dark casing |
| Dark | Near-black | Mid grey lines | Mid grey | Same suppression | Mint, no casing needed |

**POI suppression is deliberate.** The reference aesthetic is quiet, and every restaurant pin
competes with the stop markers that matter. Fuel and transit are retained because they are
operationally useful to a driver.

**The legibility floor.** Desaturation cannot go so far that a driver loses orientation.
Road hierarchy must remain distinguishable and major labels readable, verified **in direct
sunlight on a physical device**, not on a desk monitor
([`23_ACCESSIBILITY.md`](23_ACCESSIBILITY.md)).

**Risk C15 — styles live outside version control.** A console edit changes the shipped app with
no code review, and an unresolvable Map ID silently changes appearance. Mitigations: Map IDs and
their intended appearance are documented here; a failed style resolution falls back to the
default Google style without a user-facing error; style changes are treated as reviewable
events.

---

## 7. Markers

| Type | Appearance | State |
|---|---|---|
| Origin | Filled circle, distinct from stops, no number | — |
| Stop, pending | Numbered pin, ordinal = visiting order, neutral fill | Default |
| Stop, selected | Mint fill, enlarged, raised z-index | Selected |
| Stop, completed | Mint with a **checkmark** | Completed |
| Stop, unreachable | Outlined, muted, with a warning glyph | Unreachable |
| Cluster | Circle with a count | Above 15 markers |

**Never colour alone.** A completed stop carries a checkmark as well as mint fill; an
unreachable stop carries a glyph as well as muting. A user with deuteranopia must be able to
read the map ([`../CLAUDE.md`](../CLAUDE.md) §10).

**Numbers renumber on optimization.** After optimizing, marker 1 is the first stop in the new
order, not the first stop the user entered. This is the visible proof that the optimization
happened.

**Touch targets are 44×44 pt minimum**, independent of the pin's visual size. The hit area is
larger than the artwork.

### Clustering

Clustering activates above 15 markers. A cluster tapped once zooms to its bounds; a cluster
that cannot expand further (identical coordinates) opens a list instead.

Clustering must never hide the **selected** stop: a selected marker is always rendered
individually, outside its cluster.

---

## 8. Polyline

| Property | Value |
|---|---|
| Source | `encodedPolyline` from the phase-2 Routes API response |
| Colour | Mint accent |
| Casing | Dark 1 pt outline in light theme, for contrast against paper-white |
| Width | Scales with zoom, within bounds |
| Caps and joins | Rounded |
| T0 (degraded) | **Dashed straight connectors**, visually distinct — never a fake road-following line |

The T0 distinction is a correctness requirement, not a style choice. A straight-line ordering
drawn as a smooth road-shaped curve would imply road routing that did not happen
([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)).

**Decoding happens once**, at result receipt, and is memoised. Decoding on every render is the
most common cause of map jank in this class of app.

---

## 9. Camera, gestures and layers

**Camera.** On a new result the camera fits the whole route with padding that accounts for the
sheet's current detent — a route fitted behind a half-open sheet is fitted wrongly. After any
user gesture the camera stops following automatically; a **Recenter** control returns it. The
map never moves under the user's finger.

**Gestures.** Pan, pinch zoom, rotate and tilt are all enabled. Every gesture-driven action has
a non-gesture equivalent ([`../CLAUDE.md`](../CLAUDE.md) §7).

**Layers.**

| Layer | Default | Notes |
|---|---|---|
| Traffic | Off | Native SDK layer, no additional cost. Disabled with an explanation when offline |
| Satellite | Off | Phase 1.2. Conflicts with the paper aesthetic, so it is a deliberate user choice |
| Incidents | Not available | Not exposed by the Maps SDK as a separate layer; visible within the traffic layer only. **Recorded here because the original brief asked for it** |
| Buildings, indoor | Off | Noise for this use case |

---

## 10. Terms obligations

**Non-negotiable**, and all traced to [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md).

1. **Google attribution is always visible** on any surface showing Google map content, and is
   never obscured by the bottom sheet at any detent.
2. **No tile caching, no bulk pre-fetch** ([ADR-0008](adr/0008-offline-scope.md)).
3. **Coordinates cached at most 30 days**
   ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).
4. **Google content never appears on a non-Google map** — this is why `expo-maps` is excluded on
   iOS, where it renders Apple Maps.
5. **Exported snapshots carry attribution burned into the image** (risk C14).
6. The Maps SDK key is restricted to bundle ID and signing certificate, and scoped to Maps SDK
   APIs only.

---

## 11. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps` behind `<AppMap>` | Every rendering concern here |
| [0004](adr/0004-external-navigation-handoff.md) | Preview in-app, navigation elsewhere | Why the map is a preview surface, not a guidance surface |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates perishable | Markers must tolerate a null coordinate |
| [0008](adr/0008-offline-scope.md) | No offline maps | The absence of tile caching, and the offline map state |
| [0009](adr/0009-visual-direction.md) | Quiet map, single accent | Map styling, marker and polyline colour |
| [0012](adr/0012-long-term-osm-exit-path.md) | MapLibre exit path | Why styling is expressed as intent, not as a vendor payload |

**Decided here:** the single Maps SDK key is the only Google credential in the client, and it is
restricted by bundle ID and SHA-1 to the Maps SDK alone. Every other Google call is a server
call ([ADR-0006](adr/0006-mandatory-backend-proxy.md)).

## 12. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Map ID fails to resolve | Default Google style, no user-facing error, logged |
| 2 | 25 markers in a small area | Clustering; selected marker always rendered individually |
| 3 | Two stops at identical coordinates | Cluster cannot expand; opens a list instead |
| 4 | Route spans a very large area | Camera fits with a minimum zoom floor so context is retained |
| 5 | Offline | Map shows an explicit offline state, never a blank grey field |
| 6 | Theme changes while the map is open | Map ID swaps without remounting; camera position preserved |
| 7 | T0 result | Dashed connectors, degraded label, no polyline |
| 8 | Sheet at full detent | Camera padding recomputed; attribution remains visible |
| 9 | Very long stop label in a callout | Truncated with ellipsis; full text in the sheet row |
| 10 | Rapid marker selection | Debounced; only the final selection animates |

## 13. Error handling

| Failure | Detection | User-facing result | Fallback |
|---|---|---|---|
| Map fails to initialise | SDK callback | Explicit error state with retry; the stop list remains fully usable | List-only mode |
| Map ID unresolvable | SDK | None — silent | Default style |
| Polyline decode fails | Decode exception | Markers render; no line; logged as a defect | Markers only |
| Tiles fail to load | SDK | Offline state | Cached tiles the OS happens to hold |
| Snapshot export fails | API result | Named error; the route is unaffected | Retry |

**The stop list must remain fully functional when the map fails.** The list is the product; the
map is the preview.

## 14. Best practices

1. **Nothing imports `react-native-maps` except `<AppMap>`.** This is rule 2 in
   [`../CLAUDE.md`](../CLAUDE.md) §0.
2. **Memoise markers and decoded polylines.** Recreating them per render is the dominant cause
   of map jank.
3. **Never pin Expo SDK and `react-native-maps` independently** — upgrade them as a pair with a
   verified build on both platforms (risk C6).
4. **Account for the sheet detent in camera padding.**
5. **Verify legibility outdoors**, not only on a desk.
6. **Never rely on colour alone** for marker state.
7. **Attribution is never covered**, at any detent, in any state.

## 15. Checklist

- [ ] `<AppMap>` is the only importer of `react-native-maps`.
- [ ] Map IDs configured for both themes and documented here.
- [ ] Fallback to default style verified with an invalid Map ID.
- [ ] Markers memoised; polyline decoded once and memoised.
- [ ] 60 fps verified with 25 markers on a mid-range device.
- [ ] Touch targets ≥ 44×44 pt.
- [ ] Marker states distinguishable without colour.
- [ ] T0 renders dashed connectors, never a smooth polyline.
- [ ] Attribution visible at every sheet detent.
- [ ] Contrast verified in direct sunlight.
- [ ] No tile caching or pre-fetching anywhere in the codebase.

## 16. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Rendering, both styles, markers, clustering, polyline, camera, traffic layer | — |
| 1.2 | Satellite toggle; snapshot export with burned-in attribution | Feature demand |
| 1.x | Marker animation on reorder — the visual proof of optimization | Polish |
| 3.0 | MapLibre adapter behind the same facade | An [ADR-0012](adr/0012-long-term-osm-exit-path.md) trigger |

## 17. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | `react-native-maps` behind `<AppMap>` | Only engine rendering Google Maps on both platforms; facade contains Expo fragility | Architecture |
| 2026-08-06 | Cloud-based Map Styling with one Map ID per theme | Required for the paper aesthetic; accepted risk C15 | Architecture |
| 2026-08-06 | POIs suppressed except fuel and transit | Aesthetic quiet plus marker legibility; those two are operationally useful | Design |
| 2026-08-06 | T0 rendered as dashed connectors | A smooth line would imply road routing that did not occur | Architecture |

## 18. Rationale

The map's job is **trust**, not navigation. A user who has just been told to visit their stops
in an unexpected order needs to see that order laid out geographically before they will drive
it. Everything in this specification serves that single moment: numbered markers that renumber
visibly, a route line that reads instantly, and a base map quiet enough that neither competes
with it.

The desaturated style is not only aesthetic. A conventional Google Maps style is chromatically
busy, and a mint route line over it competes with orange arterials and green parks. On a paper
base, the route is the only saturated element on the screen and reads in a glance — which is
what a driver has.

The facade is justified by risk C6 rather than by architectural purity. `react-native-maps` has
current, documented breakage against recent Expo SDKs, and the only alternatives are excluded —
`expo-maps` renders Apple Maps on iOS, which the terms forbid for Google content, and the
Navigation SDK cannot coexist with the Maps SDK. Being locked to a fragile dependency with no
substitute makes containment worth its cost.

## 19. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| `expo-maps` | First-party; tracks Expo SDK releases; no plugin fragility | Alpha, and renders Apple Maps on iOS — displaying Google-derived routes on it violates the terms |
| Navigation SDK map component | One native SDK; resolves the Expo compatibility problem | Excluded by [ADR-0004](adr/0004-external-navigation-handoff.md); clustering and custom marker support unproven |
| MapLibre with OSM tiles | Full style control; legal offline tiles | Cannot display Google-derived content. Requires the full stack migration in [ADR-0012](adr/0012-long-term-osm-exit-path.md) |
| Conventional Google style | Familiar; better landmark legibility | Indistinguishable from Google Maps, and the mint route competes with the base map's colours |
| Static map images instead of an interactive map | Trivially cheap and simple | The user must pan and zoom to trust the route; a static image cannot deliver the trust moment |
| JSON style objects instead of Cloud Map IDs | Version-controlled; reviewable | Deprecated in favour of cloud styling for the mobile SDKs, and would forfeit runtime style updates |
