import { HistoryView } from './HistoryView';
import { useOpenRoute } from './use-open-route';
import { useSavedRoutes } from './use-saved-routes';
import type { ThemeName } from '@/lib/design/tokens';

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
  readonly theme: ThemeName;
}

export function HistorySection({ onOpenRoute, theme }: HistorySectionProps): React.JSX.Element {
  const saved = useSavedRoutes();
  const { open } = useOpenRoute();

  return (
    <HistoryView
      routes={[...saved.visible, ...saved.locked]}
      isLoading={saved.isLoading}
      onOpen={(routeId) => {
        void open(routeId).then((opened) => {
          if (opened) onOpenRoute();
        });
      }}
      theme={theme}
      testID="history-screen"
    />
  );
}
