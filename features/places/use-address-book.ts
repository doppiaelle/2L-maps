import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useServices } from '@/features/api/services-provider';
import { splitAddressBook, type AddressBook } from '@/lib/places/address-book';
import { GC_TIME_MS, STALE_TIME_MS, queryKeys } from '@/lib/query/client';

const ADDRESS_BOOK_LIMIT = 200;

export interface AddressBookState extends AddressBook {
  readonly isLoading: boolean;
  record: (placeId: string) => void;
}

/** Cached recents and saved places, usable even when autocomplete is offline. */
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
  const book = useMemo(
    () => splitAddressBook(entries ?? [], now),
    // The recent/saved boundary changes daily, not while the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, now.toISOString().slice(0, 10)],
  );

  const mutation = useMutation({
    mutationFn: (placeId: string) => services?.favourites.recordUse(placeId) ?? Promise.resolve(),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook() });
    },
  });

  return {
    ...book,
    isLoading: query.isLoading,
    record: (placeId) => mutation.mutate(placeId),
  };
}
