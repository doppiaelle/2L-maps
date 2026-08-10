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
  it('offers all four sections, the map among them', () => {
    expect(dockItems('map', parked).map((item) => item.section)).toEqual([
      'map',
      'itinerary',
      'history',
      'settings',
    ]);
  });

  it('offers the same four whatever is open', () => {
    // The property the close control broke. A dock whose width depends on state
    // is a dock whose items move, and an item that moves is not learned.
    const sections: ActiveSection[] = ['map', 'itinerary', 'history', 'settings'];
    for (const active of sections) {
      expect(dockItems(active, parked)).toHaveLength(4);
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

  it('marks the map as selected when nothing is open', () => {
    // Previously nothing was selected at all, which said the user was nowhere.
    const items = dockItems(DEFAULT_SECTION, parked);
    expect(items.filter((item) => item.isSelected).map((item) => item.section)).toEqual(['map']);
  });

  it('labels every item with what happens, not with what it is', () => {
    // "Settings" names the control; "Open settings" names the outcome
    // (CLAUDE.md §10 rule 1).
    for (const item of dockItems('map', parked)) {
      expect(item.accessibilityLabel).toMatch(/^(Open|Show) /);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.glyph.length).toBeGreaterThan(0);
    }
  });

  it('keeps the order fixed, because a dock whose items move is not learned', () => {
    const orders: ActiveSection[] = ['map', 'itinerary', 'history', 'settings'];
    const first = dockItems('map', parked).map((item) => item.section);

    for (const active of orders) {
      expect(dockItems(active, driving).map((item) => item.section)).toEqual(first);
    }
  });
});

describe('tapping a dock item', () => {
  it('opens the section that was tapped', () => {
    expect(toggleSection('map', 'history')).toBe('history');
  });

  it('switches directly between sections without passing through the map', () => {
    expect(toggleSection('itinerary', 'settings')).toBe('settings');
  });

  it('returns to the map when the open section is tapped again', () => {
    // The job the close control used to do, done by an item that is always in
    // the same place.
    expect(toggleSection('history', 'history')).toBe('map');
  });

  it('leaves the map alone when the map is tapped', () => {
    // Pressing the section you are already in confirms where you are. Toggling
    // it into something else would make the leftmost item mean two things.
    expect(toggleSection('map', 'map')).toBe('map');
  });

  it('returns to the map from every section', () => {
    for (const section of ['itinerary', 'history', 'settings'] as const) {
      expect(toggleSection(section, section)).toBe(DEFAULT_SECTION);
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
