import {
  optimizeCacheKey,
  OPTIMIZE_CACHE_TTL_SECONDS,
  readOptimizeCache,
  writeOptimizeCache,
} from '../functions/_shared/endpoints/optimize-cache';

import type { DatabaseClient } from '../functions/_shared/dependencies';
import type { OptimizeResult } from '../functions/_shared/endpoints/optimize';
import type { OptimizeRequest } from '../functions/_shared/schemas';

/**
 * The cache `/optimize` never had.
 *
 * Every other metered endpoint defines `readCache`/`writeCache`. This one did
 * not, so pressing Optimize twice on an unchanged route ran the most expensive
 * call in the product twice — two Routes API requests, one of them at
 * `TRAFFIC_AWARE_OPTIMAL`. A driver who reorders a stop, changes their mind and
 * puts it back paid three times for one route.
 *
 * The tests split in two. **Which requests share a key** is the cost question,
 * and it is answered by content rather than by anything the client asserts. **What
 * comes back out** is the correctness question, and it is where a cache would do
 * real damage if it were sloppy: the stored order belongs to whoever computed
 * it, and handing one driver another's stop ids would produce a route referring
 * to stops that do not exist on their device.
 */

const NOW = new Date('2026-08-11T09:00:00.000Z');

const request = (overrides: Partial<OptimizeRequest> = {}): OptimizeRequest =>
  ({
    routeId: '2b6e1d84-7c9a-4c1e-9f0a-1d2c3b4a5e6f',
    origin: { placeId: 'ChIJorigin', isCurrentLocation: false },
    stops: [
      { stopId: 's1', placeId: 'ChIJa' },
      { stopId: 's2', placeId: 'ChIJb' },
      { stopId: 's3', placeId: 'ChIJc' },
    ],
    isRoundTrip: false,
    departureTime: null,
    ...overrides,
  }) as OptimizeRequest;

const result = (orderedStopIds: readonly string[]): OptimizeResult => ({
  status: 'complete',
  tier: 'T1',
  isDegraded: false,
  orderedStopIds,
  legs: [
    {
      fromStopId: 's1',
      toStopId: 's2',
      distanceMeters: 1200,
      durationSeconds: 300,
      polyline: 'ab',
    },
    {
      fromStopId: 's2',
      toStopId: 's3',
      distanceMeters: 2400,
      durationSeconds: 600,
      polyline: 'cd',
    },
  ],
  totalDistanceMeters: 3600,
  totalDurationSeconds: 900,
  unreachableStopIds: [],
});

interface Recorded {
  readonly sql: string;
  readonly params: readonly unknown[];
}

const fakeDatabase = (rows: readonly Record<string, unknown>[] = []) => {
  const reads: Recorded[] = [];
  const writes: Recorded[] = [];
  const database: DatabaseClient = {
    queryOne: async () => null,
    queryMany: async <T>(sql: string, params: readonly unknown[]): Promise<readonly T[]> => {
      reads.push({ sql, params });
      return rows as unknown as readonly T[];
    },
    execute: async (sql: string, params: readonly unknown[]) => {
      writes.push({ sql, params });
    },
  };
  return { database, reads, writes };
};

