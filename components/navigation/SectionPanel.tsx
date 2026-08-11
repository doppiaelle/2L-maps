import { View } from 'react-native';

import { DOCK_OUTER_HEIGHT } from '@/components/navigation/Dock';
import { colours, layout } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * A dock section, opened over the map.
 *
 * **It stops above the dock rather than under it**, which is the one detail that
 * makes the whole arrangement work. A panel drawn edge to edge would cover the
 * navigation it is supposed to be left by, and the only way out would be the
 * system back gesture — a gesture, for the second time, standing in for the
 * control that should have been there (`CLAUDE.md` §7 rule 4).
 *
 * **The map stays mounted underneath.** Unmounting it would make returning cost a
 * fresh tile fetch and a camera animation every time, and the map is the thing
 * that tells a driver where the route they are reading actually is. The panel is
 * opaque, so the map is not visible while a section is open — it is kept for the
 * moment the section closes, not for looking through.
 *
 * `accessibilityViewIsModal` is what stops a screen reader wandering onto the
 * markers behind it. Without it the map is still in the tree and still
 * focusable, and the panel would read as a layer floating over a live screen.
 */

export interface SectionPanelProps {
  readonly children: React.ReactNode;
  readonly theme: ThemeName;
  /** Points the dock occupies above the bottom safe-area inset, including the
   *  gap it floats in. Passed rather than measured so a test and a device agree. */
  readonly dockHeight?: number;
  /**
   * The status-bar inset, in points.
   *
   * **It was missing, and the section began at the very top of the glass.** The
   * title sat under the clock and the battery on every device with a notch or a
   * punch-hole, which is every device this product ships to. Passed rather than
   * read here, following the same rule as the dock height: a component that asks
   * the device answers differently in a test, in split screen and on a foldable.
   */
  readonly topInset?: number;
  /**
   * Whether the content runs the whole height, with the dock floating over it.
   *
   * False for the stop list, which must stop above the dock or its last row is
   * unreachable. True for the drawn route, which is a surface rather than a
   * list: stopping it short leaves a band of background between the map and the
   * dock, and the map reads as a panel rather than as the ground.
   */
  readonly extendsBehindDock?: boolean;
  readonly testID?: string;
}

export function SectionPanel({
  children,
  theme,
  dockHeight = DOCK_OUTER_HEIGHT,
  topInset = 0,
  extendsBehindDock = false,
  testID,
}: SectionPanelProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        // Where the dock begins, gap included: the dock floats clear of the
        // edges (ADR-0020), so stopping at the pill row alone would leave the
        // panel's bottom edge running underneath it. The safe-area inset beneath
        // the dock is its own padding and is not counted here.
        //
        // Zero when the content is a surface rather than a list: the map runs
        // under the dock and the dock floats on it, which is the difference
        // between a map and a panel with a map in it.
        bottom: extendsBehindDock ? 0 : dockHeight,
        backgroundColor: palette.bg,
        // The status bar, plus the product's own margin. Without the inset the
        // section starts under the clock.
        paddingTop: topInset + layout.screenPadding,
      }}
      accessibilityViewIsModal
      testID={testID}
    >
      {children}
    </View>
  );
}
