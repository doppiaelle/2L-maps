import { router } from 'expo-router';

import { SettingsView } from './SettingsView';
import { useSession } from '@/features/auth/session-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { usePreferencesStore } from '@/features/stores';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * Settings, as a dock section.
 *
 * The container that used to be `app/(app)/settings.tsx`. A section is rendered
 * by the screen that owns the map rather than navigated to
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)), so the hooks and
 * the routing move here and `SettingsView` stays presentational — the same shape
 * every other feature in this codebase already has.
 *
 * Paywall and provider remain modals. They are transient tasks over whatever is
 * showing, and pushing them does not disturb the section underneath.
 */

export interface SettingsSectionProps {
  readonly theme: ThemeName;
  onBack: () => void;
}

export function SettingsSection({ theme, onBack }: SettingsSectionProps): React.JSX.Element {
  const { signOut } = useSession();
  const { quota, allowances } = useUsageQuota();
  const provider = usePreferencesStore((store) => store.preferences.navigationProvider);
  const themePreference = usePreferencesStore((store) => store.preferences.theme);
  const chooseTheme = usePreferencesStore((store) => store.chooseTheme);
  const chooseProvider = usePreferencesStore((store) => store.chooseNavigationProvider);

  return (
    <SettingsView
      planLabel={
        allowances.plan === 'pro'
          ? '2L Maps Pro'
          : allowances.plan === 'day-pass'
            ? 'Day pass'
            : 'Free'
      }
      // Worded here rather than in the view, because it is the caller that knows
      // the quota can be absent — a view that had to handle that would be making
      // a decision about what the user is told.
      usageLabel={
        quota === null
          ? 'Allowance unavailable — showing free limits'
          : `${quota.usage.optimizations} of ${allowances.optimizationsPerPeriod} optimizations used, resets ${quota.periodEndsAt}`
      }
      providerLabel={provider === null ? 'Choose a navigation app' : `Navigating with ${provider}`}
      provider={provider}
      onBack={onBack}
      onOpenPaywall={() => {
        router.push('/paywall');
      }}
      onOpenProvider={() => {
        router.push('/provider');
      }}
      onChooseProvider={(next) => chooseProvider(next, true)}
      onSignOut={() => {
        void signOut();
      }}
      themePreference={themePreference}
      onChooseTheme={chooseTheme}
      theme={theme}
      testID="settings-screen"
    />
  );
}
