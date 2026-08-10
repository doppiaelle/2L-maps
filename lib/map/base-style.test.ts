import { baseMapStyle } from './base-style';
import { colours, mapColours } from '@/lib/design/tokens';

/**
 * The base map style.
 *
 * The properties worth protecting are the ones that decide whether the map is
 * the product's own or Google's: what is switched off, and that nothing in it is
 * red. Colour equality per feature is not tested — that would restate the file
 * rather than check it.
 */

const themes = ['light', 'dark'] as const;

describe('what the map does not draw', () => {
  it.each(themes)('switches points of interest off entirely in %s', (theme) => {
    // Muted is not enough: a muted pin is still a pin next to our stop marker,
    // and the default map draws hundreds of them (CLAUDE.md §8 rule 5).
    const poi = baseMapStyle(theme).find(
      (entry) => entry.featureType === 'poi' && entry.elementType === undefined,
    );

    expect(poi?.stylers).toContainEqual({ visibility: 'off' });
  });

  it.each(themes)('switches transit off in %s, because this product routes a van', (theme) => {
    const transit = baseMapStyle(theme).find((entry) => entry.featureType === 'transit');
    expect(transit?.stylers).toContainEqual({ visibility: 'off' });
  });

  it.each(themes)('keeps parks as geometry in %s — a landmark, without its label', (theme) => {
    const park = baseMapStyle(theme).find(
      (entry) => entry.featureType === 'poi.park' && entry.elementType === 'geometry',
    );

    expect(park?.stylers).toContainEqual({ color: mapColours[theme].park, visibility: 'on' });
  });

  it.each(themes)('keeps road labels in %s, which is how a driver confirms the turn', (theme) => {
    const roadText = baseMapStyle(theme).find(
      (entry) => entry.featureType === 'road' && entry.elementType === 'labels.text.fill',
    );

    expect(roadText).toBeDefined();
    expect(roadText?.stylers).not.toContainEqual({ visibility: 'off' });
  });
});

describe('the one colour that may not appear', () => {
  it.each(themes)('uses no red anywhere in %s', (theme) => {
    // Red means error or warning in this product and nothing else (ADR-0009).
    // Google's default motorway casing is red-orange, which would put the
    // reserved colour underneath the route line — exactly where a warning has to
    // be unmistakable. The rule is enforced rather than trusted to review.
    const reds = new Set([colours[theme].danger.toLowerCase(), '#ff0000', '#e74c3c']);

    for (const entry of baseMapStyle(theme)) {
      for (const styler of entry.stylers) {
        const colour = styler['color'];
        if (typeof colour !== 'string') continue;

        expect(reds.has(colour.toLowerCase())).toBe(false);
        // Any hex where red dominates both other channels by a wide margin is
        // the same mistake wearing a different value.
        expect(isRedDominant(colour)).toBe(false);
      }
    }
  });
});

describe('both themes are first-class', () => {
  it('gives dark its own values rather than inverting light', () => {
    // "Dark is not an inverted afterthought" (CLAUDE.md §8 rule 4).
    const light = JSON.stringify(baseMapStyle('light'));
    const dark = JSON.stringify(baseMapStyle('dark'));

    expect(light).not.toEqual(dark);
  });

  it.each(themes)('leaves no feature in %s without a colour or a visibility', (theme) => {
    // A styler entry that says nothing is a line that looks like configuration
    // and changes nothing — the kind of thing that survives review for years.
    for (const entry of baseMapStyle(theme)) {
      expect(entry.stylers.length).toBeGreaterThan(0);
      for (const styler of entry.stylers) {
        expect(Object.keys(styler).length).toBeGreaterThan(0);
      }
    }
  });
});

/** Whether a hex colour reads as red rather than as a neutral with warmth. */
function isRedDominant(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match?.[1] === undefined) return false;

  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;

  return r > g + 40 && r > b + 40;
}
