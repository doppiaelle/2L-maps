import { Pressable, Text, View } from 'react-native';

import { colours, layout, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

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
  onOpenPaywall: () => void;
  onOpenProvider: () => void;
  onSignOut: () => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function SettingsView({
  planLabel,
  usageLabel,
  providerLabel,
  onOpenPaywall,
  onOpenProvider,
  onSignOut,
  theme,
  testID,
}: SettingsViewProps): React.JSX.Element {
  return (
    <View style={{ flex: 1, padding: layout.screenPadding }} testID={testID}>
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        Settings
      </Text>

      <Section title="Plan" theme={theme}>
        <Text className="text-body text-text-primary" testID="settings-plan">
          {planLabel}
        </Text>
        <Text className="text-caption text-text-secondary" testID="settings-usage">
          {usageLabel}
        </Text>
        <Row
          label="See plans"
          hint="Opens the plans and prices"
          onPress={onOpenPaywall}
          theme={theme}
        />
      </Section>

      <Section title="Navigation" theme={theme}>
        <Row
          label={providerLabel}
          hint="Changes which app your routes are handed to"
          onPress={onOpenProvider}
          theme={theme}
        />
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
