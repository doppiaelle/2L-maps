import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { SettingsView } from './SettingsView';
import { SubscriptionView } from './SubscriptionView';
import { useSession } from '@/features/auth/session-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { usePreferencesStore } from '@/features/stores';
import {
  clearAppTrace,
  formatAppTrace,
  getAppTraceEntries,
  subscribeAppTrace,
} from '@/lib/diagnostics/app-trace';
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
  const [, setTraceVersion] = useState(0);

  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setSelectedPlan(currentPlan), [currentPlan]);
  useEffect(
    () =>
      subscribeAppTrace(() => {
        setTraceVersion((version) => version + 1);
      }),
    [],
  );

  const traceEntries = getAppTraceEntries();
  const traceText = formatAppTrace(traceEntries);

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
      onClearTrace={clearAppTrace}
      onOpenSubscription={() => setView('subscription')}
      onShareTrace={() => {
        void Share.share({ message: traceText });
      }}
      onSignOut={() => {
        void signOut();
      }}
      traceEventCount={traceEntries.length}
      traceText={traceText}
      theme={theme}
      testID="settings-screen"
    />
  );
}
