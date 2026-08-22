import {
  hereGeocodeUpstream,
  hereRefreshUpstream,
  hereSuggestionsUpstream,
} from '../functions/_shared/endpoints/here-search';
import { ApiError } from '../functions/_shared/errors';
import { createHereSearchAdapter } from '../functions/_shared/upstream/here-search';

import type { DatabaseClient } from '../functions/_shared/dependencies';
import type { HerePlace, HereSearchPort } from '../functions/_shared/upstream/here-search';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const USER = '00000000-0000-4000-8000-000000000001';
const SAVED = '00000000-0000-4000-8000-000000000002';

const PLACE: HerePlace = {
  providerPlaceId: 'here:place:private-provider-id',
  formattedAddress: 'Via Roma 1, Bergamo',
  latitude: 45.7,
  longitude: 9.7,
};

function fakeDatabase(rows: readonly Record<string, unknown>[] = []) {
  const reads: { sql: string; params: readonly unknown[] }[] = [];
  const writes: { sql: string; params: readonly unknown[] }[] = [];
  const database: DatabaseClient = {
    queryOne: async <T>(sql: string, params: readonly unknown[]): Promise<T | null> => {
      reads.push({ sql, params });
      return sql.includes('returning id') ? ({ id: SAVED } as T) : null;
    },
    queryMany: async <T>(sql: string, params: readonly unknown[]): Promise<readonly T[]> => {
      reads.push({ sql, params });
      return rows as unknown as readonly T[];
    },
    execute: async (sql: string, params: readonly unknown[]) => {
      writes.push({ sql, params });
    },
  };
  return { database, reads, writes };
}

function fakePlaces(result: HerePlace | null = PLACE) {
  const requested: string[] = [];
  const places: HereSearchPort = {
    suggest: async () => (result === null ? [] : [result]),
    geocode: async (address) => {
      requested.push(address);
      return result;
    },
  };
  return { places, requested };
}

