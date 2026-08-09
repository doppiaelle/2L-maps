import { QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '../global.css';
import { ServicesProvider } from '@/features/api/services-provider';
import { SessionProvider, useSession } from '@/features/auth/session-provider';
import { DeepLinkProvider } from '@/features/navigation/deep-link-provider';
import type { DeepLinkPort } from '@/features/navigation/use-pending-deep-link';
import { useStoresHydrated } from '@/features/navigation/use-launch-destination';
import { PERSISTED_STORES } from '@/features/stores';
import { createQueryClient } from '@/lib/query/client';
import {
  createSupabaseAuth,
  createSupabaseFavourites,
  createSupabaseRoutes,
  functionsBaseUrl,
  readSupabaseConfig,
} from '@/lib/supabase/client';

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
const supabaseConfig = readSupabaseConfig();
const auth = createSupabaseAuth(supabaseConfig);
const routes = createSupabaseRoutes(supabaseConfig);
const favourites = createSupabaseFavourites(supabaseConfig);
const baseUrl = functionsBaseUrl(supabaseConfig);

export default function RootLayout(): React.JSX.Element {
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
      <QueryClientProvider client={queryClient}>
        <SessionProvider auth={auth}>
          {/* Inside `SessionProvider`, because the services are null until there
              is a session: every endpoint behind them is authenticated, and a
              query firing during the cold-start gap would cache the signed-out
              answer and leave a paying user on the free allowances. */}
          <ServicesProvider baseUrl={baseUrl} routes={routes} favourites={favourites}>
            <DeepLinkProvider port={linking}>
              <StatusBar style="auto" />
              <RestorationGate />
            </DeepLinkProvider>
          </ServicesProvider>
        </SessionProvider>
      </QueryClientProvider>
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
