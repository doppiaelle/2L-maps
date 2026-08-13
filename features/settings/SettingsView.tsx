import { Pressable, ScrollView, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { ThemePreference } from '@/features/preferences/preferences-store';
import type { NavigationProviderId } from '@/types';

export interface SettingsViewProps {
  readonly planLabel: string;
  readonly usageLabel: string;
  readonly provider: NavigationProviderId | null;
  onBack: () => void;
  onOpenPaywall: () => void;
  onChooseProvider: (provider: NavigationProviderId) => void;
  onSignOut: () => void;
  readonly themePreference: ThemePreference;
  onChooseTheme: (theme: ThemePreference) => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function SettingsView({
  planLabel,
  usageLabel,
  provider,
  onBack,
  onOpenPaywall,
  onChooseProvider,
  onSignOut,
  themePreference,
  onChooseTheme,
  theme,
  testID,
}: SettingsViewProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: layout.screenPadding,
        paddingBottom: space.space7,
      }}
      showsVerticalScrollIndicator={false}
      testID={testID}
    >
      <View
        style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: space.space3 }}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to route"
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}
          testID="settings-back"
        >
          <Text style={{ color: palette.textPrimary, fontSize: 30, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{ color: palette.textPrimary, fontSize: 24, lineHeight: 30, fontWeight: '700' }}
        >
          Settings
        </Text>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 36,
          lineHeight: 44,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Navigation
      </Text>
      <Text style={{ color: palette.textSecondary, fontSize: 16, lineHeight: 23 }}>
        Choose which navigator opens after you confirm.
      </Text>

      <View
        style={{
          marginTop: space.space5,
          padding: space.space4,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
        testID="settings-provider-list"
      >
        <Text style={{ color: palette.textSecondary, fontSize: 14, fontWeight: '700' }}>
          PREFERRED NAVIGATOR
        </Text>

        <View style={{ marginTop: space.space4, gap: space.space3 }} accessibilityRole="radiogroup">
          {PROVIDERS.map((item) => {
            const selected = provider === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => onChooseProvider(item.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Use ${item.label}`}
                style={{
                  minHeight: 52,
                  paddingHorizontal: space.space4,
                  borderRadius: radius.radiusMd,
                  borderWidth: selected ? 0 : 1,
                  borderColor: palette.border,
                  backgroundColor: selected ? palette.accent : palette.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                testID={`settings-provider-${item.value}`}
              >
                <Text
                  style={{
                    color: selected ? palette.accentOn : palette.textPrimary,
                    fontSize: 17,
                    fontWeight: '700',
                  }}
                >
                  {item.label}
                </Text>
                {selected && (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: palette.textPrimary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: palette.accent,
                      }}
                    />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 28,
          lineHeight: 34,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Appearance
      </Text>
      <View
        style={{
          flexDirection: 'row',
          marginTop: space.space3,
          padding: 6,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
        testID="settings-theme-selector"
      >
        {THEME_OPTIONS.map((option) => {
          const selected = option.value === themePreference;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChooseTheme(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={`Use ${option.label.toLowerCase()} theme`}
              accessibilityState={{ checked: selected }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: radius.radiusMd,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? palette.textPrimary : 'transparent',
              }}
              testID={`settings-theme-${option.label.toLowerCase()}`}
            >
              <Text
                style={{
                  color: selected ? palette.bg : palette.textSecondary,
                  fontSize: 14,
                  fontWeight: '700',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 28,
          lineHeight: 34,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Account
      </Text>
      <Pressable
        onPress={onOpenPaywall}
        accessibilityRole="button"
        accessibilityLabel="See plans"
        style={{
          marginTop: space.space3,
          padding: space.space4,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Text
          style={{ color: palette.textPrimary, fontSize: 17, fontWeight: '700' }}
          testID="settings-plan"
        >
          {planLabel}
        </Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            marginTop: space.space1,
          }}
          testID="settings-usage"
        >
          {usageLabel}
        </Text>
      </Pressable>
      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityHint="Signs you out on this device. Your saved routes stay in your account."
        style={{
          minHeight: 56,
          marginTop: space.space4,
          borderRadius: radius.radiusLg,
          backgroundColor: theme === 'light' ? '#EFEFED' : palette.surfaceRaised,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="settings-sign-out"
      >
        <Text style={{ color: '#B95656', fontSize: 17, fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const THEME_OPTIONS: readonly { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'light' },
  { label: 'System', value: null },
  { label: 'Dark', value: 'dark' },
];

const PROVIDERS: readonly { label: string; value: NavigationProviderId }[] = [
  { label: 'Google Maps', value: 'google-maps' },
  { label: 'Apple Maps', value: 'apple-maps' },
  { label: 'Waze', value: 'waze' },
];
