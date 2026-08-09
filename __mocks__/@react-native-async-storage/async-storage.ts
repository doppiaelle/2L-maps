/**
 * AsyncStorage, in memory.
 *
 * The real module is a native module and has none of itself in a Jest
 * environment, so anything that persists — the draft route, route progress,
 * preferences, the mutation queue — throws on its first write without this.
 *
 * **Mock the storage, never the store.** The stores under test keep their own
 * persistence middleware, their own migration and their own partialize; what is
 * substituted is the device underneath them (`CLAUDE.md` §5). A mocked store
 * would pass every test and prove nothing about whether a draft survives being
 * killed.
 *
 * It is deliberately not cleared between tests here. A test that depends on
 * empty storage should reset the store it is testing, which is the thing it
 * actually means — clearing globally would hide a store that never resets.
 */

const store = new Map<string, string>();

const AsyncStorage = {
  getItem: (key: string): Promise<string | null> => Promise.resolve(store.get(key) ?? null),
  setItem: (key: string, value: string): Promise<void> => {
    store.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    store.delete(key);
    return Promise.resolve();
  },
  clear: (): Promise<void> => {
    store.clear();
    return Promise.resolve();
  },
  getAllKeys: (): Promise<readonly string[]> => Promise.resolve([...store.keys()]),
  multiGet: (keys: readonly string[]): Promise<readonly [string, string | null][]> =>
    Promise.resolve(keys.map((key) => [key, store.get(key) ?? null] as [string, string | null])),
  multiSet: (pairs: readonly [string, string][]): Promise<void> => {
    for (const [key, value] of pairs) store.set(key, value);
    return Promise.resolve();
  },
  multiRemove: (keys: readonly string[]): Promise<void> => {
    for (const key of keys) store.delete(key);
    return Promise.resolve();
  },
};

export default AsyncStorage;
