import { placeDetailsUpstream } from '../functions/_shared/endpoints/place-details';
import { geocodeUpstream } from '../functions/_shared/endpoints/geocode';
import { autocompleteUpstream } from '../functions/_shared/endpoints/places-autocomplete';
import { ensurePlaceIds, readFreshPlaces, writePlaces } from '../functions/_shared/places-cache';
import { COORDINATE_MAX_AGE_DAYS } from '../../types/constants';

import type { DatabaseClient } from '../functions/_shared/dependencies';

/**
 * `places_cache` is where the cost model stops being theoretical, and every test
 * here is about money or about a foreign key.
 *
 * The table existed from the first migration and nothing wrote to it, which made
 * two things quietly untrue at once: the shared cache saved nobody anything, and
 * `stops.place_id` — a foreign key into it, inserted by a client that has no
 * write access here — could not be satisfied at all.
 */

const NOW = new Date('2026-08-09T12:00:00.000Z');

interface Recorded {
  readonly sql: string;
  readonly params: readonly unknown[];
}

const fakeDatabase = (
  rows: readonly Record<string, unknown>[] = [],
): { database: DatabaseClient; writes: Recorded[]; reads: Recorded[] } => {
  const writes: Recorded[] = [];
  const reads: Recorded[] = [];

  return {
    writes,
    reads,
    database: {
      queryOne: async () => null,
      queryMany: async <T>(sql: string, params: readonly unknown[]): Promise<readonly T[]> => {
        reads.push({ sql, params });
        return rows as unknown as readonly T[];
      },
      execute: async (sql: string, params: readonly unknown[]) => {
        writes.push({ sql, params });
      },
    },
  };
};

const place = (placeId: string) => ({
  placeId,
  formattedAddress: `Via ${placeId} 1, Bergamo`,
  lat: 45.7,
  lng: 9.7,
});

describe('reading the cache', () => {
  it('asks for nothing when there is nothing to ask about', async () => {
    // Twenty-five stops all cached locally is the good case, not a reason to
    // open a connection.
    const { database, reads } = fakeDatabase();
    await readFreshPlaces(database, [], NOW);
    expect(reads).toHaveLength(0);
  });

  it('filters on the thirty-day window in the query, not afterwards', async () => {
    // The window is a terms obligation (ADR-0007). Fetching expired rows and
    // discarding them in JavaScript would put expired coordinates in memory,
    // which is the same breach with an extra step.
    const { database, reads } = fakeDatabase();
    await readFreshPlaces(database, ['a'], NOW);

    const read = reads[0];
    if (read === undefined) throw new Error('expected a query');
    expect(read.sql).toContain('coords_refreshed_at >');

    const cutoff = read.params[1];
    expect(cutoff).toBe(
      new Date(NOW.getTime() - COORDINATE_MAX_AGE_DAYS * 86_400_000).toISOString(),
    );
  });

  it('skips a row that survived the purge with no coordinates', async () => {
    // The purge nulls the columns and keeps the row, so a place_id can exist,
    // satisfy the foreign key, and have nothing to show a driver. That is the
    // normal post-purge state, not an error.
    const { database } = fakeDatabase([
      { place_id: 'a', formatted_address: null, lat: null, lng: null },
    ]);
    const found = await readFreshPlaces(database, ['a'], NOW);
    expect(found.size).toBe(0);
  });
});

describe('writing the cache', () => {
  it('writes nothing for an empty batch', async () => {
    const { database, writes } = fakeDatabase();
    await writePlaces(database, []);
    expect(writes).toHaveLength(0);
  });

  it('writes a whole batch in one statement', async () => {
    // Twenty-five sequential inserts is twenty-five round trips for one import.
    const { database, writes } = fakeDatabase();
    await writePlaces(database, [place('a'), place('b'), place('c')]);

    expect(writes).toHaveLength(1);
    expect(writes[0]?.params[0]).toEqual(['a', 'b', 'c']);
  });

  it('refreshes the window only on a write, because that is when Google answered', async () => {
    const { database, writes } = fakeDatabase();
    await writePlaces(database, [place('a')]);
    expect(writes[0]?.sql).toContain('now()');
  });

  it('records an id with no coordinates without overwriting one that has them', async () => {
    // `ensurePlaceIds` knows nothing a cached row does not. `do update` here
    // would blank a fresh coordinate every time a suggestion was shown.
    const { database, writes } = fakeDatabase();
    await ensurePlaceIds(database, ['a']);
    expect(writes[0]?.sql).toContain('do nothing');
  });
});

