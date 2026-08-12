import { onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';
import { ThemeVariables } from '@/components/design/ThemeVariables';
import { ServicesProvider } from '@/features/api/services-provider';
import { SessionProvider, useSession } from '@/features/auth/session-provider';
import { DeepLinkProvider } from '@/features/navigation/deep-link-provider';
import { LocationProvider } from '@/features/location/location-provider';
import type { DeepLinkPort } from '@/features/navigation/use-pending-deep-link';
import { useStoresHydrated } from '@/features/navigation/use-launch-destination';
import { MonetisationProvider } from '@/features/monetisation/monetisation-provider';
import { ConnectivityProvider } from '@/features/network/connectivity-provider';
import { PERSISTED_STORES } from '@/features/stores';
import { createLocationPort } from '@/lib/location/expo-location-adapter';
import { createConnectivityPort } from '@/lib/network/netinfo-adapter';
import { isOffline, connectivityOf } from '@/lib/network/connectivity';
import { createQueryClient } from '@/lib/query/client';
import { createQueryPersister, queryPersistOptions } from '@/lib/query/persist';
import {
  createSupabaseAuth,
  createSupabaseFavourites,
  createSupabaseRoutes,
} from '@/lib/supabase/client';
import { functionsBaseUrl, readSupabaseConfig } from '@/lib/supabase/config';
import { useAppTheme } from '@/features/preferences/use-app-theme';

/**
 * Root layout.
 *
 * Composition only — no business logic, no fetching (`CLAUDE.md` §1). Every
 * decision it appears to make is imported: `decideLaunch` chooses the
 * destination, `parseDeepLink` validates the link, `createSupabaseAuth` builds
 * the facade.
 *
 * **The splash is held until restoration completes**
 * ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §4). Not for
 * polish: rendering an empty Plan and swapping in the restored route afterwards
 * is a visible flash that reads as data loss, and holding the splash is how the
 * guard resolves *before* the first visible frame rather than as a redirect
 * after it.
 */

// Re-exported by `expo-router` rather than pulled in as its own dependency: the
// router already owns the splash lifecycle, and a second copy of the module
// would race it.
//
// Called at module scope, before the first render can happen. Awaiting it inside
// an effect would already be too late — the splash would have gone.
void SplashScreen.preventAutoHideAsync();

const queryClient = createQueryClient();
const persistOptions = queryPersistOptions(createQueryPersister({ storage: AsyncStorage }));
const connectivity = createConnectivityPort();
// Built once, at the composition root, like every other port. Nothing is
// requested by constructing it: the provider reads a permission that was already
// granted and asks for a new one only when a control is pressed
// (docs/18_PERMISSIONS.md §4).
const location = createLocationPort();

/**
 * React Query's own idea of online, taken from the same port as everybody
 * else's.
 *
 * Without this it uses a browser heuristic that is always true in React Native,
 * so `networkMode: 'offlineFirst'` — which every query and mutation in this app
 * is configured with — never actually engaged. Requests fired into a dead radio
 * and failed one by one instead of pausing and resuming.
 */
onlineManager.setEventListener((setOnline) =>
  connectivity.subscribe((snapshot) => {
    setOnline(!isOffline(connectivityOf(snapshot)));
  }),
);

const supabaseConfig = readSupabaseConfig();
const auth = createSupabaseAuth(supabaseConfig);
const routes = createSupabaseRoutes(supabaseConfig);
const favourites = createSupabaseFavourites(supabaseConfig);
const baseUrl = functionsBaseUrl(supabaseConfig);

export default function RootLayout(): React.JSX.Element {
  // The device's setting, which is what every screen already reads for its
  // inline colours. Binding the class-name variables from the same source is
  // what stops the two halves of the palette disagreeing.
  const theme = useAppTheme();

  const linking = useMemo<DeepLinkPort>(
    () => ({
      getInitialURL: () => Linking.getInitialURL(),
      addEventListener: (listener) => {
        const subscription = Linking.addEventListener('url', ({ url }) => {
          listener(url);
        });
        return () => {
          subscription.remove();
        };
      },
    }),
    [],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Explicit rather than relied upon. The navigator supplies one of these
          on most paths, and `useSafeAreaInsets` silently returns zeros when it
          does not — which is a section starting under the status bar and a dock
          sitting on the gesture bar, with nothing to indicate why. */}
      <SafeAreaProvider>
        {/* Above every screen, because CSS variables inherit down the tree: this
          is what gives `text-primary` and every other colour class a value, and
          what makes those values follow the theme. Without it they resolve to
          nothing (`components/design/ThemeVariables.tsx`). */}
        <ThemeVariables theme={theme}>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <ConnectivityProvider port={connectivity}>
              <SessionProvider auth={auth}>
                {/* Inside `SessionProvider`, because the services are null until
                there is a session: every endpoint behind them is authenticated,
                and a query firing during the cold-start gap would cache the
                signed-out answer and leave a paying user on the free
                allowances. */}
                <ServicesProvider baseUrl={baseUrl} routes={routes} favourites={favourites}>
                  {/* Both null: RevenueCat needs an account and three configured
                  products, AdMob needs an account and a certified CMP for the
                  EEA (ADR-0015). Absence is the ordinary case until they exist,
                  which is what keeps every screen that touches them working. */}
                  <MonetisationProvider billing={null} ads={null}>
                    {/* Above the screens rather than inside one, because the map
                      follows the driver and the add-stop modal needs the same
                      fix: two subscribers would be two GPS subscriptions. */}
                    <LocationProvider port={location}>
                      <DeepLinkProvider port={linking}>
                        <StatusBar style="auto" />
                        <RestorationGate />
                      </DeepLinkProvider>
                    </LocationProvider>
                  </MonetisationProvider>
                </ServicesProvider>
              </SessionProvider>
            </ConnectivityProvider>
          </PersistQueryClientProvider>
        </ThemeVariables>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Holds the splash until both halves of restoration are done.
 *
 * The session and the persisted stores are waited on together: restoring one
 * without the other puts the user on the right screen with the wrong contents
 * (docs/10 §5).
 */
function RestorationGate(): React.JSX.Element | null {
  const { isRestored } = useSession();
  const isStoreHydrated = useStoresHydrated(PERSISTED_STORES);
  const isReady = isRestored && isStoreHydrated;

  useEffect(() => {
    if (isReady) void SplashScreen.hideAsync();
  }, [isReady]);

  // Nothing at all until then. A placeholder here would be the flash this whole
  // sequence exists to prevent.
  if (!isReady) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
