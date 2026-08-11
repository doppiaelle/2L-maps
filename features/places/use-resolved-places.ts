import { useQuery } from '@tanstack/react-query';

import { useServices } from '@/features/api/services-provider';
import type { LatLng } from '@/lib/geo/haversine';
import { GC_TIME_MS, STALE_TIME_MS } from '@/lib/query/client';
import type { GeocodingFailure } from '@/lib/providers/types';
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
 * **What comes back is written into the stops** by the screen
 * (`applyResolvedCoordinates`), which is what stops this hook being on the
 * critical path of every render. Before that, a row's address and its marker
 * both depended on a live round trip every single time — and because the query
 * key is the *set* of ids, adding or removing one stop made it a query nobody
 * had run, blanking every coordinate at once.
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

export interface ResolvedPlace {
  readonly address: string;
  readonly coordinate: LatLng;
}

export interface ResolvedPlaces {
  readonly byPlaceId: ReadonlyMap<PlaceId, ResolvedPlace>;
  /**
   * Ids the server answered about and could not place.
   *
   * Distinct from a failure: these are the ones Google itself does not resolve,
   * which happens to individual ids and not to the batch — most often an id the
   * import flow got from the Geocoding API for an interpolated address, which
   * Places Details cannot retrieve. Named rather than counted, so the screen can
   * point at the rows that need attention.
   */
  readonly unresolved: readonly PlaceId[];
  readonly isLoading: boolean;
  /**
   * Why the last attempt failed, or null.
   *
   * **This used to be indistinguishable from success.** A failed `resolveBatch`
   * returned `{resolved: [], unresolved: everything}` as the query's *value*, so
   * React Query saw a successful fetch: `shouldRetry` never engaged, the empty
   * answer was cached for twenty-four hours, and every row on screen said
   * "Address needs refreshing" with nothing anywhere naming the reason — an
   * exhausted allowance and a dead radio produced the same silence.
   */
  readonly failure: GeocodingFailure | null;
  /** Ask again. The only way out of the failed state that does not involve
   *  deleting the stop and adding it back. */
  retry: () => void;
}

const EMPTY: ReadonlyMap<PlaceId, ResolvedPlace> = new Map();

export const placesQueryKey = (placeIds: readonly PlaceId[]) =>
  // Sorted so two screens asking for the same stops in a different order share
  // one cache entry and one billed batch.
  ['places', [...placeIds].sort().join(',')] as const;

/** Carried on the thrown error so the hook can report *why* without the screen
 *  having to parse a message. */
class ResolveFailed extends Error {
  constructor(readonly failure: GeocodingFailure) {
    super('places could not be resolved');
    this.name = 'ResolveFailed';
  }
}

export function useResolvedPlaces(placeIds: readonly PlaceId[]): ResolvedPlaces {
  const services = useServices();

  const query = useQuery({
    queryKey: placesQueryKey(placeIds),
    enabled: services !== null && placeIds.length > 0,
    staleTime: STALE_TIME_MS.savedData,
    gcTime: GC_TIME_MS.savedData,
    queryFn: async () => {
      if (services === null) throw new ResolveFailed({ kind: 'offline' });

      const result = await services.geocoding.resolveBatch(placeIds);
      // **Thrown, not returned.** A failure has to reach React Query as a
      // failure or none of the machinery that exists for failures runs: no
      // retry, no `isError`, and the empty answer cached as though it were the
      // truth for a day.
      if (!result.ok) throw new ResolveFailed(result.failure);

      return { resolved: result.resolved, unresolved: result.unresolved };
    },
  });

  /**
   * Why the last attempt failed — for **every** way it can fail.
   *
   * `instanceof ResolveFailed` alone was a hole with a screenshot attached. Any
   * other throw — a schema rejection inside the adapter, a `TypeError` on a
   * response shape nobody expected — left `failure` null while `data` stayed
   * undefined and `isLoading` went false, and the screen rendered two rows
   * saying "Address needs refreshing" with no notice, no reason and no retry.
   * The one state this product may not have is one that looks like an answer
   * (`CLAUDE.md` §0 rule 5).
   *
   * An unrecognised throw is reported as `upstream-unavailable`: it is ours, it
   * is not the user's connection, and retrying is honest because we do not know
   * that it will fail again.
   */
  const failure: GeocodingFailure | null =
    query.error === null
      ? null
      : query.error instanceof ResolveFailed
        ? query.error.failure
        : { kind: 'upstream-unavailable' };

  const retry = () => {
    void query.refetch();
  };

  if (query.data === undefined) {
    return { byPlaceId: EMPTY, unresolved: [], isLoading: query.isLoading, failure, retry };
  }

  const byPlaceId = new Map(
    query.data.resolved.map((place) => [
      place.placeId,
      { address: place.formattedAddress, coordinate: place.coordinate },
    ]),
  );

  return { byPlaceId, unresolved: query.data.unresolved, isLoading: false, failure, retry };
}
