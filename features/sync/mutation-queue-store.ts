import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

import { collapse, resolveQueue, type QueuedMutation, type Resolution } from '@/lib/sync/conflicts';

/**
 * The offline mutation queue.
 *
 * Every edit made without a network is applied locally, appended here, and
 * persisted before the user sees the change
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §8). The
 * queue drains in order on reconnection.
 *
 * Three properties are load-bearing, and each has a failure it prevents:
 *
 * **Order is preserved.** Two edits to the same field replay in the order the
 * user made them, or the older one wins and the newer is silently lost.
 *
 * **Ids are client-generated** (in `lib/sync`, not here), so a route created
 * offline keeps its identity through sync and the stop added to it a minute
 * later still references something real.
 *
 * **Draining is not destructive until it succeeds.** An item is removed only
 * when the server has acknowledged it. A drain interrupted halfway leaves the
 * remainder queued, and the idempotency key makes the replay of an already-
 * applied item free rather than duplicated (docs/33_API_CONTRACTS.md).
 *
 * The resolution rules are pure functions in `lib/sync/conflicts`; this store
 * sequences them and holds the result.
 */

export type QueueStorage = PersistStorage<{ queue: readonly QueuedMutation[] }>;

export const MUTATION_QUEUE_STORAGE_KEY = '2l-maps.mutation-queue';

/** What a drain attempt did with one item, reported so the UI can explain a
 *  change that vanished rather than letting it vanish silently. */
export interface DrainOutcome {
  readonly applied: readonly QueuedMutation[];
  readonly discarded: readonly {
    readonly mutation: QueuedMutation;
    readonly resolution: Resolution;
  }[];
  /** Reorder-versus-reorder, the only genuine conflict. The user chooses. */
  readonly needsUser: readonly QueuedMutation[];
  /** Everything still queued afterwards — conflicts awaiting the user, plus
   *  anything after the point a failed send stopped the drain. */
  readonly remaining: readonly QueuedMutation[];
}

export interface MutationQueueStore {
  readonly queue: readonly QueuedMutation[];

  enqueue: (mutation: QueuedMutation) => void;
  /** Collapse redundant mutations before a drain — five relabels of one stop are
   *  one write, not five billed round trips. */
  compact: () => void;

  /**
   * Drain against what landed remotely while we were offline.
   *
   * `send` returns whether the server accepted the item. A rejection stops the
   * drain rather than skipping ahead: later items may depend on earlier ones,
   * and applying them out of order is how a stop ends up attached to a route
   * that was never created.
   */
  drain: (
    remote: readonly QueuedMutation[],
    send: (mutation: QueuedMutation) => Promise<boolean>,
  ) => Promise<DrainOutcome>;

  /** Remove one item after the user has resolved its conflict by hand. */
  settle: (mutationId: string) => void;

  isEmpty: () => boolean;
}

export function createMutationQueueStore(storage?: QueueStorage) {
  return create<MutationQueueStore>()(
    persist(
      (set, get) => ({
        queue: [],

        enqueue: (mutation) => {
          set({ queue: [...get().queue, mutation] });
        },

        compact: () => {
          set({ queue: collapse(get().queue) });
        },

        drain: async (remote, send) => {
          const resolutions = resolveQueue(get().queue, remote);

          const applied: QueuedMutation[] = [];
          const discarded: { mutation: QueuedMutation; resolution: Resolution }[] = [];
          const needsUser: QueuedMutation[] = [];

          for (const entry of resolutions) {
            const { mutation, resolution } = entry;

            if (resolution.kind === 'discard-local') {
              discarded.push({ mutation, resolution });
              continue;
            }

            if (resolution.kind === 'ask-user') {
              // Left in the queue. It is the user's decision, and dropping it
              // to keep draining would make that decision for them.
              needsUser.push(mutation);
              continue;
            }

            const accepted = await send(mutation);
            if (!accepted) {
              // The network went again. Everything from here stays queued, in
              // order — skipping ahead is how a stop ends up attached to a
              // route that was never created.
              break;
            }
            applied.push(mutation);
          }

          const appliedIds = new Set(applied.map((m) => m.id));
          const discardedIds = new Set(discarded.map((d) => d.mutation.id));
          // Anything not acknowledged and not discarded stays, including the
          // items after the point the drain stopped.
          const remaining = get().queue.filter(
            (m) => !appliedIds.has(m.id) && !discardedIds.has(m.id),
          );

          set({ queue: remaining });

          return { applied, discarded, needsUser, remaining };
        },

        settle: (mutationId) => {
          set({ queue: get().queue.filter((m) => m.id !== mutationId) });
        },

        isEmpty: () => get().queue.length === 0,
      }),
      {
        name: MUTATION_QUEUE_STORAGE_KEY,
        ...(storage === undefined ? {} : { storage }),
        partialize: (state) => ({ queue: state.queue }),
      },
    ),
  );
}

/** In-memory storage, for tests and for the case where no device storage is
 *  available. Named so its absence of durability is obvious at the call site. */
export function memoryQueueStorage(): QueueStorage {
  const map = new Map<string, string>();
  return createJSONStorage(() => ({
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  })) as QueueStorage;
}
