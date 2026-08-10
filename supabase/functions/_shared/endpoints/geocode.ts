import { ApiError } from '../errors.ts';
import { writePlaces } from '../places-cache.ts';

import type { DatabaseClient } from '../dependencies.ts';
import type { UpstreamOutcome } from '../pipeline.ts';

/**
 * `/geocode` — batch resolution for list import.
 *
 * **No cache read, and that asymmetry with `/place-details` is deliberate.** This
 * endpoint is keyed by a free-text address, and two users typing the same street
 * two different ways are two different keys for one place. Caching on the input
 * string would be a cache with a near-zero hit rate and a real risk of returning
 * the wrong building for a near-miss spelling.
 *
 * It still **writes** what it resolves, because the answer arrives keyed by
 * `place_id` — which is a good key — and that write is what makes the *next*
 * `/place-details` call free ([`docs/31_COST_MODEL.md`](../../../../docs/31_COST_MODEL.md)).
 * The cheap path is not the one this endpoint takes; it is the one it creates.
 *
 * Partial success is the rule: thirty addresses with two unreadable lines yields
 * twenty-eight stops and two named rows. Discarding a batch for one bad line is
 * the failure this whole shape exists to prevent (`CLAUDE.md` §0 rule 5).
 */

export interface PlacesGeocodePort {
  geocode: (
    addresses: readonly string[],
    region: string,
  ) => Promise<{
    readonly resolved: readonly {
      readonly placeId: string;
      readonly formattedAddress: string;
      readonly lat: number;
      readonly lng: number;
      readonly index: number;
    }[];
    readonly unresolved: readonly { readonly index: number; readonly input: string }[];
    readonly outage: unknown;
  }>;
}

export interface GeocodeResult {
  readonly resolved: readonly {
    readonly placeId: string;
    readonly formattedAddress: string;
    readonly lat: number;
    readonly lng: number;
    readonly index: number;
  }[];
  readonly unresolved: readonly { readonly index: number; readonly input: string }[];
}

export interface GeocodeDependencies {
  readonly database: DatabaseClient;
  readonly places: PlacesGeocodePort;
}

export async function geocodeUpstream(
  request: { readonly addresses: readonly string[]; readonly region?: string | null },
  deps: GeocodeDependencies,
): Promise<UpstreamOutcome<GeocodeResult>> {
  const outcome = await deps.places.geocode(request.addresses, request.region ?? 'IT');

  if (outcome.outage !== null) {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service', {
      degradationHint: 'RETRY_LATER',
    });
  }

  // The index is the caller's row number and means nothing to the cache, so it
  // is dropped here rather than stored and ignored later.
  await writePlaces(
    deps.database,
    outcome.resolved.map(({ placeId, formattedAddress, lat, lng }) => ({
      placeId,
      formattedAddress,
      lat,
      lng,
    })),
  );

  return {
    result: { resolved: outcome.resolved, unresolved: outcome.unresolved },
    tier: null,
    // Billed per address submitted, not per address resolved: Google charged us
    // for the lookups that came back empty too.
    units: request.addresses.length,
  };
}