describe('/place-details buys only what it does not have', () => {
  const portReturning = (resolved: readonly ReturnType<typeof place>[]) => {
    const asked: string[][] = [];
    return {
      asked,
      places: {
        detailsFor: async (placeIds: readonly string[]) => {
          asked.push([...placeIds]);
          return { resolved, unresolved: [], outage: null };
        },
      },
    };
  };

  it('does not call Google at all when every stop is cached', async () => {
    const { database } = fakeDatabase([
      { place_id: 'a', formatted_address: 'Via a 1', lat: 45.7, lng: 9.7 },
    ]);
    const { asked, places } = portReturning([]);

    const outcome = await placeDetailsUpstream({ placeIds: ['a'] }, { database, places, now: NOW });

    expect(asked).toHaveLength(0);
    expect(outcome.result.resolved).toHaveLength(1);
  });

  it('still charges one unit for a fully cached answer', async () => {
    // A hit is free upstream and not free to serve. Unlimited free hits would
    // let a user with a recurring route consume unbounded value while the quota
    // reports them idle (docs/13_BACKEND.md §4).
    const { database } = fakeDatabase([
      { place_id: 'a', formatted_address: 'Via a 1', lat: 45.7, lng: 9.7 },
    ]);
    const { places } = portReturning([]);

    const outcome = await placeDetailsUpstream({ placeIds: ['a'] }, { database, places, now: NOW });
    expect(outcome.units).toBe(1);
  });

  it('asks only for the stops that expired', async () => {
    const { database } = fakeDatabase([
      { place_id: 'a', formatted_address: 'Via a 1', lat: 45.7, lng: 9.7 },
    ]);
    const { asked, places } = portReturning([place('b')]);

    const outcome = await placeDetailsUpstream(
      { placeIds: ['a', 'b'] },
      { database, places, now: NOW },
    );

    expect(asked).toEqual([['b']]);
    // The bill is what reached Google, which is the figure the cost model is
    // written against.
    expect(outcome.units).toBe(1);
    expect(outcome.result.resolved.map((p) => p.placeId).sort()).toEqual(['a', 'b']);
  });

  it('buys a repeated address once', async () => {
    // A morning delivery and an afternoon collection at the same address is a
    // real working day, and paying for it twice is waste nobody ever notices.
    const { database } = fakeDatabase();
    const { asked, places } = portReturning([place('a')]);

    await placeDetailsUpstream({ placeIds: ['a', 'a', 'a'] }, { database, places, now: NOW });
    expect(asked).toEqual([['a']]);
  });

  it('writes what it fetched, so the next caller does not buy it again', async () => {
    const { database, writes } = fakeDatabase();
    const { places } = portReturning([place('a')]);

    await placeDetailsUpstream({ placeIds: ['a'] }, { database, places, now: NOW });
    expect(writes.some((write) => write.sql.includes('insert into places_cache'))).toBe(true);
  });

  it('reports an unresolvable stop rather than dropping it', async () => {
    const { database } = fakeDatabase();
    const places = {
      detailsFor: async () => ({ resolved: [], unresolved: ['gone'], outage: null }),
    };

    const outcome = await placeDetailsUpstream(
      { placeIds: ['gone'] },
      { database, places, now: NOW },
    );
    expect(outcome.result.unresolved).toEqual([{ placeId: 'gone' }]);
  });

  it('reports an outage as an outage, not as twenty-five demolished buildings', async () => {
    const { database } = fakeDatabase();
    const places = {
      detailsFor: async () => ({ resolved: [], unresolved: [], outage: { kind: 'unreachable' } }),
    };

    await expect(
      placeDetailsUpstream({ placeIds: ['a'] }, { database, places, now: NOW }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});

describe('/geocode creates the cheap path rather than taking it', () => {
  it('writes every resolved place so the next lookup is free', async () => {
    const { database, writes } = fakeDatabase();
    const places = {
      geocode: async () => ({
        resolved: [{ ...place('a'), index: 0 }],
        unresolved: [{ index: 1, input: 'nonsense' }],
        outage: null,
      }),
    };

    const outcome = await geocodeUpstream(
      { addresses: ['Via a 1', 'nonsense'] },
      {
        database,
        places,
      },
    );

    expect(writes[0]?.params[0]).toEqual(['a']);
    // Partial success: two lines in, one stop and one named row out.
    expect(outcome.result.unresolved).toHaveLength(1);
    // Billed per address submitted — Google charged for the empty one too.
    expect(outcome.units).toBe(2);
  });
});

describe('/places-autocomplete records the ids it hands out', () => {
  it('makes a suggestion saveable before its coordinates exist', async () => {
    // The client can add a suggestion as a stop and save the route in the next
    // second, while the coordinates are still unresolved — an ordinary state
    // under ADR-0007. Without the row the save is a foreign-key violation on a
    // stop the user is looking at.
    const { database, writes } = fakeDatabase();
    const places = {
      suggest: async () => ({ ok: true as const, value: [{ placeId: 'a' }, { placeId: 'b' }] }),
    };

    await autocompleteUpstream({ input: 'via a', sessionToken: 'token' }, { database, places });

    expect(writes[0]?.sql).toContain('places_cache');
    expect(writes[0]?.params[0]).toEqual(['a', 'b']);
  });

  it('says why upstream refused, and never says what was typed', async () => {
    // All four ways address search can stop working reached the phone as one
    // sentence — "Search is not responding" — and this line was where the
    // difference between them was thrown away. When search went down for
    // everybody there was nothing at either end to say which one it was
    // (`CLAUDE.md` §0 rule 5).
    const { database } = fakeDatabase();
    const places = {
      suggest: async () => ({ ok: false as const, failure: { kind: 'rejected', status: 400 } }),
    };
    const logged: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((line: unknown) => {
      logged.push(String(line));
    });

    await expect(
      autocompleteUpstream(
        { input: 'via privata dei tulipani', sessionToken: 'token' },
        {
          database,
          places,
        },
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });

    spy.mockRestore();

    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0] ?? '{}')).toEqual({
      event: 'autocomplete_failed',
      reason: 'rejected',
      upstreamStatus: 400,
    });
    // The input is an address, and an address may not reach a log line
    // (`CLAUDE.md` §9 rule 7).
    expect(logged[0]).not.toContain('tulipani');
  });
});
