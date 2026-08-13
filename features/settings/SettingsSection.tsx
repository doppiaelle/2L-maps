import { useEffect, useState } from 'react';

import { SettingsView } from './SettingsView';
import { SubscriptionView } from './SubscriptionView';
import { useSession } from '@/features/auth/session-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { usePreferencesStore } from '@/features/stores';
import type { ThemeName } from '@/lib/design/tokens';
import type { PlanTier } from '@/types';

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
  readonly initialView?: 'settings' | 'subscription';
  onBack: () => void;
}

export function SettingsSection({
  theme,
  initialView = 'settings',
  onBack,
}: SettingsSectionProps): React.JSX.Element {
  const { signOut } = useSession();
  const provider = usePreferencesStore((store) => store.preferences.navigationProvider);
  const chooseProvider = usePreferencesStore((store) => store.chooseNavigationProvider);
  const quota = useUsageQuota();
  const currentPlan = quota.allowances.plan;
  const [view, setView] = useState(initialView);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(currentPlan);

  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setSelectedPlan(currentPlan), [currentPlan]);

  if (view === 'subscription') {
    return (
      <SubscriptionView
        currentPlan={currentPlan}
        currentAllowances={quota.allowances}
        selectedPlan={selectedPlan}
        onBack={() => setView('settings')}
        onChoosePlan={setSelectedPlan}
        theme={theme}
        testID="subscription-screen"
      />
    );
  }

  return (
    <SettingsView
      provider={provider}
      currentPlan={currentPlan}
      onBack={onBack}
      onChooseProvider={chooseProvider}
      onOpenSubscription={() => setView('subscription')}
      onSignOut={() => {
        void signOut();
      }}
      theme={theme}
      testID="settings-screen"
    />
  );
}
