import { Pressable, Text, View } from 'react-native';

import { colours, layout, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { ThemePreference } from '@/features/preferences/preferences-store';
import type { NavigationProviderId } from '@/types';

export interface SettingsViewProps {
  readonly planLabel: string;
  readonly usageLabel: string;
  readonly providerLabel: string;
  readonly provider: NavigationProviderId | null;
  onBack: () => void;
  onOpenPaywall: () => void;
  onOpenProvider: () => void;
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
  providerLabel,
  provider,
  onBack,
  onOpenPaywall,
  onOpenProvider,
  onChooseProvider,
  onSignOut,
  themePreference,
  onChooseTheme,
  theme,
  testID,
}: SettingsViewProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View style={{ flex: 1, paddingHorizontal: layout.screenPadding }} testID={testID}>
      <View
        style={{ minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: space.space4 }}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to route"
          style={{
            width: 62,
            height: 62,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}
          testID="settings-back"
        >
          <Text style={{ color: palette.textPrimary, fontSize: 38, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{ color: palette.textPrimary, fontSize: 30, lineHeight: 38, fontWeight: '700' }}
        >
          Settings
        </Text>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 46,
          lineHeight: 56,
          fontWeight: '700',
          marginTop: 74,
        }}
      >
        Navigation
      </Text>
      <Text style={{ color: palette.textSecondary, fontSize: 19, lineHeight: 27 }}>
        Choose which navigator opens after you confirm.
      </Text>

      <View
        style={{
          marginTop: 58,
          padding: space.space4,
          borderRadius: 30,
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
                  minHeight: 64,
                  paddingHorizontal: space.space4,
                  borderRadius: 22,
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
                    fontSize: 20,
                    fontWeight: '700',
                  }}
                >
                  {item.label}
                </Text>
                {selected && (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: palette.textPrimary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: palette.accent,
                      }}
                    />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={onOpenProvider}
          accessibilityRole="button"
          accessibilityLabel="Check installed navigation apps"
          style={{ minHeight: layout.touchMin, justifyContent: 'center', marginTop: space.space3 }}
        >
          <Text style={{ color: palette.textSecondary, fontSize: 15 }}>{providerLabel}</Text>
        </Pressable>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 38,
          lineHeight: 46,
          fontWeight: '700',
          marginTop: 56,
        }}
      >
        Appearance
      </Text>
      <View
        style={{
          flexDirection: 'row',
          marginTop: space.space3,
          padding: 6,
          borderRadius: 24,
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
                minHeight: 52,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? palette.textPrimary : 'transparent',
              }}
              testID={`settings-theme-${option.label.toLowerCase()}`}
            >
              <Text
                style={{
                  color: selected ? palette.bg : palette.textSecondary,
                  fontSize: 16,
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
          fontSize: 38,
          lineHeight: 46,
          fontWeight: '700',
          marginTop: 50,
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
          borderRadius: 26,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Text
          style={{ color: palette.textPrimary, fontSize: 20, fontWeight: '700' }}
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
          minHeight: 72,
          marginTop: space.space4,
          borderRadius: 24,
          backgroundColor: theme === 'light' ? '#EFEFED' : palette.surfaceRaised,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="settings-sign-out"
      >
        <Text style={{ color: '#B95656', fontSize: 20, fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </View>
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
