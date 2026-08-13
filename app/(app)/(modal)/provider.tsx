import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { ProviderPickerView } from '@/features/handoff/ProviderPickerView';
import { useDraftRouteStore, usePreferencesStore } from '@/features/stores';
import { useAppTheme } from '@/features/preferences/use-app-theme';
import { createNavigationProvider } from '@/lib/api/navigation-adapter';
import type { NavigationProviderId } from '@/types';

/**
 * Choosing the navigation app — presented on the first handoff, and reachable
 * from Settings afterwards.
 *
 * Which providers are *installed* can only be answered by the platform, and on
 * iOS only for schemes declared at build time
 * ([`docs/18_PERMISSIONS.md`](../../../docs/18_PERMISSIONS.md)). So it is asked
 * once, on mount, rather than assumed.
 */
export default function ProviderScreen(): React.JSX.Element {
  const theme = useAppTheme();

  const stopCount = useDraftRouteStore((store) => store.draft.stops.length);
  const selected = usePreferencesStore((store) => store.preferences.navigationProvider);
  const chooseNavigationProvider = usePreferencesStore((store) => store.chooseNavigationProvider);

  const [available, setAvailable] = useState<readonly NavigationProviderId[]>([]);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const navigation = createNavigationProvider({
      linking: {
        canOpenUrl: (url: string) => Linking.canOpenURL(url),
        openUrl: (url: string) => Linking.openURL(url),
      },
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });

    let cancelled = false;
    void navigation.installedProviders().then((providers) => {
      if (!cancelled) setAvailable(providers);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ProviderPickerView
      available={available}
      selected={selected}
      stopCount={stopCount}
      remember={remember}
      onRememberChange={setRemember}
      onChoose={(provider) => {
        chooseNavigationProvider(provider, remember);
        // Straight back to the route. The picker is a detour on the way to the
        // third tap, not a destination.
        router.back();
      }}
      theme={theme}
      testID="provider-screen"
    />
  );
}
