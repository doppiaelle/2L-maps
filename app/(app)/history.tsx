import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import { HistoryView } from '@/features/routes/HistoryView';
import { useOpenRoute } from '@/features/routes/use-open-route';
import { useSavedRoutes } from '@/features/routes/use-saved-routes';

/**
 * History — saved and past routes
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * A deliberate destination, so it is pushed rather than swapped: the user asked
 * to leave Plan and expects to come back to it.
 *
 * Composition only. `useSavedRoutes` decides what is visible and what is over
 * the allowance, `useOpenRoute` restores a route and its progress together, and
 * `HistoryView` renders every state. This file reads and routes.
 */
export default function HistoryScreen(): React.JSX.Element {
  const scheme = useColorScheme();
  const saved = useSavedRoutes();
  const { open } = useOpenRoute();

  return (
    <HistoryView
      routes={saved.visible}
      locked={saved.locked}
      isLoading={saved.isLoading}
      isUnavailable={saved.isUnavailable}
      onOpen={(routeId) => {
        void open(routeId).then((opened) => {
          // Back to Plan rather than forward to a detail screen: opening a route
          // is something the user does in order to work on it, and the working
          // surface is Plan (docs/10 §4).
          if (opened) router.replace('/');
        });
      }}
      onRetry={saved.refetch}
      onUpgrade={() => {
        router.push('/paywall');
      }}
      onDismiss={() => {
        router.back();
      }}
      theme={scheme === 'dark' ? 'dark' : 'light'}
      testID="history-screen"
    />
  );
}
