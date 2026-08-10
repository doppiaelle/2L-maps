import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

import { GC_TIME_MS } from './client';

/**
 * The persisted query cache — the thing that actually makes offline read work.
 *
 * [`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §6 says so
 * in one line: "**Persisted query cache** is what makes offline read work: the
 * address book, saved routes and history are all served from it without a
 * network." Every twenty-four-hour `gcTime` in `client.ts` was written for this
 * and it was never configured, so the retention held a cache that died with the
 * process — and the offline states elsewhere in the app were reachable only from
 * tests.
 *
 * **Not everything is kept.** The predicate below is a compliance boundary, not
 * a tuning knob.
 */

/** The same twenty-four hours the caches are retained for. A persisted entry
 *  older than its own `gcTime` would be restored only to be collected. */
const MAX_AGE_MS = GC_TIME_MS.savedData;

/**
 * Which queries may be written to disk.
 *
 * **`places` is excluded, and that is the rule this file exists to enforce.**
 * Resolved places carry coordinates and formatted addresses, both of which are
 * Google-derived and deletable after thirty days
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * A disk cache has no purge job, so persisting them would put perishable data
 * somewhere nothing ever expires it — a terms breach rather than a stale cache
 * (`CLAUDE.md` §13 rule 3), and one that would survive reinstalling nothing and
 * be invisible to every review.
 *
 * They are still cached **in memory** for twenty-four hours, which covers a
 * working day without a signal. What is lost by not persisting them is one batch
 * of re-resolution after the process dies. That is a request; the alternative is
 * a breach.
 *
 * Everything else is durable by design: saved routes and the address book are
 * `place_id`s, labels and counts.
 */
export function isPersistable(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return head !== 'places';
}

export interface QueryPersisterOptions {
  /** The storage to write through. Injected so a test drives persistence
   *  without a device, and so the choice is made at the composition root. */
  readonly storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
}

export const QUERY_CACHE_STORAGE_KEY = '2l-maps.query-cache';

/**
 * Bumped when a cached shape changes.
 *
 * A restored cache is data from a previous version of this app, and it is a
 * boundary like any other (`CLAUDE.md` §3). The buster is the cheap half of
 * that: an entry written by an older build is discarded rather than handed to
 * code that expects a field it does not have.
 */
export const QUERY_CACHE_BUSTER = 'v1';

export function createQueryPersister(options: QueryPersisterOptions): Persister {
  const persister = createAsyncStoragePersister({
    storage: options.storage,
    key: QUERY_CACHE_STORAGE_KEY,
    // Written at most once a second rather than on every cache mutation. A
    // twenty-five stop route produces a burst of updates and serialising the
    // whole cache for each one is work on the JS thread during a gesture
    // (`CLAUDE.md` §6 rule 5).
    throttleTime: 1_000,
  });

  return {
    ...persister,
    persistClient: async (client: PersistedClient) => {
      // Filtered on the way *out*, not on the way in. A query excluded here is
      // still cached in memory and still serves this session; it simply never
      // reaches a disk that has no purge job.
      await persister.persistClient({
        ...client,
        clientState: {
          ...client.clientState,
          queries: client.clientState.queries.filter((query) => isPersistable(query.queryKey)),
        },
      });
    },
  };
}

/** What `PersistQueryClientProvider` needs beside the persister. Exported as one
 *  object so a caller cannot configure the age and forget the buster. */
export function queryPersistOptions(persister: Persister) {
  return { persister, maxAge: MAX_AGE_MS, buster: QUERY_CACHE_BUSTER };
}
