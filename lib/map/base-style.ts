import { mapColours } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * The base map style, as JSON, in version control.
 *
 * **This replaces the Cloud Map ID as the thing that has to exist.** The design
 * called for Cloud-based Map Styling, one Map ID per theme, created by hand in
 * the Google Cloud console — which made the product's appearance depend on a
 * setup step outside the repository. Two consequences, and both landed:
 *
 * - Nobody had created them, so the shipped app drew Google's default map:
 *   saturated motorways, a field of restaurant pins, nothing like the designed
 *   product. The fallback for a missing Map ID is "Google's default", and a
 *   fallback that is silent and permanent is just the real behaviour.
 * - It was recorded as **risk C15**: a console edit changes the shipped app with
 *   no code review, and no way to tell from the repository what the map looks
 *   like.
 *
 * A JSON style has neither problem. It is reviewed like everything else, it
 * needs no console, and it cannot drift from the palette because it is built
 * from the same tokens (`CLAUDE.md` §8 rule 1).
 *
 * A Map ID still wins where one is configured — Cloud styling overrides JSON —
 * so the seam the document wanted is intact for anyone who wants it. It is now
 * an enhancement rather than a prerequisite.
 *
 * ## What the style says, and why
 *
 * **The map is quiet** (`CLAUDE.md` §8 rule 5). Every decision below serves
 * that, and the removals matter more than the colours:
 *
 * - **Points of interest are off.** Not muted — off. A driver looking for stop
 *   seven does not need a pizzeria icon next to it, and every pin the SDK draws
 *   is a pin competing with ours. This is the single biggest difference from the
 *   default map.
 * - **Transit is off**, for the same reason: this product routes a van, and a
 *   bus network is noise drawn over the answer.
 * - **Road labels survive.** Street names are how a driver confirms the route
 *   matches the world. Cutting them would be quiet at the cost of useful.
 * - **Nothing is red.** Red means error or warning in this product and nothing
 *   else ([ADR-0009](../../docs/adr/0009-visual-direction.md)), so the default
 *   map's red-orange motorways would put the one reserved colour under the route
 *   line, at the exact moment a warning has to be unmistakable.
 */

/** One entry of Google's `customMapStyle` array. */
export interface MapStyleElement {
  readonly featureType?: string;
  readonly elementType?: string;
  /** Mutable because `react-native-maps` types `customMapStyle` that way, and a
   *  `readonly` array cannot be handed to it. Nothing mutates these; the array
   *  is rebuilt per call, so there is no shared state to protect. */
  stylers: Record<string, string | number>[];
}

/**
 * The style array for a theme.
 *
 * Rebuilt per call rather than memoised: it is a few dozen small objects, built
 * once per theme change, and a shared frozen array handed to a native module is
 * a harder thing to reason about than the allocation is to pay for.
 */
export function baseMapStyle(theme: ThemeName): MapStyleElement[] {
  const map = mapColours[theme];

  return [
    // ── Everything, first, so later rules refine rather than fight a default ──
    { elementType: 'geometry', stylers: [{ color: map.land }] },
    { elementType: 'labels.text.fill', stylers: [{ color: map.label }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: map.labelHalo }] },
    // The icon beside a label is decoration on every feature we keep. The text
    // carries the information.
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

    // ── Off entirely ──
    // Muting these would still draw them, and "drawn but faint" is what a
    // cluttered map looks like from a moving vehicle.
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    // Kept as geometry — a park is a useful landmark — with its name removed.
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: map.park, visibility: 'on' }],
    },

    // ── Land use ──
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: map.land }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: map.water }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: map.label }] },

    // ── Roads, in three weights ──
    // The hierarchy is the one thing the map still has to communicate: which
    // line is a motorway and which is a lane, at a glance, without colour.
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: map.roadMinor }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: map.road }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: map.road }] },
    // The default's red-orange motorway casing. Removed rather than recoloured:
    // red is reserved for error and warning (ADR-0009).
    {
      featureType: 'road.highway',
      elementType: 'geometry.stroke',
      stylers: [{ visibility: 'off' }],
    },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: map.label }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

    // ── Administrative ──
    // Borders drawn, filled areas not: a region boundary orients, a tinted
    // province competes with the route.
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    {
      featureType: 'administrative.land_parcel',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: map.label }],
    },

    // ── What is left after everything above ──
    // Google's default map carries a colour cast even once every feature is
    // recoloured: shields, ferry lines, airport aprons and a dozen features with
    // no `featureType` of their own keep their own hues, and the result is a map
    // that is *nearly* ours. Desaturating what remains is what closes the gap
    // between "restyled Google map" and the abstract black-white-and-mint
    // surface the product was designed around
    // ([ADR-0009](../../docs/adr/0009-visual-direction.md)).
    //
    // Last in the array on purpose: `customMapStyle` applies rules in order, so
    // this refines the colours set above rather than being overwritten by them.
    { elementType: 'geometry', stylers: [{ saturation: -100 }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -100 }] },
  ];
}
