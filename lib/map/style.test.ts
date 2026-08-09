import { mapIdFor, markerStyle, routeStroke } from './style';
import { colours } from '@/lib/design/tokens';

/**
 * Risk C15 is that map styling lives in a console, outside version control. The
 * mitigation the documentation promises is a silent fall back to the default
 * style — so that fall back is tested, because an untested fallback is a blank
 * map waiting for a revoked Map ID.
 */

describe('resolving a Map ID', () => {
  it('uses the one configured for the theme', () => {
    expect(mapIdFor('dark', { light: 'light-id', dark: 'dark-id' })).toBe('dark-id');
  });

  it('falls back to the default style when none is configured', () => {
    // Not a blank map and not an error: a default-styled map is a working map
    // (docs/14_GOOGLE_MAPS_INTEGRATION.md §6).
    expect(mapIdFor('light', { light: null, dark: null })).toBeNull();
  });

  it('treats an empty string as absent', () => {
    // `process.env['…'] ?? ''` is how an unset build variable arrives. Passing
    // that to the SDK is not "no style", it is an unresolvable one.
    expect(mapIdFor('light', { light: '', dark: 'dark-id' })).toBeNull();
    expect(mapIdFor('light', { light: '   ', dark: 'dark-id' })).toBeNull();
  });
});

describe('the route line', () => {
  it('is mint with a casing in light theme', () => {
    // Mint on paper-white is the system's weakest contrast pairing, and the
    // casing is also what keeps the route readable over the traffic layer.
    const style = routeStroke('light', false);

    expect(style.colour).toBe(colours.light.accent);
    expect(style.casing).not.toBeNull();
    expect(style.casing?.width).toBeGreaterThan(style.width);
  });

  it('needs no casing in dark theme', () => {
    // The base map already separates the line; a casing would only thicken it.
    expect(routeStroke('dark', false).casing).toBeNull();
  });

  it('is never solid when the result is degraded', () => {
    // The dash is the correctness signal: a smooth line would claim road routing
    // that did not happen (docs/15_ROUTE_OPTIMIZATION.md).
    for (const theme of ['light', 'dark'] as const) {
      expect(routeStroke(theme, true).dashPattern).not.toBeNull();
    }
  });

  it('shows a degraded route in warning, never in danger', () => {
    // A lower-confidence result is not an error, and red would misrepresent it
    // (docs/07_DESIGN_SYSTEM.md; CLAUDE.md §8 rule 3).
    const style = routeStroke('light', true);

    expect(style.colour).toBe(colours.light.warning);
    expect(style.colour).not.toBe(colours.light.danger);
  });
});

describe('marker appearance', () => {
  it('never distinguishes a state by colour alone', () => {
    // A user with deuteranopia must be able to read the map (CLAUDE.md §10
    // rule 4). Pending is the exception that proves it: it carries the ordinal,
    // which is itself the distinguishing mark.
    for (const state of ['completed', 'skipped', 'unreachable'] as const) {
      expect(markerStyle('light', state, false).glyph).not.toBeNull();
    }
    expect(markerStyle('light', 'pending', false).glyph).toBeNull();
  });

  it('keeps the state glyph when a stop is selected', () => {
    // Selection changes the fill; it must not erase what the stop is. A selected
    // completed stop still shows its checkmark.
    const style = markerStyle('light', 'completed', true);

    expect(style.glyph).toBe('✓');
    expect(style.fill).toBe(colours.light.accent);
  });

  it('says both facts out loud', () => {
    expect(markerStyle('light', 'unreachable', true).spoken).toBe('unreachable, selected');
  });

  it('draws a foreground that its own fill can carry', () => {
    // The ordinal sits on the fill. A mint pin with mint text is a pin with no
    // number, and the number is what the user reads while driving.
    for (const theme of ['light', 'dark'] as const) {
      for (const state of ['pending', 'completed', 'skipped', 'unreachable'] as const) {
        const style = markerStyle(theme, state, false);
        expect(style.foreground).not.toBe(style.fill);
      }
    }
  });
});
