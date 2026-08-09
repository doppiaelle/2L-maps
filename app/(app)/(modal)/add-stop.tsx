import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AddStopView } from '@/features/places/AddStopView';
import { usePlaceSearch } from '@/features/places/use-place-search';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { useDraftRouteStore } from '@/features/stores';
import { searchStateOf } from '@/lib/places/search';
import type { SourcedOption } from '@/lib/places/search';

/**
 * Add a stop — presented over Plan, dismissed back to it
 * ([`docs/10_NAVIGATION_FLOW.md`](../../../docs/10_NAVIGATION_FLOW.md) §6).
 *
 * Composition only. `searchStateOf` decides what is shown and whether anything
 * is worth asking the server; `usePlaceSearch` owns the debounce, the session
 * token and the cancellation. This file reads and hands over.
 *
 * The ceiling is the **plan's**, not the product's: a free user is stopped at
 * their own limit and told which one it is, rather than at a number that belongs
 * to somebody else's subscription ([ADR-0015](../../../docs/adr/0015-ad-supported-free-tier.md)).
 */
export default function AddStopScreen(): React.JSX.Element {
  const scheme = useColorScheme();

  const draft = useDraftRouteStore((store) => store.draft);
  const addStopToDraft = useDraftRouteStore((store) => store.addStopToDraft);
  const { allowances } = useUsageQuota();
  const search = usePlaceSearch();

  const state = searchStateOf({
    query: search.query,
    // Recents and favourites arrive with their own query in a later change;
    // until then the free options are empty and the state machine is unchanged
    // by that — it already treats an empty list as "nothing to reuse".
    recents: [],
    favourites: [],
    results: search.results,
    isSearching: search.isSearching,
    isOffline: false,
    stopCount: draft.stops.length,
    maxStops: allowances.maxStopsPerRoute,
  });

  const add = (option: SourcedOption) => {
    addStopToDraft({
      id: `${option.placeId}:${Date.now()}`,
      placeId: option.placeId,
      label: null,
      note: null,
      position: draft.stops.length,
      entryOrder: draft.stops.length,
      // No coordinate yet: the durable key is the `place_id`, and the coordinate
      // arrives from the places query on Plan (ADR-0007). Inventing one here
      // would be a coordinate with no refresh date, which is the one thing the
      // expiry rule cannot handle.
      coordinate: null,
      isCompleted: false,
    });

    // Ends the billed session, then returns to the working surface. The user
    // adds one stop and is back on Plan — the second of the three taps.
    search.endSession();
    router.back();
  };

  return (
    <AddStopView
      state={state}
      query={search.query}
      onQueryChange={search.setQuery}
      onSelect={add}
      onAddManually={() => {
        // A manual label needs a place to attach to and has no `place_id`;
        // that path lands with the import flow, which already has to solve
        // "an address we cannot resolve".
        router.push('/import');
      }}
      onDismiss={() => {
        router.back();
      }}
      theme={scheme === 'dark' ? 'dark' : 'light'}
      testID="add-stop-screen"
    />
  );
}
