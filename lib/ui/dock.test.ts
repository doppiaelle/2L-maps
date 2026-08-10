import {
  DEFAULT_SECTION,
  dockItems,
  dockObstructionFraction,
  toggleSection,
  type ActiveSection,
} from './dock';

/**
 * The dock's rules.
 *
 * Two carry real consequences. Availability mid-route: the controls this
 * replaced returned `null` while a route was in progress, so the driver — the
 * one person who might need their history, or to change which navigation app
 * they are handed to — was the only one who could reach neither. And the width
 * of the row: it was three items on the map and four with a section open, so
 * every open and close shifted every item under the user's thumb (ADR-0020).
 */

const driving = { isRouteInProgress: true };
const parked = { isRouteInProgress: false };

describe('what the dock offers', () => {
  it('offers three sections, Route first', () => {
    // The map is no longer one of them: it is what an optimization produces,
    // shown inside Route (ADR-0022).
    expect(dockItems('itinerary', parked).map((item) => item.section)).toEqual([
      'itinerary',
      'history',
      'settings',
    ]);
  });

  it('offers the same three whatever is open', () => {
    // The property the close control broke, and the one part of ADR-0020 that
    // stands: a dock whose width depends on state is a dock whose items move,
    // and an item that moves is not learned.
    const sections: ActiveSection[] = ['itinerary', 'history', 'settings'];
    for (const active of sections) {
      expect(dockItems(active, parked)).toHaveLength(3);
    }
  });

  it('keeps every section reachable while a route is in progress', () => {
    // The regression this file exists for. Hiding someone's way out is not the
    // same as protecting them (ADR-0018).
    expect(dockItems('itinerary', driving).map((item) => item.section)).toEqual(
      dockItems('itinerary', parked).map((item) => item.section),
    );
  });

  it('marks exactly the open section as selected', () => {
    const items = dockItems('history', parked);
    expect(items.filter((item) => item.isSelected).map((item) => item.section)).toEqual([
      'history',
    ]);
  });

  it('opens on Route, which is the product', () => {
    // It opened on the map, which meant an empty rectangle of somebody else's
    // country with the work one tap behind it (ADR-0022).
    const items = dockItems(DEFAULT_SECTION, parked);
    expect(items.filter((item) => item.isSelected).map((item) => item.section)).toEqual([
      'itinerary',
    ]);
  });

  it('labels every item with what happens, not with what it is', () => {
    // "Settings" names the control; "Open settings" names the outcome
    // (CLAUDE.md §10 rule 1).
    for (const item of dockItems('itinerary', parked)) {
      expect(item.accessibilityLabel).toMatch(/^(Open|Show) /);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.glyph.length).toBeGreaterThan(0);
    }
  });

  it('keeps the order fixed, because a dock whose items move is not learned', () => {
    const orders: ActiveSection[] = ['itinerary', 'history', 'settings'];
    const first = dockItems('itinerary', parked).map((item) => item.section);

    for (const active of orders) {
      expect(dockItems(active, driving).map((item) => item.section)).toEqual(first);
    }
  });
});

describe('tapping a dock item', () => {
  it('opens the section that was tapped', () => {
    expect(toggleSection('itinerary', 'history')).toBe('history');
  });

  it('switches directly between sections', () => {
    expect(toggleSection('itinerary', 'settings')).toBe('settings');
  });

  it('does not eject you from the section you are already in', () => {
    // Pressing the section you are in confirms where you are. There is no
    // longer a "somewhere else" that is not itself a section: leaving Route
    // used to mean showing the map, and the map is inside Route now (ADR-0022).
    for (const section of ['itinerary', 'history', 'settings'] as const) {
      expect(toggleSection(section, section)).toBe(section);
    }
  });
});

describe('how much of the map the dock covers', () => {
  it('reports the fraction the camera has to pad for', () => {
    expect(dockObstructionFraction(80, 800)).toBeCloseTo(0.1);
  });

  it('has nothing to report for a screen with no height', () => {
    // Measured before layout. Dividing here would produce Infinity and push the
    // camera somewhere no coordinate exists.
    expect(dockObstructionFraction(80, 0)).toBe(0);
  });

  it('never claims more than the whole screen', () => {
    expect(dockObstructionFraction(2000, 800)).toBe(1);
  });

  it('treats an unmeasured dock as covering nothing', () => {
    expect(dockObstructionFraction(0, 800)).toBe(0);
  });
});
