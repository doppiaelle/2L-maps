/**
 * The dock, decided as data.
 *
 * Navigation used to be a swipe and two icons floating over the map
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)). A dock replaced
 * them. What changed since
 * ([ADR-0020](../../docs/adr/0020-four-section-dock.md)) is that the dock no
 * longer changes shape.
 *
 * **Four sections, always four, and the map is one of them.** The first version
 * had three items plus a close control that appeared only while a section was
 * open, on the reasoning that a permanently visible X on the bare map would be a
 * control that does nothing. The reasoning was right about the X and wrong about
 * the conclusion: it made the dock three items wide sometimes and four others,
 * so every open and every close shifted every item under the user's thumb. A
 * user moving between Route and History watched the row re-lay-out twice on the
 * way.
 *
 * Making the map a section fixes it at the cause. The X is gone — not replaced,
 * removed — because "show me the map" is a destination like the other three and
 * reads as one. The row never changes width, the items never move, and closing a
 * section is the same gesture as opening one.
 *
 * **Map is leftmost and is where the app opens.** It is the state a user returns
 * to most, and the left edge is where a thumb travelling across the row starts.
 */

export type DockSection = 'map' | 'itinerary' | 'history' | 'settings';

/**
 * Which section is showing.
 *
 * **Not nullable.** It used to be `DockSection | null`, where null meant the
 * bare map — a state expressed as the absence of one, which every call site then
 * had to translate. `'map'` is the same state with a name, and the translation
 * is gone from all of them.
 */
export type ActiveSection = DockSection;

/** Where the app opens, and where closing anything returns to. */
export const DEFAULT_SECTION: ActiveSection = 'map';

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
    section: 'map',
    label: 'Map',
    glyph: '◈',
    accessibilityLabel: 'Show the map',
  },
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

/**
 * What tapping a dock item does.
 *
 * Tapping the open section returns to the map, so the dock is also the way back
 * — which is the job the close control used to do, done by a control that is
 * always in the same place. Tapping Map while the map is showing is a no-op
 * rather than a toggle into something else: a user pressing the section they are
 * already in is confirming where they are, not asking to leave.
 */
export function toggleSection(active: ActiveSection, tapped: DockSection): ActiveSection {
  if (tapped === DEFAULT_SECTION) return DEFAULT_SECTION;
  return active === tapped ? DEFAULT_SECTION : tapped;
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
