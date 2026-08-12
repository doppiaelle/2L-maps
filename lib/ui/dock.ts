/**
 * The dock, decided as data.
 *
 * Navigation used to be a swipe and two icons floating over the map
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)). A dock replaced
 * them, and for a while the map was one of its sections
 * ([ADR-0020](../../docs/adr/0020-four-section-dock.md)).
 *
 * **Two dock sections now, and the map is not one of them**
 * ([ADR-0022](../../docs/adr/0022-one-route-section.md)). Making the map a
 * destination fixed a real problem — a dock that changed width — and created a
 * worse one on the device: the app opened on an empty rectangle of somebody
 * else's country, and the route the user came to build was one tap away behind
 * it. The map is not a place the user goes. It is what an optimization produces,
 * and it now appears inside the Route section at the moment there is a route to
 * draw.
 *
 * The row still never changes width, which is what ADR-0020 was really about.
 * Route and History remain fixed. Settings is the persistent top-right utility,
 * so it stays reachable without competing with the two primary destinations.
 *
 * **Route is leftmost and is where the app opens.** It is the product.
 */

export type DockSection = 'itinerary' | 'history' | 'settings';

/**
 * Which section is showing.
 *
 * Not nullable, and that part of ADR-0020 stands: a state expressed as the
 * absence of one is a state every reader has to translate.
 */
export type ActiveSection = DockSection;

/** Where the app opens, and where closing anything returns to. */
export const DEFAULT_SECTION: ActiveSection = 'itinerary';

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
 * **Nothing toggles.** Tapping the section you are already in confirms where you
 * are; it does not eject you somewhere else. That was true of Map under
 * ADR-0020 and is now true of all three, because there is no longer a
 * "somewhere else" that is not itself a section — leaving Route used to mean
 * showing the map, and the map is inside Route now.
 *
 * What replaced the toggle is the X on the drawn map, which returns to the list
 * *within* the section (`lib/route/route-view.ts`). That is the control the user
 * actually wanted when they tapped Route a second time.
 */
export function toggleSection(_active: ActiveSection, tapped: DockSection): ActiveSection {
  return tapped;
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
