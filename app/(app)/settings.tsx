import { router } from 'expo-router';
import { Pressable, Text, View, useColorScheme } from 'react-native';

import { useSession } from '@/features/auth/session-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { usePreferencesStore } from '@/features/stores';
import { colours, layout, space } from '@/lib/design/tokens';

/**
 * Settings — account, preferences, legal
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * **The allowance is stated as a number, not as a bar.** A driver deciding
 * whether to optimize now or wait for the reset needs "12 of 15 used, resets on
 * the 1st", and a progress bar answers neither question.
 *
 * Account deletion is the one destructive action this product confirms rather
 * than offering undo for, because it is the one undo cannot reverse
 * ([`docs/06_UX_GUIDELINES.md`](../../docs/06_UX_GUIDELINES.md) P8).
 */
export default function SettingsScreen(): React.JSX.Element {
  const scheme = useColorScheme();
  const palette = colours[scheme === 'dark' ? 'dark' : 'light'];

  const { signOut } = useSession();
  const { quota, allowances } = useUsageQuota();
  const provider = usePreferencesStore((store) => store.preferences.navigationProvider);

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg, padding: layout.screenPadding }}
      testID="settings-screen"
    >
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        Settings
      </Text>

      <Section title="Plan" theme={scheme === 'dark' ? 'dark' : 'light'}>
        <Text className="text-body text-text-primary" testID="settings-plan">
          {allowances.plan === 'pro'
            ? '2L Maps Pro'
            : allowances.plan === 'day-pass'
              ? 'Day pass'
              : 'Free'}
        </Text>
        <Text className="text-caption text-text-secondary" testID="settings-usage">
          {quota === null
            ? 'Allowance unavailable — showing free limits'
            : `${quota.usage.optimizations} of ${allowances.optimizationsPerPeriod} optimizations used, resets ${quota.periodEndsAt}`}
        </Text>
        <Row
          label="See plans"
          hint="Opens the plans and prices"
          onPress={() => {
            router.push('/paywall');
          }}
          theme={scheme === 'dark' ? 'dark' : 'light'}
        />
      </Section>

      <Section title="Navigation" theme={scheme === 'dark' ? 'dark' : 'light'}>
        <Row
          label={provider === null ? 'Choose a navigation app' : `Navigating with ${provider}`}
          hint="Changes which app your routes are handed to"
          onPress={() => {
            router.push('/provider');
          }}
          theme={scheme === 'dark' ? 'dark' : 'light'}
        />
      </Section>

      <View style={{ flex: 1 }} />

      <Row
        label="Sign out"
        hint="Signs you out on this device. Your saved routes stay in your account."
        onPress={() => {
          void signOut();
        }}
        theme={scheme === 'dark' ? 'dark' : 'light'}
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
  theme: 'light' | 'dark';
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
  theme: 'light' | 'dark';
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
