import { createQueryPersister, isPersistable, QUERY_CACHE_STORAGE_KEY } from './persist';
import { queryKeys } from './client';

/**
 * The tests that matter here are about what is **not** written.
 *
 * A disk cache has no purge job. Persisting a Google-derived coordinate would
 * put perishable data somewhere nothing expires it — a terms breach rather than
 * a stale cache (ADR-0007, `CLAUDE.md` §13 rule 3), invisible to every review
 * and surviving indefinitely.
 */

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key: string) => Promise.resolve(map.get(key) ?? null),
      setItem: (key: string, value: string) => {
        map.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        map.delete(key);
        return Promise.resolve();
      },
    },
  };
};

const query = (queryKey: readonly unknown[], data: unknown) => ({
  queryKey,
  queryHash: JSON.stringify(queryKey),
  state: {
    data,
    dataUpdateCount: 1,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: 'success' as const,
    fetchStatus: 'idle' as const,
  },
});

describe('what may be written to disk', () => {
  it('refuses resolved places, which carry coordinates', () => {
    expect(isPersistable(['places', 'place-a,place-b'])).toBe(false);
  });

  it('allows saved routes, which are place ids and labels', () => {
    expect(isPersistable(queryKeys.savedRoutes())).toBe(true);
  });

  it('allows the address book, for the same reason', () => {
    expect(isPersistable(queryKeys.addressBook())).toBe(true);
  });

  it('allows the quota, which is numbers about the caller', () => {
    expect(isPersistable(['usage-quota'])).toBe(true);
  });
});

describe('persisting', () => {
  const persist = async (queries: ReturnType<typeof query>[]) => {
    const { map, storage } = memoryStorage();
    const persister = createQueryPersister({ storage });

    await persister.persistClient({
      buster: 'v1',
      timestamp: Date.now(),
      clientState: { mutations: [], queries },
    });

    // The persister throttles, so the write lands on the next tick rather than
    // synchronously.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    return map.get(QUERY_CACHE_STORAGE_KEY) ?? '';
  };

  it('does not write a coordinate to disk', async () => {
    const written = await persist([
      query(['places', 'place-a'], {
        resolved: [{ placeId: 'place-a', formattedAddress: 'Via Roma 1', lat: 45.7, lng: 9.7 }],
      }),
      query(queryKeys.savedRoutes(), [{ routeId: 'route-1' }]),
    ]);

    expect(written).not.toContain('45.7');
    expect(written).not.toContain('Via Roma 1');
  });

  it('still writes the durable caches beside it', async () => {
    // The exclusion is surgical. Dropping the whole cache to avoid one key would
    // take the offline story with it.
    const written = await persist([
      query(['places', 'place-a'], { resolved: [] }),
      query(queryKeys.savedRoutes(), [{ routeId: 'route-1' }]),
    ]);

    expect(written).toContain('route-1');
  });
});
