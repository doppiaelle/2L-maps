import type { DatabaseClient } from '../dependencies.ts';
import type { UpstreamOutcome } from '../pipeline.ts';
import type { HerePlace, HereSearchPort } from '../upstream/here-search.ts';

const MAX_COORDINATE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface AddressSuggestion {
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface ResolvedSavedPlace {
  readonly savedPlaceId: string;
  readonly addressText: string;
  readonly formattedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly fetchedAt: string;
  readonly expiresAt: string;
  readonly index: number;
}

interface SavedPlaceRow {
  readonly id: string;
  readonly address_text: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly provider_formatted_address: string | null;
  readonly provider_fetched_at: string | Date | null;
  readonly provider_expires_at: string | Date | null;
}

interface HerePlaceDependencies {
  readonly database: DatabaseClient;
  readonly places: HereSearchPort;
  readonly userId: string;
  readonly now?: Date;
}

export async function hereSuggestionsUpstream(
  request: {
    readonly input: string;
    readonly locale?: string | null;
    readonly bias?: { readonly lat: number; readonly lng: number } | null;
    readonly limit?: number;
  },
  places: HereSearchPort,
): Promise<UpstreamOutcome<{ readonly suggestions: readonly AddressSuggestion[] }>> {
  const found = await places.suggest(request.input, {
    ...(request.locale === undefined ? {} : { locale: request.locale }),
    ...(request.bias === undefined ? {} : { bias: request.bias }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });

  return {
    result: {
      suggestions: found.map((place) => ({
        address: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    },
    tier: 'here-search',
    units: 1,
  };
}

export async function hereGeocodeUpstream(
  request: { readonly addresses: readonly string[]; readonly region?: string },
  deps: HerePlaceDependencies,
): Promise<
  UpstreamOutcome<{
    readonly resolved: readonly ResolvedSavedPlace[];
    readonly unresolved: readonly { readonly index: number; readonly input: string }[];
  }>
> {
  const now = deps.now ?? new Date();
  const found = new Map<string, HerePlace | null>();
  const resolved: ResolvedSavedPlace[] = [];
  const unresolved: { readonly index: number; readonly input: string }[] = [];

  for (const [index, submitted] of request.addresses.entries()) {
    const input = submitted.trim();
    const lookupKey = input.toLocaleLowerCase();
    if (!found.has(lookupKey)) {
      found.set(lookupKey, await deps.places.geocode(input, request.region ?? 'IT'));
    }

    const place = found.get(lookupKey);
    if (place == null) {
      unresolved.push({ index, input: submitted });
      continue;
    }

    const savedPlaceId = await findOrCreateSavedPlace(deps.database, deps.userId, input);
    await writeCoordinates(deps.database, savedPlaceId, place, now);
    resolved.push(toResult(savedPlaceId, input, place, now, index));
  }

  return {
    result: { resolved, unresolved },
    tier: 'here-geocode',
    units: Math.max(1, found.size),
  };
}

export async function hereRefreshUpstream(
  request: { readonly savedPlaceIds: readonly string[] },
  deps: HerePlaceDependencies,
): Promise<
  UpstreamOutcome<{
    readonly resolved: readonly ResolvedSavedPlace[];
    readonly unresolved: readonly { readonly savedPlaceId: string }[];
  }>
> {
  const now = deps.now ?? new Date();
  const wanted = [...new Set(request.savedPlaceIds)];
  const rows = await deps.database.queryMany<SavedPlaceRow>(
    `select place.id, place.address_text, coordinates.lat, coordinates.lng,
            coordinates.provider_formatted_address,
            coordinates.provider_fetched_at, coordinates.provider_expires_at
       from saved_places as place
       left join saved_place_coordinates as coordinates
         on coordinates.saved_place_id = place.id
      where place.user_id = $1
        and place.id = any($2::uuid[])`,
    [deps.userId, wanted],
  );

  const byId = new Map(rows.map((row) => [row.id, row]));
  const resolved: ResolvedSavedPlace[] = [];
  const unresolved: { readonly savedPlaceId: string }[] = [];
  let lookups = 0;

  for (const [index, savedPlaceId] of wanted.entries()) {
    const row = byId.get(savedPlaceId);
    if (row === undefined) {
      unresolved.push({ savedPlaceId });
      continue;
    }

    if (hasFreshCoordinates(row, now)) {
      resolved.push({
        savedPlaceId: row.id,
        addressText: row.address_text,
        formattedAddress: row.provider_formatted_address ?? row.address_text,
        latitude: row.lat,
        longitude: row.lng,
        fetchedAt: toIso(row.provider_fetched_at),
        expiresAt: toIso(row.provider_expires_at),
        index,
      });
      continue;
    }

    lookups += 1;
    const place = await deps.places.geocode(row.address_text, 'IT');
    if (place === null) {
      unresolved.push({ savedPlaceId });
      continue;
    }

    await writeCoordinates(deps.database, row.id, place, now);
    resolved.push(toResult(row.id, row.address_text, place, now, index));
  }

  return {
    result: { resolved, unresolved },
    tier: 'here-place-details',
    units: Math.max(1, lookups),
  };
}

async function findOrCreateSavedPlace(
  database: DatabaseClient,
  userId: string,
  address: string,
): Promise<string> {
  const current = await database.queryOne<{ readonly id: string }>(
    `select id from saved_places
      where user_id = $1 and lower(btrim(address_text)) = lower(btrim($2))
      order by created_at desc limit 1`,
    [userId, address],
  );
  if (current !== null) return current.id;

  const created = await database.queryOne<{ readonly id: string }>(
    'insert into saved_places (user_id, address_text) values ($1, $2) returning id',
    [userId, address],
  );
  if (created === null) throw new Error('Saved place insert returned no identifier');
  return created.id;
}

async function writeCoordinates(
  database: DatabaseClient,
  savedPlaceId: string,
  place: HerePlace,
  now: Date,
): Promise<void> {
  const fetchedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + MAX_COORDINATE_AGE_MS).toISOString();

  await database.execute(
    `insert into saved_place_coordinates (
       saved_place_id, provider, provider_place_id, provider_formatted_address,
       provider_raw_payload, lat, lng, provider_fetched_at, provider_expires_at
     ) values ($1, 'here', $2, $3, null, $4, $5, $6::timestamptz, $7::timestamptz)
     on conflict (saved_place_id) do update set
       provider = excluded.provider,
       provider_place_id = excluded.provider_place_id,
       provider_formatted_address = excluded.provider_formatted_address,
       provider_raw_payload = null,
       lat = excluded.lat,
       lng = excluded.lng,
       provider_fetched_at = excluded.provider_fetched_at,
       provider_expires_at = excluded.provider_expires_at`,
    [
      savedPlaceId,
      place.providerPlaceId,
      place.formattedAddress,
      place.latitude,
      place.longitude,
      fetchedAt,
      expiresAt,
    ],
  );
}

function toResult(
  savedPlaceId: string,
  addressText: string,
  place: HerePlace,
  now: Date,
  index: number,
): ResolvedSavedPlace {
  return {
    savedPlaceId,
    addressText,
    formattedAddress: place.formattedAddress,
    latitude: place.latitude,
    longitude: place.longitude,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MAX_COORDINATE_AGE_MS).toISOString(),
    index,
  };
}

function hasFreshCoordinates(
  row: SavedPlaceRow,
  now: Date,
): row is SavedPlaceRow & {
  readonly lat: number;
  readonly lng: number;
  readonly provider_fetched_at: string | Date;
  readonly provider_expires_at: string | Date;
} {
  if (
    row.lat === null ||
    row.lng === null ||
    row.provider_fetched_at === null ||
    row.provider_expires_at === null
  ) {
    return false;
  }

  const fetchedAt = new Date(row.provider_fetched_at).getTime();
  const expiresAt = new Date(row.provider_expires_at).getTime();
  return (
    Number.isFinite(fetchedAt) &&
    Number.isFinite(expiresAt) &&
    fetchedAt <= now.getTime() &&
    expiresAt > now.getTime() &&
    expiresAt - fetchedAt <= MAX_COORDINATE_AGE_MS
  );
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}