describe('which requests share an entry', () => {
  it('gives the same key to the same stops in a different order', () => {
    // The optimizer's answer does not depend on the order the stops were typed
    // in — that is the entire point of it. A drag-and-drop that changes nothing
    // else must not re-buy the route.
    const a = optimizeCacheKey(request());
    const b = optimizeCacheKey(
      request({
        stops: [
          { stopId: 's3', placeId: 'ChIJc' },
          { stopId: 's1', placeId: 'ChIJa' },
          { stopId: 's2', placeId: 'ChIJb' },
        ],
      }),
    );

    expect(b).toBe(a);
  });

  it('gives the same key whatever the caller calls its stops', () => {
    // Two drivers with the same three addresses share the work. The key hashes
    // public place ids and nothing else about them (docs/12_DATABASE.md).
    const a = optimizeCacheKey(request());
    const b = optimizeCacheKey(
      request({
        routeId: '11111111-2222-3333-4444-555555555555',
        stops: [
          { stopId: 'x', placeId: 'ChIJa' },
          { stopId: 'y', placeId: 'ChIJb' },
          { stopId: 'z', placeId: 'ChIJc' },
        ],
      }),
    );

    expect(b).toBe(a);
  });

  it('changes the key when a stop is added', () => {
    // Editing the route re-runs it, with no flag from the client and no way for
    // one to get it wrong (`CLAUDE.md` §0 rule 4).
    const a = optimizeCacheKey(request());
    const b = optimizeCacheKey(
      request({
        stops: [...request().stops, { stopId: 's4', placeId: 'ChIJd' }],
      }),
    );

    expect(b).not.toBe(a);
  });

  it('changes the key when a stop is removed', () => {
    const a = optimizeCacheKey(request());
    const b = optimizeCacheKey(request({ stops: request().stops.slice(0, 2) }));
    expect(b).not.toBe(a);
  });

  it('changes the key when the route becomes a round trip', () => {
    expect(optimizeCacheKey(request({ isRoundTrip: true }))).not.toBe(
      optimizeCacheKey(request({ isRoundTrip: false })),
    );
  });

  it('changes the key when the origin changes', () => {
    expect(
      optimizeCacheKey(
        request({ origin: { placeId: 'ChIJelsewhere', isCurrentLocation: false } } as never),
      ),
    ).not.toBe(optimizeCacheKey(request()));
  });
});

describe('writing an entry', () => {
  it('stores the order as place ids, never as the caller’s stop ids', async () => {
    // The damage a sloppy cache would do: two drivers hash to the same key and
    // hold entirely different ids for the same addresses. Replaying stop ids
    // would give one driver a route naming stops that do not exist for them.
    const { database, writes } = fakeDatabase();
    await writeOptimizeCache(database, request(), result(['s2', 's1', 's3']), NOW);

    const payload = JSON.parse(String(writes[0]?.params[1])) as Record<string, unknown>;
    expect(payload['orderedPlaceIds']).toEqual(['ChIJb', 'ChIJa', 'ChIJc']);
    expect(JSON.stringify(payload)).not.toContain('"s1"');
  });

  it('expires well inside the thirty-day rule, and inside the traffic day', async () => {
    // Traffic staleness binds long before the terms do: a duration computed
    // this morning is worthless by the afternoon.
    const { database, writes } = fakeDatabase();
    await writeOptimizeCache(database, request(), result(['s1', 's2', 's3']), NOW);

    const expiresAt = Date.parse(String(writes[0]?.params[3]));
    expect(expiresAt - NOW.getTime()).toBe(OPTIMIZE_CACHE_TTL_SECONDS * 1_000);
    expect(OPTIMIZE_CACHE_TTL_SECONDS).toBeLessThan(24 * 60 * 60);
  });

  it('replaces an expired entry rather than leaving the stale one', async () => {
    const { database, writes } = fakeDatabase();
    await writeOptimizeCache(database, request(), result(['s1', 's2', 's3']), NOW);
    expect(writes[0]?.sql).toContain('do update');
  });

  it('stores nothing when the result names a stop the request never sent', async () => {
    // That is our own defect, and an entry that cannot be read back is worse
    // than no entry.
    const { database, writes } = fakeDatabase();
    await writeOptimizeCache(database, request(), result(['s1', 'ghost', 's3']), NOW);
    expect(writes).toHaveLength(0);
  });
});