describe('HERE server-side search adapter', () => {
  it('requests autosuggest privately and keeps provider identifiers out of suggestions', async () => {
    const calls: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      calls.push(new URL(String(input)));
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              id: PLACE.providerPlaceId,
              address: { label: PLACE.formattedAddress },
              position: { lat: PLACE.latitude, lng: PLACE.longitude },
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const places = createHereSearchAdapter({ apiKey: 'server-only-key', fetchImpl });
    const result = await hereSuggestionsUpstream({ input: 'Via Roma' }, places);

    expect(calls[0]?.hostname).toBe('autosuggest.search.hereapi.com');
    expect(calls[0]?.searchParams.get('in')).toBe('countryCode:ITA');
    expect(calls[0]?.searchParams.get('apiKey')).toBe('server-only-key');
    expect(result.result.suggestions).toEqual([
      { address: PLACE.formattedAddress, latitude: 45.7, longitude: 9.7 },
    ]);
    expect(JSON.stringify(result)).not.toContain('server-only-key');
    expect(JSON.stringify(result)).not.toContain(PLACE.providerPlaceId);
  });

  it('maps upstream failures to a sanitized retryable error', async () => {
    const places = createHereSearchAdapter({
      apiKey: 'server-only-key',
      fetchImpl: (async () => ({ ok: false, status: 401 }) as Response) as typeof fetch,
    });

    await expect(places.geocode('Via Roma')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      details: { providerStatus: 401 },
    });
  });

  it('rejects malformed provider payloads', async () => {
    const places = createHereSearchAdapter({
      apiKey: 'server-only-key',
      fetchImpl: (async () => ({ ok: true, json: async () => ({}) }) as Response) as typeof fetch,
    });

    await expect(places.geocode('Via Roma')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('private provider-neutral saved places', () => {
  it('saves user-authored text and limits HERE coordinate retention to thirty days', async () => {
    const { database, reads, writes } = fakeDatabase();
    const { places } = fakePlaces();

    const outcome = await hereGeocodeUpstream(
      { addresses: ['Via Roma 1'] },
      { database, places, userId: USER, now: NOW },
    );

    expect(reads.find((read) => read.sql.includes('insert into saved_places'))?.params).toEqual([
      USER,
      'Via Roma 1',
    ]);
    expect(writes[0]?.sql).toContain('saved_place_coordinates');
    expect(writes[0]?.params[0]).toBe(SAVED);
    expect(writes[0]?.params[1]).toBe(PLACE.providerPlaceId);
    expect(writes[0]?.params[5]).toBe('2026-08-21T12:00:00.000Z');
    expect(writes[0]?.params[6]).toBe('2026-09-20T12:00:00.000Z');
    expect(outcome.result.resolved[0]?.addressText).toBe('Via Roma 1');
    expect(outcome.result.resolved[0]?.savedPlaceId).toBe(SAVED);
    expect(JSON.stringify(outcome.result)).not.toContain(PLACE.providerPlaceId);
  });

  it('deduplicates equivalent address lookups while preserving every input row', async () => {
    const { database } = fakeDatabase();
    const { places, requested } = fakePlaces();

    const outcome = await hereGeocodeUpstream(
      { addresses: ['Via Roma 1', 'via roma 1'] },
      { database, places, userId: USER, now: NOW },
    );

    expect(requested).toEqual(['Via Roma 1']);
    expect(outcome.result.resolved.map((place) => place.index)).toEqual([0, 1]);
    expect(outcome.units).toBe(1);
  });

  it('reports an unresolvable address without discarding the submitted row', async () => {
    const { database } = fakeDatabase();
    const { places } = fakePlaces(null);

    const outcome = await hereGeocodeUpstream(
      { addresses: ['unknown'] },
      { database, places, userId: USER, now: NOW },
    );

    expect(outcome.result.unresolved).toEqual([{ index: 0, input: 'unknown' }]);
  });

  it('reuses private fresh coordinates without calling HERE', async () => {
    const { database, reads } = fakeDatabase([
      {
        id: SAVED,
        address_text: 'Via Roma 1',
        lat: PLACE.latitude,
        lng: PLACE.longitude,
        provider_formatted_address: PLACE.formattedAddress,
        provider_fetched_at: '2026-08-20T12:00:00.000Z',
        provider_expires_at: '2026-09-19T12:00:00.000Z',
      },
    ]);
    const { places, requested } = fakePlaces();

    const outcome = await hereRefreshUpstream(
      { savedPlaceIds: [SAVED] },
      { database, places, userId: USER, now: NOW },
    );

    expect(requested).toEqual([]);
    expect(reads[0]?.params[0]).toBe(USER);
    expect(reads[0]?.sql).toContain('place.user_id = $1');
    expect(outcome.result.resolved[0]?.savedPlaceId).toBe(SAVED);
  });

  it('refreshes expired coordinates from durable user-authored text', async () => {
    const { database, writes } = fakeDatabase([
      {
        id: SAVED,
        address_text: 'Via Roma 1',
        lat: null,
        lng: null,
        provider_formatted_address: null,
        provider_fetched_at: null,
        provider_expires_at: null,
      },
    ]);
    const { places, requested } = fakePlaces();

    const outcome = await hereRefreshUpstream(
      { savedPlaceIds: [SAVED] },
      { database, places, userId: USER, now: NOW },
    );

    expect(requested).toEqual(['Via Roma 1']);
    expect(writes).toHaveLength(1);
    expect(outcome.result.resolved[0]?.expiresAt).toBe('2026-09-20T12:00:00.000Z');
  });

  it('does not query HERE for a saved place the authenticated user does not own', async () => {
    const { database } = fakeDatabase();
    const { places, requested } = fakePlaces();

    const outcome = await hereRefreshUpstream(
      { savedPlaceIds: [SAVED] },
      { database, places, userId: USER, now: NOW },
    );

    expect(requested).toEqual([]);
    expect(outcome.result.unresolved).toEqual([{ savedPlaceId: SAVED }]);
  });
});
