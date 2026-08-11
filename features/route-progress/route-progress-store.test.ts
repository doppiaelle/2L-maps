import { createRouteProgressStore, memoryProgressStorage } from './route-progress-store';

/**
 * The tests that matter here are about ordering and about survival.
 *
 * Everything this store used to hold about *which stops were done* is gone with
 * Done and Skip ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)),
 * and so are the twenty-odd cases that covered it. What is left is the property
 * that made this store worth writing in the first place: the record of the
 * handoff exists **before** the handoff happens, because the process may not
 * survive it.
 */

const freshStore = () => createRouteProgressStore(memoryProgressStorage());

describe('progress is written before the handoff', () => {
  it('has already persisted the start by the time the handoff runs', async () => {
    // The rule this store exists to enforce. The app is backgrounded for the
    // whole drive and can be killed during the launch; a write ordered after it
    // is lost exactly when the user has invested the most.
    const store = freshStore();

    let underwayDuringHandoff = false;
    await store.getState().beginAndHandOff('route-1', async () => {
      underwayDuringHandoff = store.getState().isUnderway();
    });

    expect(underwayDuringHandoff).toBe(true);
  });

  it('keeps the record when the external app fails to launch', async () => {
    // The user asked to set off. Forgetting that because Waze is not installed
    // would lose the route from History for a reason that has nothing to do with
    // whether it was driven.
    const store = freshStore();

    const result = await store.getState().beginAndHandOff('route-1', async () => {
      throw new Error('no activity found');
    });

    expect(result).toEqual({ handedOff: false });
    expect(store.getState().progress?.routeId).toBe('route-1');
  });

  it('reports the handoff separately from the record', async () => {
    const store = freshStore();
    const result = await store.getState().beginAndHandOff('route-1', async () => undefined);
    expect(result).toEqual({ handedOff: true });
  });
});

describe('surviving a process death', () => {
  it('restores progress into a freshly constructed store', async () => {
    // Same storage, new store — which is what a cold start after an OS kill
    // looks like from here.
    const storage = memoryProgressStorage();

    const before = createRouteProgressStore(storage);
    before.getState().begin('route-7', new Date('2026-08-11T06:00:00.000Z'));

    const after = createRouteProgressStore(storage);
    await after.persist.rehydrate();

    expect(after.getState().progress).toEqual({
      routeId: 'route-7',
      startedAt: '2026-08-11T06:00:00.000Z',
    });
  });
});

describe('restoring a route another device set off on', () => {
  it('keeps that device’s start time rather than stamping now', () => {
    // `begin` would rewrite this morning's departure to the moment the second
    // phone opened the route, and a day would look like it had just begun.
    const store = freshStore();
    store.getState().restore({ routeId: 'route-2', startedAt: '2026-08-11T05:15:00.000Z' });

    expect(store.getState().progress?.startedAt).toBe('2026-08-11T05:15:00.000Z');
  });

  it('accepts null, which is what a route nobody set off on looks like', () => {
    const store = freshStore();
    store.getState().begin('route-1');
    store.getState().restore(null);

    expect(store.getState().progress).toBeNull();
    expect(store.getState().isUnderway()).toBe(false);
  });
});

describe('what the store answers while nothing is underway', () => {
  it('reports no route rather than throwing', () => {
    const store = freshStore();
    expect(store.getState().progress).toBeNull();
    expect(store.getState().isUnderway()).toBe(false);
  });

  it('abandoning clears everything', () => {
    const store = freshStore();
    store.getState().begin('route-1');

    store.getState().abandon();
    expect(store.getState().progress).toBeNull();
  });
});

describe('the store exposes actions, not setters', () => {
  it('has no way to overwrite progress wholesale', () => {
    // A setter hands the store's invariants to every call site, and one of them
    // eventually gets it wrong (CLAUDE.md §4).
    const api = freshStore().getState() as unknown as Record<string, unknown>;
    expect(api['setProgress']).toBeUndefined();
    expect(api['setCompletedStops']).toBeUndefined();
  });
});
