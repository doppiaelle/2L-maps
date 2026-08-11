# ADR-0028 — A public-domain coastline under a Google-derived route

**Status:** Accepted
**Date:** 2026-08-11
**Amends:** [ADR-0012](0012-long-term-osm-exit-path.md) — the hybrid it rejects by name
**Related:** [ADR-0021](0021-drawn-route-preview.md), [ADR-0007](0007-place-id-durable-coordinates-perishable.md)
**Risk:** widens C3

## Context

[ADR-0021](0021-drawn-route-preview.md) replaced the map engine with a canvas we
draw ourselves, and the wave after it invented a town — a grid of streets and
blocks generated from the route, fading with distance, explicitly not real.

On a delivery round that works. On a route from Rome to Milan to Bari it does
not, and the product owner said so plainly: *"lo sfondo è rimasto vuoto con dei
quadrati sparsi"*. The reason is in one constant. The grid's cell is **78
points**, fixed, so a "block" is a plausible city block at 20 km across and about
**a hundred kilometres** at 900 km. The scenery was blind to scale, and at
national scale it drew squares the size of regions on an otherwise empty
rectangle.

Withdrawing the scenery above a threshold fixes the lie. It does not fix the
emptiness: a mint line and three pins on a flat colour say nothing about
*where*, and the product owner asked for **"almeno una semiforma che ricordi la
nazione"**.

**We cannot draw that from the route.** The only geography this product holds is
the stops themselves and the road polyline between them. A coastline has to come
from somewhere else — and putting Google-derived content on somebody else's
geometry is exactly the hybrid [ADR-0012](0012-long-term-osm-exit-path.md)
rejects by name:

> Hybrid: Google for search and routing, MapLibre for rendering — **Prohibited.**
> The "No Use With Non-Google Maps" clause applies per API — Google-derived
> routes and coordinates cannot be displayed on a non-Google map.

`CLAUDE.md` §13 rule 5 says of the exposure ADR-0021 already accepted: **"Do not
widen it."** This widens it. That is the decision, and it was the product owner's
to take.

## Decision

**A coastline is drawn under the route at the scale where the invented town is
withdrawn.** Natural Earth 1:110m land polygons, simplified and bundled, drawn as
filled outlines on a water-coloured ground.

The two backgrounds **take turns and never both draw**: streets below 60 km of
canvas span — about the largest round a van works in a day, so the case this
product is *for* keeps its town — and coastline above it.

**What it is:**

- One shape per landmass, at a resolution where Italy is a boot and nothing
  smaller than a large island survives. **No borders, no roads, no place names,
  no lakes.**
- A **committed asset** (`assets/geo/land.json`, 66 KB, 127 rings, 4,585 points)
  built by a **committed script** (`scripts/build-landmass.mjs`). A generated
  file with no script beside it is one nobody can regenerate and nobody dares
  change.
- **Public domain.** The dataset's own `LICENSE.md` — read, not recalled — says
  *"No permission is needed to use Natural Earth. Crediting the authors is
  unnecessary."* A copy is kept beside the asset for the record.
- **Never fetched.** No network at runtime, no tile, no map service, no key.
- Clipped to the visible box before projecting, so the whole world is rejected by
  a bounding-box test rather than by projecting 4,585 points to discover that
  Australia is off screen.

**What is unchanged, and this is the part that bounds the risk:**

- Google's attribution stays wherever Google-derived content appears. The ground
  changing does not change where the route came from.
- No tile is fetched or cached, ever.
- The thirty-day coordinate rule ([ADR-0007](0007-place-id-durable-coordinates-perishable.md))
  is untouched.
- Nothing about the route, the stops or the geometry changes. Only what is
  underneath them.

## Consequences

**Good.**

- The wide view says where it is. A driver looking at Rome–Milan–Bari sees the
  peninsula, which is the difference between a diagram and a map of their day.
- The scenery stops making a claim it cannot support at any scale.
- No network, no licence obligation, no key, no per-view cost. The asset is
  66 KB and the export grew by about 0.2 MB including the gesture work shipped
  with it.

**Bad, and accepted.**

- **This is the hybrid ADR-0012 prohibits.** Google-derived stops and road
  geometry are now drawn over non-Google geometry. Risk **C3** — revocation of
  the Maps Platform key, which stops the app for every user at once — was already
  accepted for the drawn preview; it is **larger now**, because the drawing looks
  more like a map than it did.
- **`CLAUDE.md` §13 rule 5 said not to do this** and has been amended in the same
  change rather than quietly worked around (`CLAUDE.md` §15).
- The coastline is coarse, and on a route inside one region it is withdrawn
  entirely — so the wide view improves and the medium view, between 60 km and
  national scale, is the weakest of the three.

## What was rejected

| Option | Why not |
|---|---|
| Leave the wide view empty | It was the reported defect. A mint line on a flat rectangle says nothing about where the day is |
| Scale the invented town to the ground instead of to pixels | Honest, and it produces a smudge of streets along the route at 900 km — better than squares, still not a country |
| A real map underneath (MapLibre, OSM tiles) | The same prohibition, plus tiles, a key, a network dependency and an offline story. Strictly worse on every axis than a bundled outline |
| Bundle only Italy | Smaller, and wrong the first time anyone drives in France. The whole world at this resolution is 66 KB |
| Ask Google for a static map image | A billed call per view, on the screen the user looks at most, and it reintroduces the tile rule |

## References

- `assets/geo/LICENSE-natural-earth.md` — the dataset's own terms, as published
- [`lib/map/landmass.ts`](../../lib/map/landmass.ts) — the clip and projection
- [`lib/map/scenery.ts`](../../lib/map/scenery.ts) — `SCENERY_MAX_SPAN_METRES`, the handover
- [`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md) — the terms in full
