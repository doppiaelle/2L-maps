import { SettingsView } from './SettingsView';
import { useSession } from '@/features/auth/session-provider';
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
  const provider = usePreferencesStore((store) => store.preferences.navigationProvider);
  const chooseProvider = usePreferencesStore((store) => store.chooseNavigationProvider);

  return (
    <SettingsView
      provider={provider}
      onBack={onBack}
      onChooseProvider={chooseProvider}
      onSignOut={() => {
        void signOut();
      }}
      theme={theme}
      testID="settings-screen"
    />
  );
}
