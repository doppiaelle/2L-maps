import { COORDINATE_MAX_AGE_DAYS } from '../../../types/constants';

import type { DatabaseClient } from './dependencies';

/**
 * `places_cache` — the durability boundary, and the product's largest cost lever.
 *
 * The table has existed since the first migration and nothing wrote to it, which
 * made two separate things quietly untrue.
 *
 * **The cost model.** Address entry is 78% of per-user COGS
 * ([`docs/31_COST_MODEL.md`](../../../docs/31_COST_MODEL.md) §8), and the reason
 * this table is shared across users with no ownership column is that one user's
 * lookup is meant to pay for everybody's
 * ([`docs/12_DATABASE.md`](../../../docs/12_DATABASE.md)). An empty cache means
 * every route open re-buys every coordinate.
 *
 * **The foreign keys.** `stops.place_id` and `favourites.place_id` both reference
 * this table, and the client — which is what inserts them
 * ([`docs/33_API_CONTRACTS.md`](../../../docs/33_API_CONTRACTS.md) §7) — cannot
 * write here: the RLS policy grants `select` to `authenticated` and nothing else,
 * on purpose, so nobody can poison a shared cache with coordinates of their
 * choosing. So until the server writes a row, saving a route is a foreign-key
 * violation rather than a save.
 *
 * **A cache read is not a free pass on the thirty-day rule.** `readFresh` filters
 * on `coords_refreshed_at` in the query rather than reading everything and
 * discarding stale rows afterwards, because the row is *also* the thing the purge
 * job nulls ([ADR-0007](../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)):
 * a purged row still exists, still satisfies the foreign key, and has no
 * coordinates. That is the normal post-purge state, not an error.
 */

/** A place as it is cached: the durable key and the perishable half together. */
export interface CachedPlace {
  readonly placeId: string;
  readonly formattedAddress: string;
  readonly lat: number;
  readonly lng: number;
}

interface CacheRow {
  readonly place_id: string;
  readonly formatted_address: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/**
 * Cached places whose coordinates are still inside the window.
 *
 * Returned as a map because the caller's next question is always "do I have this
 * one?" — a list would make every caller build the same map.
 */
export async function readFreshPlaces(
  database: DatabaseClient,
  placeIds: readonly string[],
  now: Date = new Date(),
): Promise<ReadonlyMap<string, CachedPlace>> {
  const found = new Map<string, CachedPlace>();
  if (placeIds.length === 0) return found;

  const cutoff = new Date(now.getTime() - COORDINATE_MAX_AGE_DAYS * 86_400_000).toISOString();

  const rows = await database.queryMany<CacheRow>(
    `select place_id, formatted_address, lat, lng
       from places_cache
      where place_id = any($1::text[])
        and coords_refreshed_at is not null
        and coords_refreshed_at > $2::timestamptz
        and lat is not null
        and lng is not null`,
    [[...placeIds], cutoff],
  );

  for (const row of rows) {
    // Belt and braces against a row that satisfied the predicate with a null
    // address: the columns are nulled together by the purge, but a partial write
    // would otherwise put `null` where a driver expects a street.
    if (row.formatted_address === null || row.lat === null || row.lng === null) continue;
    found.set(row.place_id, {
      placeId: row.place_id,
      formattedAddress: row.formatted_address,
      lat: row.lat,
      lng: row.lng,
    });
  }

  return found;
}

/**
 * Write through, after an upstream fetch.
 *
 * `coords_refreshed_at` is set to now because that is exactly what just happened:
 * these coordinates came from Google in this request. Writing it at any other
 * moment — on a cache *read*, say — would extend the thirty-day window without a
 * refresh, which is the one way this table can turn into a terms breach.
 */
export async function writePlaces(
  database: DatabaseClient,
  places: readonly CachedPlace[],
): Promise<void> {
  if (places.length === 0) return;

  // One statement with four arrays rather than one statement per place: a
  // twenty-five stop import is one round trip, and the upsert is atomic against
  // another user resolving the same address at the same moment.
  await database.execute(
    `insert into places_cache (place_id, formatted_address, lat, lng, coords_refreshed_at)
     select place_id, formatted_address, lat, lng, now()
       from unnest($1::text[], $2::text[], $3::double precision[], $4::double precision[])
            as t(place_id, formatted_address, lat, lng)
     on conflict (place_id) do update
        set formatted_address   = excluded.formatted_address,
            lat                 = excluded.lat,
            lng                 = excluded.lng,
            coords_refreshed_at = excluded.coords_refreshed_at`,
    [
      places.map((place) => place.placeId),
      places.map((place) => place.formattedAddress),
      places.map((place) => place.lat),
      places.map((place) => place.lng),
    ],
  );
}

/**
 * Record a `place_id` we have no coordinates for.
 *
 * The row is what the foreign key needs; the coordinates are what the user
 * needs, and the two are separable by design. A stop added from an autocomplete
 * suggestion has an id and nothing else until Plan resolves it, and without this
 * the save would fail on a route the user can see perfectly well on screen.
 */
export async function ensurePlaceIds(
  database: DatabaseClient,
  placeIds: readonly string[],
): Promise<void> {
  if (placeIds.length === 0) return;

  // `do nothing` rather than `do update`: an existing row may hold fresh
  // coordinates, and this call knows nothing that would improve it.
  await database.execute(
    `insert into places_cache (place_id)
     select place_id from unnest($1::text[]) as t(place_id)
     on conflict (place_id) do nothing`,
    [[...placeIds]],
  );
}
