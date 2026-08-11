import { router } from 'expo-router';

import { HistoryView } from './HistoryView';
import { useOpenRoute } from './use-open-route';
import { useSavedRoutes } from './use-saved-routes';
import type { ThemeName } from '@/lib/design/tokens';
import { saveNoticeOf } from '@/lib/route/save-notice';
import type { SaveFailure } from '@/lib/supabase/routes-adapter';

/**
 * History, as a dock section.
 *
 * The container that used to be `app/(app)/history.tsx`. `HistoryView` is
 * unchanged; only what mounts it moved
 * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)).
 *
 * **Opening a route no longer navigates.** It used to `router.replace('/')`,
 * because History was a pushed screen and the working surface was somewhere
 * else. Now the working surface is one section across, so opening a route closes
 * this one and reveals the map with the route already on it — no transition, and
 * nothing to come back from.
 */

export interface HistorySectionProps {
  /** Called once a route has actually been restored. Closing before the store
   *  has the route would show the map with the previous one still on it. */
  onOpenRoute: () => void;
  /**
   * The last write to the server that did not land, or null.
   *
   * **It arrives as a prop rather than from a second `useRouteSync()`.** Two
   * instances of that hook would be two independent write queues for one route,
   * and the second would happily upsert over the first. The screen owns the one
   * instance and hands the outcome down.
   */
  readonly saveFailure?: SaveFailure | null;
  onRetrySave?: () => void;
  readonly theme: ThemeName;
}

export function HistorySection({
  onOpenRoute,
  saveFailure = null,
  onRetrySave,
  theme,
}: HistorySectionProps): React.JSX.Element {
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
          if (opened) onOpenRoute();
        });
      }}
      onRetry={saved.refetch}
      notice={saveNoticeOf(saveFailure)}
      {...(onRetrySave === undefined ? {} : { onRetryNotice: onRetrySave })}
      onUpgrade={() => {
        router.push('/paywall');
      }}
      // The dock's close control is the way out, and it is always on screen.
      // Dismissing from inside the section as well would be two controls for one
      // outcome, and the one in the dock is the one that is always there.
      onDismiss={onOpenRoute}
      theme={theme}
      testID="history-screen"
    />
  );
}
