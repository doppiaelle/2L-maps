import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { ThemePreference } from '@/features/preferences/preferences-store';
import type { NavigationProviderId } from '@/types';

/**
 * Settings — account, preferences, legal
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * Extracted from `app/(app)/settings.tsx`, which was the one screen in the app
 * with its markup inline. That was survivable while Settings was a pushed route;
 * it is not once Settings is a dock section, because a section is rendered by the
 * screen that owns the map rather than navigated to
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)). The move is
 * mechanical — no behaviour changed — and it puts this file where every other
 * view already lives, taking callbacks and no router.
 *
 * **The allowance is stated as a number, not as a bar.** A driver deciding
 * whether to optimize now or wait for the reset needs "12 of 15 used, resets on
 * the 1st", and a progress bar answers neither question.
 *
 * Account deletion is the one destructive action this product confirms rather
 * than offering undo for, because it is the one undo cannot reverse
 * ([`docs/06_UX_GUIDELINES.md`](../../docs/06_UX_GUIDELINES.md) P8).
 */

export interface SettingsViewProps {
  readonly planLabel: string;
  /** Already worded by the caller — it needs the quota and the allowances, and
   *  this view should not have to know that one can be absent. */
  readonly usageLabel: string;
  readonly providerLabel: string;
  readonly provider: NavigationProviderId | null;
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
  onOpenPaywall,
  onOpenProvider,
  onChooseProvider,
  onSignOut,
  themePreference,
  onChooseTheme,
  theme,
  testID,
}: SettingsViewProps): React.JSX.Element {
  return (
    <View style={{ flex: 1, padding: layout.screenPadding }} testID={testID}>
      <Text
        accessibilityRole="header"
        style={{
          color: colours[theme].textPrimary,
          fontSize: 24,
          lineHeight: 30,
          fontWeight: '700',
        }}
      >
        Settings
      </Text>

      <Section title="Navigation" theme={theme}>
        <Text
          style={{ color: colours[theme].textSecondary, fontSize: 11, marginBottom: space.space2 }}
        >
          Choose which navigator opens after confirmation.
        </Text>
        <View
          style={{
            borderRadius: radius.radiusMd,
            backgroundColor: colours[theme].surface,
            borderWidth: 1,
            borderColor: colours[theme].border,
            overflow: 'hidden',
          }}
          testID="settings-provider-list"
        >
          {PROVIDERS.map((item, index) => {
            const selected = provider === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => onChooseProvider(item.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Use ${item.label}`}
                style={{
                  minHeight: 48,
                  paddingHorizontal: space.space3,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: selected ? colours[theme].accentSubtle : 'transparent',
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colours[theme].border,
                }}
                testID={`settings-provider-${item.value}`}
              >
                <Text
                  style={{
                    color: selected ? colours[theme].accent : colours[theme].textPrimary,
                    fontSize: 13,
                    fontWeight: selected ? '700' : '400',
                  }}
                >
                  {item.label}
                </Text>
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: selected ? colours[theme].accent : colours[theme].border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colours[theme].accent,
                      }}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onOpenProvider}
          accessibilityRole="button"
          accessibilityLabel="Check installed navigation apps"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colours[theme].textSecondary, fontSize: 11 }}>
            {providerLabel} · Check availability
          </Text>
        </Pressable>
      </Section>

      <Section title="Appearance" theme={theme}>
        <View
          accessibilityRole="radiogroup"
          style={{
            flexDirection: 'row',
            padding: space.space1,
            borderRadius: radius.radiusSm,
            borderWidth: 1,
            borderColor: colours[theme].border,
            backgroundColor: colours[theme].surface,
          }}
          testID="settings-theme-selector"
        >
          {THEME_OPTIONS.map((option) => {
            const isSelected = option.value === themePreference;
            return (
              <Pressable
                key={option.label}
                onPress={() => onChooseTheme(option.value)}
                accessibilityRole="radio"
                accessibilityLabel={`Use ${option.label.toLowerCase()} theme`}
                accessibilityState={{ checked: isSelected }}
                style={{
                  flex: 1,
                  minHeight: layout.touchMin,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.radiusSm,
                  backgroundColor: isSelected ? colours[theme].textPrimary : 'transparent',
                }}
                testID={`settings-theme-${option.label.toLowerCase()}`}
              >
                <Text
                  className="text-label-xs uppercase"
                  style={{
                    color: isSelected ? colours[theme].bg : colours[theme].textSecondary,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Account" theme={theme}>
        <View
          style={{
            borderRadius: radius.radiusMd,
            padding: space.space3,
            backgroundColor: colours[theme].surface,
            borderWidth: 1,
            borderColor: colours[theme].border,
          }}
        >
          <Text
            style={{ color: colours[theme].textPrimary, fontSize: 13, fontWeight: '700' }}
            testID="settings-plan"
          >
            {planLabel}
          </Text>
          <Text
            style={{ color: colours[theme].textSecondary, fontSize: 11, marginTop: space.space1 }}
            testID="settings-usage"
          >
            {usageLabel}
          </Text>
          <Row
            label="See plans"
            hint="Opens the plans and prices"
            onPress={onOpenPaywall}
            theme={theme}
          />
        </View>
      </Section>

      <View style={{ flex: 1 }} />

      <Row
        label="Sign out"
        hint="Signs you out on this device. Your saved routes stay in your account."
        onPress={onSignOut}
        theme={theme}
        testID="settings-sign-out"
      />
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

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ThemeName;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={{ marginTop: space.space5 }}>
      <Text
        className="text-label-sm text-text-secondary"
        accessibilityRole="header"
        style={{ color: colours[theme].textSecondary }}
      >
        {title.toUpperCase()}
      </Text>
      <View style={{ marginTop: space.space2 }}>{children}</View>
    </View>
  );
}

function Row({
  label,
  hint,
  onPress,
  theme,
  testID,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  theme: ThemeName;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Says what happens, not what the row is (CLAUDE.md §10 rule 1).
      accessibilityHint={hint}
      style={{ minHeight: layout.touchMin, justifyContent: 'center', marginTop: space.space2 }}
      testID={testID}
    >
      <Text className="text-body text-accent" style={{ color: colours[theme].accent }}>
        {label}
      </Text>
    </Pressable>
  );
}
