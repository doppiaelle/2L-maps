import { useQuery } from '@tanstack/react-query';

import { useServices } from '@/features/api/services-provider';
import type { LatLng } from '@/lib/geo/haversine';
import { GC_TIME_MS, STALE_TIME_MS } from '@/lib/query/client';
import type { PlaceId } from '@/types';

/**
 * Addresses and coordinates for a set of `place_id`s.
 *
 * This is the join the whole product rests on. `place_id` is the durable key
 * and everything Google-derived beside it perishes at thirty days
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)) —
 * `formatted_address` included, since the purge job nulls it alongside the
 * coordinates ([`docs/12_DATABASE.md`](../../docs/12_DATABASE.md)). So a saved
 * route arrives as ids, and this hook turns them back into something a driver
 * can read.
 *
 * **The result is a partial answer, always.** `resolveBatch` reports resolved
 * and unresolved separately, and both are passed through: an import of thirty
 * addresses must not be thrown away because two could not be re-resolved
 * (`CLAUDE.md` §0 rule 5).
 *
 * Retained for twenty-four hours, which *is* the offline story
 * ([ADR-0008](../../docs/adr/0008-offline-scope.md)) — long retention is what
 * lets a driver read their day with no signal at all.
 */

export interface ResolvedPlaces {
  readonly byPlaceId: ReadonlyMap<PlaceId, { address: string; coordinate: LatLng }>;
  /** Named rather than counted, so the screen can point at the rows that need
   *  attention instead of saying "some stops could not be loaded". */
  readonly unresolved: readonly PlaceId[];
  readonly isLoading: boolean;
}

const EMPTY: ReadonlyMap<PlaceId, { address: string; coordinate: LatLng }> = new Map();

export const placesQueryKey = (placeIds: readonly PlaceId[]) =>
  // Sorted so two screens asking for the same stops in a different order share
  // one cache entry and one billed batch.
  ['places', [...placeIds].sort().join(',')] as const;

export function useResolvedPlaces(placeIds: readonly PlaceId[]): ResolvedPlaces {
  const services = useServices();

  const query = useQuery({
    queryKey: placesQueryKey(placeIds),
    enabled: services !== null && placeIds.length > 0,
    staleTime: STALE_TIME_MS.savedData,
    gcTime: GC_TIME_MS.savedData,
    queryFn: async () => {
      if (services === null) return { resolved: [], unresolved: [...placeIds] };

      const result = await services.geocoding.resolveBatch(placeIds);
      // A failure is not an empty answer. Reporting every id as unresolved lets
      // the screen say the stops need refreshing rather than silently showing a
      // route with no addresses.
      if (!result.ok) return { resolved: [], unresolved: [...placeIds] };

      return { resolved: result.resolved, unresolved: result.unresolved };
    },
  });

  if (query.data === undefined) {
    return { byPlaceId: EMPTY, unresolved: [], isLoading: query.isLoading };
  }

  const byPlaceId = new Map(
    query.data.resolved.map((place) => [
      place.placeId,
      { address: place.formattedAddress, coordinate: place.coordinate },
    ]),
  );

  return { byPlaceId, unresolved: query.data.unresolved, isLoading: false };
}
