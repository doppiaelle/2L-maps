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
  readonly testID?: string;
}

export function SectionPanel({
  children,
  theme,
  dockHeight = DOCK_OUTER_HEIGHT,
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
        bottom: dockHeight,
        backgroundColor: palette.bg,
        paddingTop: layout.screenPadding,
      }}
      accessibilityViewIsModal
      testID={testID}
    >
      {children}
    </View>
  );
}
