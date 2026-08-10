/**
 * The dock, decided as data.
 *
 * Navigation used to be a swipe and two icons floating over the map: the stop
 * list was a bottom sheet with three detents, and History and Settings were 44 pt
 * glyphs in the top-right corner that **disappeared entirely while a route was in
 * progress**. Both choices came from the same instinct — keep the map clear — and
 * both cost more than they saved ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)).
 *
 * A dock replaces them. Three sections, each opening full-screen above a map that
 * stays mounted underneath, and a close control that appears only when there is
 * something to close.
 *
 * **What is available is decided here, not in the component**, because it is the
 * part with a rule in it. The old controls vanished mid-route on the theory that
 * a driver should not be distracted; the effect was that the person most likely
 * to need their route history, or to want to change which navigation app they are
 * being thrown into, was the one person who could not reach either. Removing
 * someone's way out is not the same as protecting them.
 */

export type DockSection = 'itinerary' | 'history' | 'settings';

/** `null` is the bare map — a state, not the absence of one. */
export type ActiveSection = DockSection | null;

export interface DockItem {
  readonly section: DockSection;
  /** What the tab says. Short enough to sit under a glyph at 200% Dynamic Type. */
  readonly label: string;
  readonly glyph: string;
  /** Says what happens, never what the control is (`CLAUDE.md` §10 rule 1). */
  readonly accessibilityLabel: string;
  readonly isSelected: boolean;
}

export interface DockConditions {
  /** A route the user is actively driving. Changes emphasis, never availability. */
  readonly isRouteInProgress: boolean;
}

/** The order is fixed: the section a user reaches for most sits nearest the thumb
 *  it is reached with, and a dock whose items move is a dock nobody learns. */
const SECTIONS: readonly Omit<DockItem, 'isSelected'>[] = [
  {
    section: 'itinerary',
    label: 'Route',
    glyph: '≡',
    accessibilityLabel: 'Open your route and its stops',
  },
  {
    section: 'history',
    label: 'History',
    glyph: '🕒',
    accessibilityLabel: 'Open your saved routes',
  },
  {
    section: 'settings',
    label: 'Settings',
    glyph: '⚙',
    accessibilityLabel: 'Open settings',
  },
];

/**
 * The dock's items for the current state.
 *
 * `conditions` is accepted and deliberately does not filter. It is here because
 * the question "is anything hidden right now" has to have an answer that lives
 * somewhere testable — and the answer is no. If a future state ever does need to
 * withdraw a section, this is the function that must change and the test that
 * will notice.
 */
export function dockItems(active: ActiveSection, _conditions: DockConditions): DockItem[] {
  return SECTIONS.map((item) => ({ ...item, isSelected: item.section === active }));
}

/** The close control exists only when there is something to close. A permanently
 *  visible X on the bare map would be a control that does nothing. */
export function showsClose(active: ActiveSection): boolean {
  return active !== null;
}

/**
 * What tapping a dock item does.
 *
 * Tapping the open section closes it, so the dock is also the way back to the
 * map. The X is the obvious route and this is the one a thumb finds by accident —
 * both land in the same place, which is what makes the gesture forgiving.
 */
export function toggleSection(active: ActiveSection, tapped: DockSection): ActiveSection {
  return active === tapped ? null : tapped;
}

/**
 * How much of the map's bottom edge the dock covers.
 *
 * The map pads its camera by this so a marker never lands underneath the dock.
 * Expressed as a fraction because that is what `boundsFor` and the attribution
 * offset both consume — and because the dock's height in points depends on the
 * safe-area inset, which only the device knows.
 */
export function dockObstructionFraction(dockHeight: number, screenHeight: number): number {
  if (screenHeight <= 0 || dockHeight <= 0) return 0;
  return Math.min(dockHeight / screenHeight, 1);
}
