import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * The secondary controls that sit over the map
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 *
 * **They are how History and Settings are reached at all.** Both screens existed
 * and neither was reachable: the only navigation anywhere in the app was
 * add-stop opening import, so a whole destination — and the sign-out inside it —
 * could be built, tested and shipped without ever being openable.
 *
 * **Upper area, small, secondary.** The lower third belongs to the primary
 * action and the sheet, which is where a thumb rests one-handed
 * (`CLAUDE.md` §7 rule 2). Putting a destination there would compete with
 * Optimize for the most valuable space on the screen, and these are things a
 * user opens between working days rather than during one.
 *
 * **They disappear during a route.** Settings is never reachable mid-drive
 * ([`docs/05_INFORMATION_ARCHITECTURE.md`](../../docs/05_INFORMATION_ARCHITECTURE.md)
 * §194) and the reason applies to all of them: the user is driving, and a
 * control that navigates away from the route they are following is a control
 * that should not be under their thumb at all.
 *
 * The hit area is 44 pt even though the glyph is smaller. A map control that is
 * hard to hit is a map that gets panned by accident (`CLAUDE.md` §10 rule 2).
 */

export interface MapControlsProps {
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  /** Hidden while a route is underway. */
  readonly isRouteInProgress: boolean;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function MapControls({
  onOpenHistory,
  onOpenSettings,
  isRouteInProgress,
  theme,
  testID,
}: MapControlsProps): React.JSX.Element | null {
  if (isRouteInProgress) return null;

  return (
    <View
      // `pointerEvents: box-none` so the map underneath still receives pans and
      // taps everywhere this row is not.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: space.space7,
        right: layout.screenPadding,
        flexDirection: 'row',
        gap: space.space2,
      }}
      testID={testID}
    >
      <ControlButton
        glyph="🕒"
        label="Open your saved routes"
        onPress={onOpenHistory}
        theme={theme}
        testID="map-control-history"
      />
      <ControlButton
        glyph="⚙"
        label="Open settings"
        onPress={onOpenSettings}
        theme={theme}
        testID="map-control-settings"
      />
    </View>
  );
}

function ControlButton({
  glyph,
  label,
  onPress,
  theme,
  testID,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The label says what happens, never what the element is
      // (`CLAUDE.md` §10 rule 1) — a glyph alone announces as nothing at all.
      accessibilityLabel={label}
      style={{
        width: layout.touchMin,
        height: layout.touchMin,
        borderRadius: radius.radiusFull,
        alignItems: 'center',
        justifyContent: 'center',
        // Opaque rather than translucent: the map beneath is arbitrary, and a
        // control that loses contrast over a dark satellite tile is a control
        // that fails WCAG AA exactly where it is needed (`CLAUDE.md` §10 rule 3).
        backgroundColor: palette.surface,
      }}
      testID={testID}
    >
      <Text style={{ color: palette.textPrimary, fontSize: 18 }}>{glyph}</Text>
    </Pressable>
  );
}