describe('reading an entry back', () => {
  const envelope = (orderedPlaceIds: readonly string[]) => ({
    result: {
      orderedPlaceIds,
      legs: [{ distanceMeters: 1200, durationSeconds: 300, polyline: 'ab' }],
      totalDistanceMeters: 3600,
      totalDurationSeconds: 900,
    },
  });

  it('re-attributes the order to this caller’s own stop ids', async () => {
    const { database } = fakeDatabase([envelope(['ChIJc', 'ChIJa', 'ChIJb'])]);

    const found = await readOptimizeCache(database, request(), NOW);
    expect(found?.orderedStopIds).toEqual(['s3', 's1', 's2']);
  });

  it('filters expiry in the query rather than after reading', async () => {
    // A row read and then discarded is a stale result briefly in memory; the
    // same mistake on `places_cache` would be a terms breach.
    const { database, reads } = fakeDatabase([]);
    await readOptimizeCache(database, request(), NOW);

    expect(reads[0]?.sql).toContain('expires_at >');
    expect(reads[0]?.params[1]).toBe(NOW.toISOString());
  });

  it('handles the same address twice, which is an ordinary Tuesday', async () => {
    const twice = request({
      stops: [
        { stopId: 's1', placeId: 'ChIJa' },
        { stopId: 's2', placeId: 'ChIJa' },
      ],
    });
    const { database } = fakeDatabase([envelope(['ChIJa', 'ChIJa'])]);

    const found = await readOptimizeCache(database, twice, NOW);
    expect(found?.orderedStopIds).toEqual(['s1', 's2']);
  });

  it('drops the leg ids rather than naming the wrong pair', async () => {
    // The stored legs were attributed by a different caller. Nothing in the
    // product reads these ids (ADR-0024), and a leg confidently naming the
    // wrong pair is not recoverable.
    const { database } = fakeDatabase([envelope(['ChIJa', 'ChIJb', 'ChIJc'])]);

    const found = await readOptimizeCache(database, request(), NOW);
    expect(found?.legs[0]?.fromStopId).toBeNull();
    expect(found?.legs[0]?.toStopId).toBeNull();
    expect(found?.legs[0]?.distanceMeters).toBe(1200);
  });

  it('treats an unmappable entry as a miss rather than trusting it', async () => {
    // A place id this caller did not send. Better a second Routes call than a
    // wrong route that looks complete (`CLAUDE.md` §0 rule 5).
    const { database } = fakeDatabase([envelope(['ChIJa', 'ChIJb', 'ChIJsomewhere-else'])]);
    expect(await readOptimizeCache(database, request(), NOW)).toBeNull();
  });

  it('treats a different stop count as a miss', async () => {
    const { database } = fakeDatabase([envelope(['ChIJa', 'ChIJb'])]);
    expect(await readOptimizeCache(database, request(), NOW)).toBeNull();
  });

  it('treats a malformed row as a miss', async () => {
    for (const row of [{ result: null }, { result: 'nonsense' }, { result: {} }]) {
      const { database } = fakeDatabase([row]);
      expect(await readOptimizeCache(database, request(), NOW)).toBeNull();
    }
  });

  it('reports a miss when there is no row at all', async () => {
    const { database } = fakeDatabase([]);
    expect(await readOptimizeCache(database, request(), NOW)).toBeNull();
  });
});

describe('a write and a read agree', () => {
  it('round-trips an ordering through the stored shape', async () => {
    const { database, writes } = fakeDatabase();
    await writeOptimizeCache(database, request(), result(['s3', 's2', 's1']), NOW);

    const payload = JSON.parse(String(writes[0]?.params[1])) as unknown;
    const reader = fakeDatabase([{ result: payload }]);

    const found = await readOptimizeCache(reader.database, request(), NOW);
    expect(found?.orderedStopIds).toEqual(['s3', 's2', 's1']);
    expect(found?.totalDurationSeconds).toBe(900);
  });

  it('gives a second caller their own ids for the same route', async () => {
    // The property the envelope exists for.
    const { database, writes } = fakeDatabase();
    await writeOptimizeCache(database, request(), result(['s3', 's1', 's2']), NOW);
    const payload = JSON.parse(String(writes[0]?.params[1])) as unknown;

    const other = request({
      routeId: '99999999-8888-7777-6666-555555555555',
      stops: [
        { stopId: 'mine-1', placeId: 'ChIJa' },
        { stopId: 'mine-2', placeId: 'ChIJb' },
        { stopId: 'mine-3', placeId: 'ChIJc' },
      ],
    });

    const reader = fakeDatabase([{ result: payload }]);
    const found = await readOptimizeCache(reader.database, other, NOW);

    expect(found?.orderedStopIds).toEqual(['mine-3', 'mine-1', 'mine-2']);
  });
});
