import {
  dockItems,
  dockObstructionFraction,
  showsClose,
  toggleSection,
  type ActiveSection,
} from './dock';

/**
 * The dock's rules.
 *
 * The one that carries a real consequence is availability mid-route. The controls
 * this replaces returned `null` while a route was in progress, so the driver —
 * the one person who might need their history, or to change which navigation app
 * they are handed to — was the only one who could reach neither.
 */

const driving = { isRouteInProgress: true };
const parked = { isRouteInProgress: false };

describe('what the dock offers', () => {
  it('offers all three sections', () => {
    expect(dockItems(null, parked).map((item) => item.section)).toEqual([
      'itinerary',
      'history',
      'settings',
    ]);
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

  it('marks nothing as selected on the bare map', () => {
    expect(dockItems(null, parked).every((item) => !item.isSelected)).toBe(true);
  });

  it('labels every item with what happens, not with what it is', () => {
    // "Settings" names the control; "Open settings" names the outcome
    // (CLAUDE.md §10 rule 1).
    for (const item of dockItems(null, parked)) {
      expect(item.accessibilityLabel).toMatch(/^Open /);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.glyph.length).toBeGreaterThan(0);
    }
  });

  it('keeps the order fixed, because a dock whose items move is not learned', () => {
    const orders: ActiveSection[] = [null, 'itinerary', 'history', 'settings'];
    const first = dockItems(null, parked).map((item) => item.section);

    for (const active of orders) {
      expect(dockItems(active, driving).map((item) => item.section)).toEqual(first);
    }
  });
});

describe('the close control', () => {
  it('is absent on the bare map, where it would do nothing', () => {
    expect(showsClose(null)).toBe(false);
  });

  it('is present whenever a section is open', () => {
    for (const section of ['itinerary', 'history', 'settings'] as const) {
      expect(showsClose(section)).toBe(true);
    }
  });
});

describe('tapping a dock item', () => {
  it('opens the section that was tapped', () => {
    expect(toggleSection(null, 'history')).toBe('history');
  });

  it('switches directly between sections without passing through the map', () => {
    expect(toggleSection('itinerary', 'settings')).toBe('settings');
  });

  it('closes the section when its own item is tapped again', () => {
    // The second way back to the map. The X is the obvious one; this is the one
    // a thumb finds by accident, and both land in the same place.
    expect(toggleSection('history', 'history')).toBeNull();
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
