import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useConnectivity } from '@/features/network/connectivity-provider';
import { AddStopView } from '@/features/places/AddStopView';
import { useAddressBook } from '@/features/places/use-address-book';
import { usePlaceSearch } from '@/features/places/use-place-search';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { useDraftRouteStore } from '@/features/stores';
import { useLocation } from '@/features/location/location-provider';
import { isOffline } from '@/lib/network/connectivity';
import { newStopId } from '@/lib/route/route-id';
import { placeTextFrom } from '@/lib/route/stop-text';
import { canSubmitSearch, offersCurrentLocation, searchStateOf } from '@/lib/places/search';
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
  const setOrigin = useDraftRouteStore((store) => store.setOrigin);
  const { allowances } = useUsageQuota();
  const search = usePlaceSearch();
  const book = useAddressBook();
  const connectivity = useConnectivity();
  const location = useLocation();

  const state = searchStateOf({
    query: search.query,
    // What the results on screen are answers to. Without it a half-typed address
    // over the previous address's results is indistinguishable from a search
    // that found nothing (ADR-0019).
    submittedQuery: search.submittedQuery,
    // The two sections of one address book, split by when each place was last
    // used (`lib/places/address-book.ts`). Both are free to reuse and both are
    // readable with no signal, which is what makes this modal useful in a
    // basement car park.
    recents: book.recent,
    favourites: book.saved,
    results: search.results,
    isSearching: search.isSearching,
    // The reason the last attempt failed, carried through instead of discarded.
    // Without it a 404, a 402 or a dead network all reached this screen as an
    // empty list and were shown as "no match" — the app blaming the address for
    // a fault on our side (`CLAUDE.md` §0 rule 5).
    failure: search.failure,
    // Was hard-coded false, which made every offline state in this modal
    // reachable from a test and from nowhere else. Search needs the network;
    // the address book does not, which is what keeps this screen useful in a
    // basement car park (ADR-0008).
    isOffline: isOffline(connectivity),
    stopCount: draft.stops.length,
    maxStops: allowances.maxStopsPerRoute,
  });

  const add = (option: SourcedOption) => {
    addStopToDraft({
      // Short and generated. Embedding the place id here put it over the
      // contract's 64-character ceiling for a long address, and it is already
      // carried in its own field on the next line.
      id: newStopId(),
      placeId: option.placeId,
      label: null,
      // **Google already told us what this place is called — keep it.**
      // Throwing these two lines away is what made every row depend on a
      // second, billed `/place-details` round trip to recover text we had been
      // handed for free, and what put "Address needs refreshing" on stops the
      // user had just picked from a working search. Perishable, on the same
      // thirty-day clock as a coordinate (ADR-0007).
      placeText: placeTextFrom(option, new Date()),
      note: null,
      position: draft.stops.length,
      entryOrder: draft.stops.length,
      // No coordinate yet: the durable key is the `place_id`, and the coordinate
      // arrives from the places query on Plan (ADR-0007). Inventing one here
      // would be a coordinate with no refresh date, which is the one thing the
      // expiry rule cannot handle.
      coordinate: null,
    });

    // Recorded whatever the source. A book that only remembers what was already
    // in it never fills up, and a place found by search is exactly the one worth
    // remembering — it has just cost the most it ever will
    // (`docs/31_COST_MODEL.md` §8).
    book.record(option.placeId);

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
      onSubmit={search.submit}
      canSubmit={canSubmitSearch({
        query: search.query,
        submittedQuery: search.submittedQuery,
        isOffline: isOffline(connectivity),
        isSearching: search.isSearching,
      })}
      offersCurrentLocation={offersCurrentLocation(search.query)}
      isLocationDenied={location.permission === 'denied'}
      onUseCurrentLocation={() => {
        void location.enable().then((started) => {
          // Refused, and that is an answer rather than an error: the row stays
          // and explains itself, and the user picks an address instead. Nothing
          // is blocked (docs/18_PERMISSIONS.md §4).
          if (!started) return;

          // The origin, not a stop. A current-location origin has no `place_id`
          // and the draft has modelled it as its own field since the first
          // commit — adding it to the list would put a stop with no durable key
          // into a list keyed by one (ADR-0007).
          setOrigin(null, true);
          router.back();
        });
      }}
      onSelect={add}
      onRetry={search.retry}
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
