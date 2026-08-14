import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { DockItem, DockSection } from '@/lib/ui/dock';

/**
 * The dock — the app's navigation, and the only one
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md),
 * [ADR-0020](../../docs/adr/0020-four-section-dock.md)).
 *
 * **One object, two pills inside it.** The first version was a full-bleed bar
 * welded to the bottom edge, with a border only along its top — which read as a
 * wall the map ended at rather than as a control floating above it, and left the
 * outermost items' touch targets running off the side of the screen. It is now
 * inset from all three edges and fully bordered, so it is legible as a single
 * object with its own shape, and the map is visible around it.
 *
 * **The row never changes width.** Nothing is added or removed while the app is
 * running: no close control, no conditional item. An item is where the user last
 * saw it, always, which is the property that lets a thumb learn a position
 * (ADR-0020).
 *
 * **No blur.** The translucency is a background colour, not `expo-blur`, which is
 * a native module and would put the Expo SDK / react-native-maps pair back
 * through the C6 verification for a visual effect
 * ([ADR-0005](../../docs/adr/0005-map-engine-and-route-preview.md)). The seam is
 * here if it is ever wanted: one background, one file.
 *
 * Renders what it is given. Which items exist and which is selected are decided
 * in `lib/ui/dock.ts`, where they are tested without a renderer.
 */

/** The pill row's own height, in points. */
export const DOCK_HEIGHT = 56;

/** The gap between the dock and each screen edge. Enough that the map reads as
 *  continuing underneath rather than being cut off by it. */
export const DOCK_INSET = layout.screenPadding;

/**
 * What the dock actually covers at the bottom of the screen, excluding the
 * device's own safe-area inset.
 *
 * Exported because the map pads its camera by this number rather than guessing,
 * and because the previous version exported only the bar height — which was
 * correct when the bar was flush with the edge and wrong the moment it floated.
 */
export const DOCK_OUTER_HEIGHT = DOCK_HEIGHT + DOCK_INSET * 2;

export interface DockProps {
  readonly items: readonly DockItem[];
  onSelect: (section: DockSection) => void;
  /**
   * The bottom safe-area inset, in points — the gesture bar on Android, the home
   * indicator on iOS.
   *
   * Passed rather than read from `useSafeAreaInsets`, following the same rule the
   * sheet followed about the window: a component that asks the device answers
   * differently in a test, in split screen, and on a foldable. The screen owns
   * the measurement; this owns the layout.
   */
  readonly bottomInset?: number;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function Dock({
  items,
  onSelect,
  bottomInset = 0,
  theme,
  testID,
}: DockProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // The gesture bar sits below the dock, not behind it: a control the user
        // has to reach past the system's own is a control they mis-tap.
        paddingBottom: bottomInset + DOCK_INSET,
        paddingHorizontal: DOCK_INSET,
      }}
      // The map behind must stay draggable everywhere the dock is not — which,
      // now that the dock is inset, includes the strip down either side of it.
      pointerEvents="box-none"
      testID={testID}
    >
      <View
        style={{
          flexDirection: 'row',
          height: DOCK_HEIGHT,
          alignItems: 'stretch',
          // Fully rounded rather than a large radius: the shape says "one
          // object", and a square-cornered bar floating in the middle of the
          // screen reads as a cropped bar.
          borderRadius: radius.radiusFull,
          borderWidth: 0,
          backgroundColor: palette.textPrimary,
          // The pills breathe inside the container instead of touching its
          // border, which is the difference between four buttons in a box and
          // one dock with four sections in it.
          padding: 5,
          overflow: 'hidden',
        }}
        accessibilityRole="tablist"
      >
        {items.map((item) => (
          <DockButton
            key={item.section}
            label={item.label}
            accessibilityLabel={item.accessibilityLabel}
            isSelected={item.isSelected}
            onPress={() => {
              onSelect(item.section);
            }}
            theme={theme}
            testID={`dock-${item.section}`}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One pill.
 *
 * The glyph is decoration and is hidden from the screen reader: the label beneath
 * it already says the word, and announcing both reads the picture and then the
 * fact. Selection is carried by `accessibilityState` and by a filled background
 * as well as by colour, because colour alone is not a state anyone can rely on
 * (`CLAUDE.md` §10 rule 4).
 */
function DockButton({
  label,
  accessibilityLabel,
  isSelected,
  onPress,
  theme,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  isSelected: boolean;
  onPress: () => void;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];
  const tint = isSelected ? palette.textPrimary : palette.bg;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected }}
      style={{
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        borderRadius: radius.radiusFull,
        // The selected pill is a shape, not only a colour. `accentSubtle` is the
        // one tint in the palette quiet enough to sit under mint text without
        // the pair failing contrast in either theme.
        backgroundColor: isSelected ? palette.bg : 'transparent',
      }}
      testID={testID}
    >
      <Text
        style={{ color: tint, fontSize: 15, fontWeight: '700' }}
        accessibilityElementsHidden
        importantForAccessibility="no"
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
