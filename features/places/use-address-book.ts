import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useServices } from '@/features/api/services-provider';
import { splitAddressBook, type AddressBook } from '@/lib/places/address-book';
import { GC_TIME_MS, STALE_TIME_MS, queryKeys } from '@/lib/query/client';

/**
 * The user's address book.
 *
 * **Retained for twenty-four hours, which is what makes reuse work with no
 * signal** ([ADR-0008](../../docs/adr/0008-offline-scope.md)). A driver in a
 * basement car park should still be able to add this morning's depot: the
 * `place_id` is already known, so nothing about that stop needs a network.
 *
 * **Recording a use is optimistic and never blocks.** The user is adding a stop;
 * the book updating is our filing, not theirs
 * ([`docs/06_UX_GUIDELINES.md`](../../docs/06_UX_GUIDELINES.md)). A failure is
 * absorbed — the worst case is that one address costs a search once more.
 */

/** Enough for the book to be a book without paging a list nobody scrolls. The
 *  local filter in `localMatches` narrows it as the user types. */
const ADDRESS_BOOK_LIMIT = 200;

export interface AddressBookState extends AddressBook {
  readonly isLoading: boolean;
  /** Add or bump an entry. Fire and forget: nothing waits on it. */
  record: (placeId: string) => void;
}

export function useAddressBook(now: Date = new Date()): AddressBookState {
  const services = useServices();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.addressBook(),
    enabled: services !== null,
    staleTime: STALE_TIME_MS.savedData,
    gcTime: GC_TIME_MS.savedData,
    queryFn: () => services?.favourites.list(ADDRESS_BOOK_LIMIT) ?? Promise.resolve(null),
  });

  const entries = query.data ?? null;

  // Split on a stable clock per render rather than inside the component tree, so
  // an entry cannot be "recent" in one section and "saved" in the other because
  // the millisecond moved between two reads.
  const book = useMemo(
    () => splitAddressBook(entries ?? [], now),
    // `now` is a new Date on every render by default; keying on its day is what
    // stops the split from being recomputed sixty times a second while a user
    // types, when the boundary it decides moves once a day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, now.toISOString().slice(0, 10)],
  );

  const mutation = useMutation({
    mutationFn: (placeId: string) => services?.favourites.recordUse(placeId) ?? Promise.resolve(),
    // Nothing ever reads this mutation's result — the caller is already on
    // another screen by the time it settles — so retaining it is a timer held
    // open for an answer nobody will ask for.
    gcTime: 0,
    onSuccess: () => {
      // Refetched rather than patched: the server owns `use_count`, and a client
      // that increments its own copy will disagree with the second device that
      // did the same.
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook() });
    },
  });

  return {
    ...book,
    isLoading: query.isLoading,
    record: (placeId) => {
      // **Recorded for every source, a fresh search included.** A book that only
      // remembers what was already in it never fills up and the cost lever never
      // engages — and a first search is exactly the moment worth remembering,
      // because it has just cost the most it ever will.
      mutation.mutate(placeId);
    },
  };
}
