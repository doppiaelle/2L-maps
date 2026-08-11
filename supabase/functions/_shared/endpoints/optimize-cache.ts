import { canonicalCacheInput, hashCacheKey } from '../cache-key.ts';

import type { DatabaseClient } from '../dependencies.ts';
import type { OptimizeResult } from './optimize.ts';
import type { OptimizeRequest } from '../schemas.ts';

/**
 * `/optimize`'s cache — the one endpoint that had none.
 *
 * **Pressing Optimize twice on an unchanged route bought the whole thing
 * twice.** Every other metered endpoint defines `readCache`/`writeCache`;
 * `/optimize` never did, so the most expensive call in the product — two Routes
 * API requests, one of them at `TRAFFIC_AWARE_OPTIMAL` — ran again for an answer
 * we already held. A driver who reorders a stop, changes their mind, and puts it
 * back paid three times for one route.
 *
 * **The key is content, not identity.** `canonicalCacheInput` sorts the stop set,
 * so the same stops in any input order hash the same; it carries the origin, the
 * round-trip flag and a departure *bucket* rather than an exact time, so two
 * requests a minute apart share an entry. That is also what makes the table
 * shared across users safe: the key hashes public place identifiers and carries
 * no personal data ([`docs/12_DATABASE.md`](../../../../docs/12_DATABASE.md)),
 * and a current-location origin is rounded to about 110 m before it goes in.
 *
 * **Editing the route changes the key by construction.** Adding, removing or
 * substituting a stop changes the sorted set; flipping round-trip changes the
 * shape token. So "re-run it because I changed something" and "give me back what
 * I just computed" need no flag from the client and cannot be got wrong by one —
 * the client is not trusted for this any more than for quota
 * (`CLAUDE.md` §0 rule 4).
 *
 * **Reordering alone is deliberately a hit.** The optimizer's answer to a set of
 * stops does not depend on the order they were typed in — that is the entire
 * point of it — so a drag-and-drop that changes nothing else gets the same
 * ordering back, free and instantly.
 *
 * **A hit still costs the user a unit.** The cache lookup sits after the quota
 * check in the pipeline, and that ordering is load-bearing: free hits would let
 * a driver with a recurring route consume unbounded value while the quota
 * reported them idle, and recurring routes are exactly what this segment has
 * ([`docs/13_BACKEND.md`](../../../../docs/13_BACKEND.md) §5).
 */

/**
 * How long an optimization stays usable.
 *
 * **Traffic staleness binds long before the terms do.** The result carries
 * Google-derived geometry, so the thirty-day coordinate rule is the outer
 * ceiling ([ADR-0007](../../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)) —
 * but a duration computed under this morning's traffic is worthless by the
 * afternoon, and handing a driver a stale ETA is worse than making them wait
 * three seconds. Six hours keeps the same working day cheap and lets tomorrow
 * re-price itself.
 */
export const OPTIMIZE_CACHE_TTL_SECONDS = 6 * 60 * 60;

interface CacheRow {
  readonly result: unknown;
}

/** The key for a request, as both halves of the pipeline must compute it. */
export function optimizeCacheKey(request: OptimizeRequest): string {
  return hashCacheKey(
    canonicalCacheInput({
      stopPlaceIds: request.stops.map((stop) => stop.placeId),
      originPlaceId: request.origin.placeId ?? null,
      originCoordinate:
        request.origin.latitude === null ||
        request.origin.latitude === undefined ||
        request.origin.longitude === null ||
        request.origin.longitude === undefined
          ? null
          : { latitude: request.origin.latitude, longitude: request.origin.longitude },
      isRoundTrip: request.isRoundTrip ?? false,
      departureTime:
        request.departureTime === null || request.departureTime === undefined
          ? null
          : new Date(request.departureTime),
    }),
  );
}

export async function readOptimizeCache(
  database: DatabaseClient,
  request: OptimizeRequest,
  now: Date,
): Promise<OptimizeResult | null> {
  const rows = await database.queryMany<CacheRow>(
    // Expiry is filtered in the query rather than afterwards: a row read and
    // then discarded is a stale result briefly in memory, and the same mistake
    // on `places_cache` would be a terms breach rather than a slow ETA.
    `select result from optimization_cache
      where cache_key = $1 and expires_at > $2::timestamptz
      limit 1`,
    [optimizeCacheKey(request), now.toISOString()],
  );

  const row = rows[0];
  if (row === undefined) return null;

  return readResult(row.result, request);
}

/**
 * What is actually stored, which is deliberately not the response.
 *
 * The response names stops by the **caller's** ids. Two drivers with the same
 * three addresses hash to the same key and hold entirely different ids for them,
 * so storing the response verbatim would hand one driver the other's
 * identifiers — a route referring to stops that do not exist on their device.
 *
 * The envelope stores the order as **place ids**, which are public, shared, and
 * exactly what the key already hashes. Reading it back re-attributes the order
 * to the reader's own stops.
 */
