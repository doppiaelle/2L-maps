import { ApiError } from '../errors';
import { readFreshPlaces, writePlaces, type CachedPlace } from '../places-cache';

import type { DatabaseClient } from '../dependencies';
import type { UpstreamOutcome } from '../pipeline';

/**
 * `/place-details` — turn durable `place_id`s back into usable coordinates
 * ([ADR-0007](../../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 *
 * **The cache read lives here rather than in the pipeline's cache step, and that
 * is the whole design of this endpoint.** The pipeline's `readCache` is
 * all-or-nothing: it either answers the request or it does not. Every real
 * request here is partial — a route of twenty-five stops where nineteen were
 * resolved last week and six have expired — and an all-or-nothing cache answers
 * "miss" to all twenty-five, then buys twenty-five lookups to learn six things.
 *
 * So the split happens before the upstream call, and **`units` counts what was
 * actually fetched**. Quota then measures money spent rather than requests made,
 * which is the only version of the figure that means anything: a user re-opening
 * the same route every morning spends nothing after the first, and their
 * allowance should say so.
 *
 * A `place_id` that resolves to nothing upstream is reported unresolved, never
 * dropped. The client shows those rows and offers to re-enter them; discarding
 * them would leave a route with a stop the user can see and the app cannot.
 */

export interface PlacesDetailsPort {
  detailsFor: (placeIds: readonly string[]) => Promise<{
    readonly resolved: readonly CachedPlace[];
    readonly unresolved: readonly string[];
    readonly outage: unknown;
  }>;
}

export interface PlaceDetailsResult {
  readonly resolved: readonly CachedPlace[];
  readonly unresolved: readonly { readonly placeId: string }[];
}

export interface PlaceDetailsDependencies {
  readonly database: DatabaseClient;
  readonly places: PlacesDetailsPort;
  readonly now?: Date;
}

export async function placeDetailsUpstream(
  request: { readonly placeIds: readonly string[] },
  deps: PlaceDetailsDependencies,
): Promise<UpstreamOutcome<PlaceDetailsResult>> {
  const now = deps.now ?? new Date();

  // Deduplicated before anything else. A route with a morning delivery and an
  // afternoon collection at the same address is legitimate and common, and
  // buying that address twice is the sort of waste nobody ever notices.
  const wanted = [...new Set(request.placeIds)];

  const cached = await readFreshPlaces(deps.database, wanted, now);
  const missing = wanted.filter((placeId) => !cached.has(placeId));

  if (missing.length === 0) {
    return {
      result: { resolved: [...cached.values()], unresolved: [] },
      tier: null,
      // Nothing was bought, and it still costs one unit of allowance. That rule
      // is docs/13_BACKEND.md §4 and it is not an oversight: a cache hit is free
      // upstream but not free to serve, and unlimited free hits would let a user
      // with a recurring route consume unbounded value while the quota reports
      // them idle. Recurring routes are precisely what this segment has.
      units: 1,
    };
  }

  const outcome = await deps.places.detailsFor(missing);
  if (outcome.outage !== null) {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service', {
      degradationHint: 'RETRY_LATER',
    });
  }

  // Written before the response is built, so the next caller — this user
  // tomorrow, or a different user on the same street — does not buy it again.
  await writePlaces(deps.database, outcome.resolved);

  return {
    result: {
      // Cache first, then what was just fetched. Order is not significant to the
      // client, which reads by `place_id`.
      resolved: [...cached.values(), ...outcome.resolved],
      unresolved: outcome.unresolved.map((placeId) => ({ placeId })),
    },
    tier: null,
    // Only what reached Google. This is the number the cost model is written
    // against (docs/31_COST_MODEL.md).
    units: missing.length,
  };
}
