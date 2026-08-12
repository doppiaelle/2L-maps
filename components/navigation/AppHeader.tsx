import { Pressable, Text, View } from 'react-native';

import { colours, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

export interface AppHeaderProps {
  readonly title?: string;
  readonly theme: ThemeName;
  readonly showBrand?: boolean;
  readonly actionLabel?: string;
  readonly actionGlyph?: string;
  onAction?: () => void;
  readonly testID?: string;
}

/** Compact, shared top bar from the approved mobile composition. */
export function AppHeader({
  title,
  theme,
  showBrand = false,
  actionLabel,
  actionGlyph = 'Settings',
  onAction,
  testID,
}: AppHeaderProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      testID={testID}
    >
      {showBrand ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.space2 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.radiusSm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.textPrimary,
            }}
          >
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>2L</Text>
          </View>
          <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '700' }}>Maps</Text>
        </View>
      ) : (
        <Text
          accessibilityRole="header"
          style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '700' }}
        >
          {title}
        </Text>
      )}

      {onAction !== undefined && actionLabel !== undefined ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 12, fontWeight: '700' }}>
            {actionGlyph}
          </Text>
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}