interface CacheEnvelope {
  readonly orderedPlaceIds: readonly string[];
  /** Geometry only. The ids a leg carries name the *writer's* stops, so they are
   *  stripped here rather than nulled on the way out — an envelope that holds a
   *  foreign identifier at all is one refactor away from leaking it. */
  readonly legs: readonly {
    readonly distanceMeters: number;
    readonly durationSeconds: number;
    readonly polyline: string;
  }[];
  readonly totalDistanceMeters: number;
  readonly totalDurationSeconds: number;
}

export async function writeOptimizeCache(
  database: DatabaseClient,
  request: OptimizeRequest,
  result: OptimizeResult,
  now: Date,
): Promise<void> {
  const placeIdByStopId = new Map(request.stops.map((stop) => [stop.stopId, stop.placeId]));
  const orderedPlaceIds = result.orderedStopIds.map((stopId) => placeIdByStopId.get(stopId));

  // A result naming a stop this request never sent is our own defect, not a
  // cache concern — store nothing rather than an entry that cannot be read back.
  if (orderedPlaceIds.some((placeId) => placeId === undefined)) return;

  const envelope: CacheEnvelope = {
    orderedPlaceIds: orderedPlaceIds as readonly string[],
    legs: result.legs.map((leg) => ({
      distanceMeters: leg.distanceMeters,
      durationSeconds: leg.durationSeconds,
      polyline: leg.polyline,
    })),
    totalDistanceMeters: result.totalDistanceMeters,
    totalDurationSeconds: result.totalDurationSeconds,
  };

  const expiresAt = new Date(now.getTime() + OPTIMIZE_CACHE_TTL_SECONDS * 1_000);

  await database.execute(
    // `do update` rather than `do nothing`: an entry re-computed after expiry
    // should replace the old one, and two requests racing on the same key
    // should leave the fresher answer rather than whichever arrived first.
    `insert into optimization_cache (cache_key, result, tier, expires_at)
     values ($1, $2::jsonb, $3, $4::timestamptz)
     on conflict (cache_key) do update
        set result = excluded.result,
            tier = excluded.tier,
            created_at = now(),
            expires_at = excluded.expires_at`,
    [optimizeCacheKey(request), JSON.stringify(envelope), result.tier, expiresAt.toISOString()],
  );
}

/**
 * Read an envelope back into this caller's own terms.
 *
 * The stored order is place ids; this request's stops are ids paired with place
 * ids. An envelope that cannot be mapped onto them — a different stop count, a
 * place id this caller did not send — is treated as a **miss** rather than
 * trusted. A wrong route that looks complete is the failure mode this product
 * cannot have (`CLAUDE.md` §0 rule 5), and a cache is exactly where one would
 * come from.
 */
function readResult(stored: unknown, request: OptimizeRequest): OptimizeResult | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const value = stored as Record<string, unknown>;

  const storedPlaceIds = value['orderedPlaceIds'];
  const legs = value['legs'];
  if (!Array.isArray(storedPlaceIds) || !Array.isArray(legs)) return null;
  if (typeof value['totalDistanceMeters'] !== 'number') return null;
  if (typeof value['totalDurationSeconds'] !== 'number') return null;
  if (storedPlaceIds.length !== request.stops.length) return null;

  // The stored order is a permutation of place ids; this request's stops are
  // ids paired with place ids. Rebuild the order in this caller's own terms.
  const byPlaceId = new Map<string, string[]>();
  for (const stop of request.stops) {
    const existing = byPlaceId.get(stop.placeId);
    if (existing === undefined) byPlaceId.set(stop.placeId, [stop.stopId]);
    else existing.push(stop.stopId);
  }

  const reordered: string[] = [];
  for (const placeId of storedPlaceIds) {
    if (typeof placeId !== 'string') return null;
    const candidates = byPlaceId.get(placeId);
    // Two deliveries in the same building is an ordinary Tuesday, so a place id
    // can appear twice; each occurrence consumes one of this request's ids.
    const stopId = candidates?.shift();
    if (stopId === undefined) return null;
    reordered.push(stopId);
  }

  return {
    status: 'complete',
    tier: 'T1',
    isDegraded: false,
    orderedStopIds: reordered,
    // Dropped rather than re-attributed. A leg names the stops it runs between,
    // and those names came from a different caller; nothing in the product reads
    // them ([ADR-0024](../../../../docs/adr/0024-deploy-the-functions-with-the-app.md)),
    // and a leg confidently naming the wrong pair is not recoverable.
    legs: legs.map((leg) => readLeg(leg)).filter(isPresent),
    totalDistanceMeters: value['totalDistanceMeters'],
    totalDurationSeconds: value['totalDurationSeconds'],
    unreachableStopIds: [],
  };
}

function readLeg(value: unknown): OptimizeResult['legs'][number] | null {
  if (typeof value !== 'object' || value === null) return null;
  const leg = value as Record<string, unknown>;

  if (typeof leg['distanceMeters'] !== 'number') return null;
  if (typeof leg['durationSeconds'] !== 'number') return null;
  if (typeof leg['polyline'] !== 'string') return null;

  return {
    fromStopId: null,
    toStopId: null,
    distanceMeters: leg['distanceMeters'],
    durationSeconds: leg['durationSeconds'],
    polyline: leg['polyline'],
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
