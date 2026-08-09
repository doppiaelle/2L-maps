import type { QueuedMutation } from '@/lib/sync/conflicts';

import { createMutationQueueStore, memoryQueueStorage } from './mutation-queue-store';

/**
 * The queue holds edits the user has already been shown. Every test here is
 * about not losing one, or not applying one twice, or not applying them out of
 * the order the user made them in.
 */

let clock = 0;
const mutation = (
  overrides: Partial<QueuedMutation> & Pick<QueuedMutation, 'id' | 'kind'>,
): QueuedMutation => {
  clock += 1000;
  return {
    routeId: 'route-1',
    fields: [],
    occurredAt: new Date(clock).toISOString(),
    idempotencyKey: `idem-${overrides.id}`,
    ...overrides,
  };
};

const freshStore = () => createMutationQueueStore(memoryQueueStorage());
const acceptAll = async () => true;

describe('order is preserved', () => {
  it('drains in the order the user acted', async () => {
    // Two edits to the same field replay in the order they were made, or the
    // older one wins and the newer is silently lost.
    const store = freshStore();
    store.getState().enqueue(mutation({ id: 'm1', kind: 'add-stop' }));
    store.getState().enqueue(mutation({ id: 'm2', kind: 'add-stop' }));
    store.getState().enqueue(mutation({ id: 'm3', kind: 'add-stop' }));

    const sent: string[] = [];
    await store.getState().drain([], async (m) => {
      sent.push(m.id);
      return true;
    });

    expect(sent).toEqual(['m1', 'm2', 'm3']);
  });

  it('stops at the first rejection rather than skipping ahead', async () => {
    // Applying later items out of order is how a stop ends up attached to a
    // route that was never created.
    const store = freshStore();
    store.getState().enqueue(mutation({ id: 'm1', kind: 'create-route' }));
    store.getState().enqueue(mutation({ id: 'm2', kind: 'add-stop' }));
    store.getState().enqueue(mutation({ id: 'm3', kind: 'add-stop' }));

    const sent: string[] = [];
    const outcome = await store.getState().drain([], async (m) => {
      sent.push(m.id);
      return m.id !== 'm2';
    });

    expect(sent).toEqual(['m1', 'm2']);
    expect(outcome.applied.map((m) => m.id)).toEqual(['m1']);
    expect(outcome.remaining.map((m) => m.id)).toEqual(['m2', 'm3']);
  });
});

describe('nothing is dropped before the server has it', () => {
  it('keeps an item that was never acknowledged', async () => {
    const store = freshStore();
    store.getState().enqueue(mutation({ id: 'm1', kind: 'add-stop' }));

    await store.getState().drain([], async () => false);
    expect(store.getState().queue.map((m) => m.id)).toEqual(['m1']);
  });

  it('removes an item once the server has taken it', async () => {
    const store = freshStore();
    store.getState().enqueue(mutation({ id: 'm1', kind: 'add-stop' }));

    await store.getState().drain([], acceptAll);
    expect(store.getState().isEmpty()).toBe(true);
  });

  it('survives a process death with the queue intact', async () => {
    // Same storage, new store — a cold start after an OS kill, with the user's
    // offline edits still unsent.
    const storage = memoryQueueStorage();
    const before = createMutationQueueStore(storage);
    before.getState().enqueue(mutation({ id: 'm1', kind: 'add-stop' }));
    before.getState().enqueue(mutation({ id: 'm2', kind: 'remove-stop' }));

    const after = createMutationQueueStore(storage);
    await after.persist.rehydrate();

    expect(after.getState().queue.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('conflicts', () => {
  it('leaves a reorder conflict queued for the user to decide', async () => {
    // The only genuine conflict. Dropping it to keep draining would make the
    // decision for them (docs/11_STATE_MANAGEMENT.md §8).
    const store = freshStore();
    const local = mutation({ id: 'local-reorder', kind: 'reorder-stops' });
    store.getState().enqueue(local);

    const remote = mutation({ id: 'remote-reorder', kind: 'reorder-stops' });
    const outcome = await store.getState().drain([remote], acceptAll);

    expect(outcome.needsUser.map((m) => m.id)).toEqual(['local-reorder']);
    expect(store.getState().queue.map((m) => m.id)).toEqual(['local-reorder']);
  });

  it('drops an edit to a route that was deleted remotely, and says so', async () => {
    // Resolved deterministically rather than asked about — but reported, so the
    // UI can explain a change that vanished instead of letting it vanish.
    const store = freshStore();
    store.getState().enqueue(mutation({ id: 'm1', kind: 'update-route-fields', fields: ['name'] }));

    const outcome = await store
      .getState()
      .drain([mutation({ id: 'remote-delete', kind: 'delete-route' })], acceptAll);

    expect(outcome.applied).toHaveLength(0);
    expect(outcome.discarded.map((d) => d.mutation.id)).toEqual(['m1']);
    expect(store.getState().isEmpty()).toBe(true);
  });

  it('lets the user settle a conflict by hand', () => {
    const store = freshStore();
    store.getState().enqueue(mutation({ id: 'm1', kind: 'reorder-stops' }));

    store.getState().settle('m1');
    expect(store.getState().isEmpty()).toBe(true);
  });
});

describe('compaction', () => {
  it('collapses redundant edits so five relabels are one write', async () => {
    // Five billed round trips for a result the user reached in one gesture.
    const store = freshStore();
    for (let i = 1; i <= 5; i += 1) {
      store
        .getState()
        .enqueue(mutation({ id: `m${i}`, kind: 'update-stop-fields', fields: ['label'] }));
    }

    store.getState().compact();
    expect(store.getState().queue.length).toBeLessThan(5);
  });
});
