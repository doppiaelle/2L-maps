import type { Stop } from '@/types';

import { createRouteProgressStore, memoryProgressStorage } from './route-progress-store';

/**
 * The tests that matter here are about ordering and about survival. Everything
 * else in this store delegates to pure functions that are already tested in
 * `lib/route/progress`; re-testing them through the store would be testing
 * Zustand.
 */

const stop = (id: string, position = 0): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  placeText: null,
  note: null,
  position,
  entryOrder: position,
  coordinate: {
    latitude: 45.7,
    longitude: 9.7,
    formattedAddress: `Via ${id} 1, Bergamo`,
    refreshedAt: new Date().toISOString(),
  },
  isCompleted: false,
});

const stops = [stop('a', 0), stop('b', 1), stop('c', 2)];

const freshStore = () => createRouteProgressStore(memoryProgressStorage());

describe('progress is written before the handoff', () => {
  it('has already persisted the mark by the time the handoff runs', async () => {
    // The rule this store exists to enforce. The app is backgrounded for the
    // whole drive and can be killed during the launch; a write ordered after it
    // is lost exactly when the user has invested the most.
    const store = freshStore();
    store.getState().begin('route-1');

    let stateDuringHandoff: string | null = null;
    await store.getState().markAndHandOff('a', 'completed', async () => {
      stateDuringHandoff = store.getState().stateOfStop('a');
    });

    expect(stateDuringHandoff).toBe('completed');
  });

  it('keeps the mark when the external app fails to launch', async () => {
    // The user did visit the stop. Un-marking it because Waze misbehaved would
    // be the wrong correction, and it would happen while they are driving.
    const store = freshStore();
    store.getState().begin('route-1');

    const result = await store.getState().markAndHandOff('a', 'completed', async () => {
      throw new Error('no activity found');
    });

    expect(result).toEqual({ handedOff: false });
    expect(store.getState().stateOfStop('a')).toBe('completed');
  });

  it('reports the handoff separately from the mark', async () => {
    const store = freshStore();
    store.getState().begin('route-1');

    const result = await store.getState().markAndHandOff('a', 'completed', async () => undefined);
    expect(result).toEqual({ handedOff: true });
  });

  it('does nothing when no route is underway', async () => {
    const store = freshStore();
    let ran = false;

    const result = await store.getState().markAndHandOff('a', 'completed', async () => {
      ran = true;
    });

    expect(result).toEqual({ handedOff: false });
    expect(ran).toBe(false);
  });
});

describe('surviving a process death', () => {
  it('restores progress into a freshly constructed store', async () => {
    // Same storage, new store — which is what a cold start after an OS kill
    // looks like from here.
    const storage = memoryProgressStorage();

    const before = createRouteProgressStore(storage);
    before.getState().begin('route-7');
    before.getState().mark('a', 'completed');
    before.getState().mark('b', 'skipped');

    const after = createRouteProgressStore(storage);
    await after.persist.rehydrate();

    expect(after.getState().stateOfStop('a')).toBe('completed');
    expect(after.getState().stateOfStop('b')).toBe('skipped');
    expect(after.getState().stateOfStop('c')).toBe('pending');
  });
});

describe('what the store answers while nothing is underway', () => {
  it('reports every stop pending rather than throwing', () => {
    const store = freshStore();
    expect(store.getState().stateOfStop('a')).toBe('pending');
    expect(store.getState().next(stops)).toBeNull();
    expect(store.getState().summary(stops)).toBeNull();
    expect(store.getState().isUnderway()).toBe(false);
  });

  it('treats every stop as remaining, so a re-optimization is not silently empty', () => {
    const store = freshStore();
    expect(store.getState().remainingFor(stops)).toEqual(stops);
  });
});

describe('a route in progress', () => {
  it('is not underway until a stop has actually been settled', () => {
    // Beginning a route is not the same as driving one: the distinction decides
    // whether abandoning it needs a confirmation.
    const store = freshStore();
    store.getState().begin('route-1');
    expect(store.getState().isUnderway()).toBe(false);

    store.getState().mark('a', 'completed');
    expect(store.getState().isUnderway()).toBe(true);
  });

  it('drops progress for stops that no longer exist after an edit', () => {
    const store = freshStore();
    store.getState().begin('route-1');
    store.getState().mark('c', 'completed');

    store.getState().pruneTo([stop('a', 0), stop('b', 1)]);
    expect(store.getState().stateOfStop('c')).toBe('pending');
  });

  it('abandoning clears everything', () => {
    const store = freshStore();
    store.getState().begin('route-1');
    store.getState().mark('a', 'completed');

    store.getState().abandon();
    expect(store.getState().progress).toBeNull();
  });
});

describe('the store exposes actions, not setters', () => {
  it('has no way to overwrite progress wholesale', () => {
    // A setter hands the store's invariants to every call site, and one of them
    // eventually gets it wrong (CLAUDE.md §4).
    const api = store() as unknown as Record<string, unknown>;
    expect(api['setProgress']).toBeUndefined();
    expect(api['setCompletedStops']).toBeUndefined();
  });
});

function store() {
  return freshStore().getState();
}
