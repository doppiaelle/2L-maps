import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { DockItem, DockSection } from '@/lib/ui/dock';

/**
 * The dock — the app's navigation, and the only one
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)).
 *
 * It replaces a swipeable sheet and two glyphs floating over the map. The sheet
 * put the whole stop list behind a gesture, and a gesture is the one affordance a
 * one-handed driver cannot find without already knowing it is there
 * (`CLAUDE.md` §7 rule 4). The glyphs sat in the top-right corner — the furthest
 * point on the screen from a thumb — and vanished mid-route.
 *
 * **The close control appears only when a section is open**, and is the reason
 * the dock is four items wide sometimes and three others. A permanently visible
 * X on the bare map would be a control that does nothing, which is worse than an
 * absent one: it invites a tap and answers with silence.
 *
 * **No blur.** The translucency is a background colour, not `expo-blur`, which is
 * a native module and would put the Expo SDK / react-native-maps pair back
 * through the C6 verification for a visual effect ([ADR-0005](../../docs/adr/0005-map-engine-and-route-preview.md)).
 * The seam is here if it is ever wanted: one background, one file.
 *
 * Renders what it is given. Which items exist, which is selected and whether the
 * close control shows are all decided in `lib/ui/dock.ts`, where they are tested
 * without a renderer.
 */

/** Points, excluding the safe-area inset the device adds beneath it. Exported so
 *  the map can pad its camera by the same number rather than guessing. */
export const DOCK_HEIGHT = 64;

export interface DockProps {
  readonly items: readonly DockItem[];
  /** Absent when nothing is open — see `showsClose`. */
  readonly showsClose: boolean;
  onSelect: (section: DockSection) => void;
  onClose: () => void;
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
  showsClose,
  onSelect,
  onClose,
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
        // The gesture bar on Android and the home indicator on iOS both live
        // here. Padding rather than margin, so the translucent surface still
        // reaches the bottom edge instead of leaving a strip of map under it.
        paddingBottom: bottomInset,
        borderTopLeftRadius: radius.radiusLg,
        borderTopRightRadius: radius.radiusLg,
        borderTopWidth: 1,
        borderColor: palette.border,
        // Translucent rather than opaque: the map moving underneath is what says
        // the dock is above the map rather than a wall at the bottom of it.
        backgroundColor: withAlpha(palette.surface, 0.92),
      }}
      // The map behind must stay draggable everywhere the dock is not.
      pointerEvents="box-none"
      accessibilityRole="tablist"
      testID={testID}
    >
      <View style={{ flexDirection: 'row', height: DOCK_HEIGHT, alignItems: 'stretch' }}>
        {items.map((item) => (
          <DockButton
            key={item.section}
            glyph={item.glyph}
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

        {showsClose && (
          <DockButton
            glyph="✕"
            label="Close"
            // Names the destination, not the mechanism. "Close" alone leaves a
            // screen-reader user asking what they are returning to.
            accessibilityLabel="Close this section and show the map"
            isSelected={false}
            onPress={onClose}
            theme={theme}
            testID="dock-close"
          />
        )}
      </View>
    </View>
  );
}

/**
 * One item.
 *
 * The glyph is decoration and is hidden from the screen reader: the label beneath
 * it already says the word, and announcing both reads the picture and then the
 * fact. Selection is carried by `accessibilityState` as well as by colour,
 * because colour alone is not a state anyone can rely on (`CLAUDE.md` §10 rule 4).
 */
function DockButton({
  glyph,
  label,
  accessibilityLabel,
  isSelected,
  onPress,
  theme,
  testID,
}: {
  glyph: string;
  label: string;
  accessibilityLabel: string;
  isSelected: boolean;
  onPress: () => void;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];
  const tint = isSelected ? palette.accent : palette.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected }}
      style={{
        flex: 1,
        minHeight: layout.touchMin,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.space1,
      }}
      testID={testID}
    >
      <Text
        style={{ color: tint }}
        className="text-body"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {glyph}
      </Text>
      <Text
        style={{ color: tint }}
        className="text-label-xs uppercase"
        accessibilityElementsHidden
        importantForAccessibility="no"
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A hex token at partial opacity.
 *
 * The tokens are opaque hex because every other surface in the product is, and
 * adding an eight-digit variant to the palette for one component would put a
 * colour in the design system that only one file can use. Converted here instead,
 * from the same token, so the dock cannot drift from `surface`.
 */
function withAlpha(hex: string, alpha: number): string {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (value === undefined) return hex;

  const number = parseInt(value, 16);
  const r = (number >> 16) & 0xff;
  const g = (number >> 8) & 0xff;
  const b = number & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
