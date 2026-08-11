import { markerStyle, routeStroke } from './style';
import { colours } from '@/lib/design/tokens';

/**
 * How a route and its stops are painted.
 *
 * The Map ID resolver used to live here, mitigating risk C15 — map styling in a
 * Google console, outside version control. There is no console style left to
 * fall back from: the preview is drawn from these tokens
 * ([ADR-0021](../../docs/adr/0021-drawn-route-preview.md)), so what the map
 * looks like is now entirely in this repository, which is what C15 wanted.
 */

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
    expect(markerStyle('light', 'unreachable', false).glyph).not.toBeNull();
    expect(markerStyle('light', 'pending', false).glyph).toBeNull();
  });

  it('keeps the state glyph when a stop is selected', () => {
    // Selection changes the fill; it must not erase what the stop is. A selected
    // unreachable stop still shows its warning — otherwise tapping the one stop
    // the route cannot serve is what hides that fact.
    const style = markerStyle('light', 'unreachable', true);

    expect(style.glyph).toBe('!');
    expect(style.fill).toBe(colours.light.accent);
  });

  it('says both facts out loud', () => {
    expect(markerStyle('light', 'unreachable', true).spoken).toBe('unreachable, selected');
  });

  it('draws a foreground that its own fill can carry', () => {
    // The ordinal sits on the fill. A mint pin with mint text is a pin with no
    // number, and the number is what the user reads while driving.
    for (const theme of ['light', 'dark'] as const) {
      for (const state of ['pending', 'unreachable'] as const) {
        const style = markerStyle(theme, state, false);
        expect(style.foreground).not.toBe(style.fill);
      }
    }
  });
});
