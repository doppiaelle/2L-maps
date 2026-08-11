# ADR-0021 — The route preview is drawn by us, not rendered by Google

**Status:** Accepted
**Date:** 2026-08-10
**Decided by:** the product owner, against the recommendation recorded below
**Reverses:** [ADR-0005](0005-map-engine-and-route-preview.md) §Decision
**Amends:** `CLAUDE.md` §9 rule 1 and §13 rule 5, `CR-03` in [`docs/01_PRODUCT_REQUIREMENTS.md`](../01_PRODUCT_REQUIREMENTS.md), risk **C3** and risk **C15** in [`docs/35_RISK_REGISTER.md`](../35_RISK_REGISTER.md), [`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../14_GOOGLE_MAPS_INTEGRATION.md), [`docs/32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md)
**Related:** [ADR-0007](0007-place-id-durable-coordinates-perishable.md), [ADR-0009](0009-visual-direction.md), [ADR-0012](0012-long-term-osm-exit-path.md)

## Context

The first build on a real phone opened on a black rectangle. Some of that was
defects — the Maps SDK never signalling ready, and a dark style whose land and
roads sat 1.4:1 apart — and both were fixed. What remained was a product
decision the owner had been circling since the visual direction was written: the
map does not look like the product.

That is not a misreading of the design. [ADR-0009](0009-visual-direction.md)
asks for a map "desaturated to the point where roads are barely visible", with
"the map deliberately receding to become a quiet background", and says plainly
that a conventional full-colour map is "indistinguishable from Google Maps,
**which is the one thing this product must not look like**". A restyled Google
map is the closest that direction can get while Google is doing the drawing, and
the owner's judgement, holding the device, was that it is not close enough.

**The recommendation was against this.** It was made in these terms and is
recorded here rather than paraphrased:

The Google Maps Platform terms forbid displaying Google Maps Content on a
surface that is not a Google map, and the clause applies **per API** — it recurs
for Places, Directions and Geocoding separately. This project has recorded that
constraint four times over: `CR-03` as a compliance requirement, risk **C3** in
the register, rule 5 of `CLAUDE.md` §13, and
[ADR-0012](0012-long-term-osm-exit-path.md), which rejects by name the exact
shape being proposed here —

> Hybrid: Google for search and routing, MapLibre for rendering — **Prohibited.**
> The "No Use With Non-Google Maps" clause applies per API — Google-derived
> routes and coordinates cannot be displayed on a non-Google map.

The stop coordinates come from Places and the road geometry from Routes. That a
canvas is hand-drawn SVG rather than MapLibre does not move it to the other side
of that sentence. The compliant path to a drawn map is the one ADR-0012 already
describes: replace the geocoder and the router at the same time, which is a
migration measured in months and which forfeits Italian address quality and live
traffic.

Three alternatives were offered and one was recommended:

1. **A Google map stripped to nothing** — every feature off, land and water in
   our own greys, our mint route and numbered pins on top. Visually most of what
   was wanted, legally unchanged, and `lib/map/base-style.ts` was already half of
   it. **This was the recommendation.**
2. **A sequence diagram** — stops, order, and per-leg distance and time, with no
   geographic positioning at all. Defensible on the reasoning in
   [ADR-0007](0007-place-id-durable-coordinates-perishable.md) that the *ordering*
   is user-authored content rather than Google's. Loses the geography, which
   [`docs/14`](../14_GOOGLE_MAPS_INTEGRATION.md) calls the product's moment of
   trust.
3. **Build it as asked**, with the risk written down.

The owner chose the third, having been told that the typical sanction is
revocation of the Maps Platform key — which stops the app working for every user
at once — and that the question is one for a lawyer rather than for an
architecture document.

## Decision

**The route preview is drawn from our own geometry, on our own canvas, and
Google Maps is removed from the client entirely.**

- `components/map/RouteCanvas.tsx` draws the stops at their projected positions
  and the path between them, in SVG. No tiles, no roads, no labels.
- `lib/map/projection.ts` and `lib/map/simplify.ts` are the pure halves —
  equirectangular projection corrected for latitude, and Ramer–Douglas–Peucker
  bounded at 1,500 points.
- `react-native-maps`, `AppMap`, the JSON base style, the Cloud Map IDs and the
  viewport clustering are deleted.

**The attribution stays.** `<MapAttribution>` moves onto the canvas. The
obligation attaches to Google-derived content being displayed, and the content is
still Google-derived; the renderer changing does not change where the data came
from. It costs six points in a corner, and removing it would add a second
violation to a risk already taken rather than reduce the first.

**The thirty-day coordinate rule is untouched** and, if anything, is now enforced
in more places: the preview draws only what `isCoordinateFresh` still allows, and
a stop whose coordinate has expired is named on the canvas rather than silently
omitted.

## Amended by ADR-0027 — what the canvas gained

Two things, neither of which reopens the decision above and both of which use data already in
hand.

**A waiting face.** The canvas is drawn at the same size from the same stops while an
optimization is in flight, so nothing moves when the result lands. It claims nothing while it
waits: neutral connectors rather than the degraded style, no ordinals, no navigator triangle —
which stop comes first is the question being asked.

**Inspectable legs.** `routes.legs` has always carried a distance, a duration and a polyline
per hop and the canvas drew them as one line. Tapping one now shows what Google measured for
it. **This widens no exposure**: the same Google-derived geometry, on the same canvas we draw,
attributed the same way, with no tile fetched and no coordinate kept beyond thirty days. The
risk this ADR records is unchanged in kind and in size.

## Consequences

**The client holds no Google credential at all.** `CLAUDE.md` §9 rule 1 carved
out exactly one — the Maps SDK rendering key, restricted by bundle ID and SHA-1 —
and it existed to let the SDK draw tiles. There is no SDK. The key and both
restrictions are gone, which is a stronger position than the rule asked for, and
the rule is amended to say so.

**Risk C15 is closed.** It was that map styling lived in a Google console,
outside version control, where an edit changed the shipped app with no review.
There is no console style left; the preview's appearance is entirely in this
repository and entirely under test.

**Risk C3 is now realised rather than mitigated.** The register described it as
"any pull request introducing a second map engine → blocked at review". This
change is that pull request, and it was not blocked. C3 is rewritten from a risk
to be avoided into an exposure being carried, with the mitigation stated as what
it actually is: none, beyond the attribution and the option to revert.

**Reverting is a `git revert` of one commit.** The removal was committed on its
own for exactly this reason. What would not come back automatically is the Maps
API key and its restrictions, which have to be reissued in the Cloud console.

**Two things improve on their own.** The preview needs no network, so it works in
a basement car park — which is more than the map it replaces could do — and it
costs nothing per view, where tiles were metered.

**What is lost.** Pan and zoom, which `docs/14` argued were how a user comes to
trust an order, and the road context a driver uses to orient — the legibility
floor in `docs/14` §5 asked for road hierarchy and major labels to stay readable,
and a canvas with neither sits below it by construction. Both are stated here
rather than argued away: they are the price of the decision, and the owner is the
one entitled to pay it.
