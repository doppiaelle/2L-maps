import type { Stop } from '@/types';

import { createDraftRouteStore, memoryDraftStorage, migrateDraft } from './draft-route-store';

/**
 * The store's job is to hold state and expose actions. The rules it enforces are
 * tested in `lib/route/draft`; what is tested here is that the store cannot be
 * left in a state the domain forbids, and that a refused action tells the user
 * something rather than appearing to be ignored.
 */

const stop = (id: string): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  note: null,
  position: 0,
  entryOrder: 0,
  coordinate: null,
  isCompleted: false,
});

const newStore = () => createDraftRouteStore(memoryDraftStorage());

describe('actions rather than setters', () => {
  it('exposes no way to set the stop array directly', () => {
    // A setter hands the invariants to every call site, and one eventually gets
    // it wrong. The store owns them.
    const api = newStore().getState();
    expect('setStops' in api).toBe(false);
    expect('setDraft' in api).toBe(false);
  });

  it('adds and removes through actions', () => {
    const store = newStore();
    store.getState().addStopToDraft(stop('a'));
    store.getState().addStopToDraft(stop('b'));
    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['a', 'b']);

    store.getState().removeStopById('a');
    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['b']);
  });

  it('keeps positions contiguous through every action', () => {
    const store = newStore();
    for (const id of ['a', 'b', 'c']) store.getState().addStopToDraft(stop(id));
    store.getState().removeStopById('b');
    store.getState().moveStopTo(1, 0);

    expect(store.getState().draft.stops.map((s) => s.position)).toEqual([0, 1]);
  });
});

describe('a refused action explains itself', () => {
  it('records why an action was refused', () => {
    // Silence reads as the tap not registering, which makes the user tap again.
    const store = newStore();
    store.getState().removeStopById('never-existed');

    expect(store.getState().lastRefusal).toEqual({ action: 'remove', refusal: 'not-found' });
  });

  it('clears the refusal on the next action that succeeds', () => {
    const store = newStore();
    store.getState().setStopLabel('ghost', 'x');
    expect(store.getState().lastRefusal).not.toBeNull();

    store.getState().addStopToDraft(stop('a'));
    expect(store.getState().lastRefusal).toBeNull();
  });

  it('can be dismissed', () => {
    const store = newStore();
    store.getState().removeStopById('ghost');
    store.getState().clearRefusal();
    expect(store.getState().lastRefusal).toBeNull();
  });
});

describe('undo', () => {
  it('restores a removed stop in its original position', () => {
    const store = newStore();
    for (const id of ['a', 'b', 'c']) store.getState().addStopToDraft(stop(id));

    store.getState().removeStopById('b');
    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['a', 'c']);

    store.getState().undoRemove();
    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when there is nothing to undo', () => {
    const store = newStore();
    store.getState().addStopToDraft(stop('a'));
    store.getState().undoRemove();
    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['a']);
  });

  it('cannot be applied twice', () => {
    // Otherwise a double tap on the toast duplicates the stop.
    const store = newStore();
    store.getState().addStopToDraft(stop('a'));
    store.getState().removeStopById('a');
    store.getState().undoRemove();
    store.getState().undoRemove();

    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['a']);
  });
});

describe('what invalidates an optimization result', () => {
  const optimized = () => {
    const store = newStore();
    for (const id of ['a', 'b', 'c']) store.getState().addStopToDraft(stop(id));
    store.getState().applyResult({
      tier: 'T0',
      isDegraded: true,
      orderedStopIds: ['c', 'b', 'a'],
      totalDistanceMeters: 1200,
    });
    return store;
  };

  it('applying a result reorders and labels it degraded', () => {
    const store = optimized();
    expect(store.getState().draft.stops.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(store.getState().draft.isDegraded).toBe(true);
  });

  it('changing the origin clears it', () => {
    // Which stop is nearest depends on where the user starts, so a new origin
    // means the order no longer follows from anything.
    const store = optimized();
    store.getState().setOrigin('place-home', false);
    expect(store.getState().draft.isDegraded).toBe(false);
  });

  it('toggling the shape clears it', () => {
    const store = optimized();
    store.getState().setRouteShape('round-trip');
    expect(store.getState().draft.isDegraded).toBe(false);
  });
});

describe('derived state is exposed rather than recomputed by callers', () => {
  it('reports readiness so a component never applies the rule itself', () => {
    // A component containing an `if` about a domain rule has that rule in the
    // wrong place (CLAUDE.md §1).
    const store = newStore();
    expect(store.getState().canOptimize()).toBe(false);

    store.getState().addStopToDraft(stop('a'));
    store.getState().addStopToDraft(stop('b'));
    expect(store.getState().canOptimize()).toBe(true);
  });

  it('reports remaining capacity', () => {
    const store = newStore();
    const before = store.getState().remainingCapacity();
    store.getState().addStopToDraft(stop('a'));
    expect(store.getState().remainingCapacity()).toBe(before - 1);
  });
});

describe('persistence', () => {
  it('persists the draft', async () => {
    const storage = memoryDraftStorage();
    const store = createDraftRouteStore(storage);
    store.getState().addStopToDraft(stop('a'));

    const written = await storage.getItem('draft-route');
    expect(JSON.stringify(written)).toContain('place-a');
  });

  it('does not persist a refusal or an undo offer', async () => {
    // Restoring them would show the user a toast for something they did before
    // the app was killed.
    const storage = memoryDraftStorage();
    const store = createDraftRouteStore(storage);
    store.getState().addStopToDraft(stop('a'));
    store.getState().removeStopById('a');
    store.getState().removeStopById('ghost');

    const written = JSON.stringify(await storage.getItem('draft-route'));
    expect(written).not.toContain('lastRefusal');
    expect(written).not.toContain('undoable');
  });

  it('restores the draft into a new store, which is what survives process death', async () => {
    const storage = memoryDraftStorage();
    const first = createDraftRouteStore(storage);
    first.getState().addStopToDraft(stop('a'));
    first.getState().addStopToDraft(stop('b'));

    const second = createDraftRouteStore(storage);
    await second.persist.rehydrate();

    expect(second.getState().draft.stops.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('reset', () => {
  it('clears everything, including the undo offer', () => {
    const store = newStore();
    store.getState().addStopToDraft(stop('a'));
    store.getState().removeStopById('a');

    store.getState().reset('new-route');

    expect(store.getState().draft.routeId).toBe('new-route');
    expect(store.getState().draft.stops).toEqual([]);
    expect(store.getState().undoable).toBeNull();
    expect(store.getState().lastRefusal).toBeNull();
  });
});

describe('reading a draft written by an older build', () => {
  // Persisted data is a boundary like any other (CLAUDE.md §3), and this one
  // sits on the user's own filesystem rather than ours.

  it('gives every stop an entry order when the stored draft has none', () => {
    // A draft written before `entryOrder` existed had exactly one order, so its
    // positions *are* its entry order. Any other default invents history.
    const migrated = migrateDraft(
      {
        draft: {
          routeId: 'route-1',
          originPlaceId: null,
          originIsCurrentLocation: true,
          shape: 'one-way',
          stops: [
            {
              id: 'a',
              placeId: 'p-a',
              label: null,
              note: null,
              position: 0,
              coordinate: null,
              isCompleted: false,
            },
            {
              id: 'b',
              placeId: 'p-b',
              label: null,
              note: null,
              position: 1,
              coordinate: null,
              isCompleted: false,
            },
          ],
          isDegraded: false,
        },
      },
      0,
    );

    expect(migrated.draft.stops.map((stop) => stop.entryOrder)).toEqual([0, 1]);
  });

  it('never claims an old draft was optimized', () => {
    // It cannot prove it, and claiming one would put "Already the fastest order"
    // on a list the user typed themselves.
    const migrated = migrateDraft({ draft: { routeId: 'r', stops: [] } }, 0);
    expect(migrated.draft.isOptimized).toBe(false);
  });

  it('falls back to an empty draft rather than restoring nonsense', () => {
    // Losing an old draft is bad; restoring a broken one into the screen the
    // user works in is worse.
    for (const stored of [null, undefined, { draft: 'not an object' }, {}]) {
      expect(migrateDraft(stored, 0).draft.stops).toEqual([]);
    }
  });

  it('keeps an entry order that was already stored', () => {
    const migrated = migrateDraft(
      {
        draft: {
          routeId: 'route-1',
          stops: [
            {
              id: 'a',
              placeId: 'p-a',
              label: null,
              note: null,
              position: 0,
              entryOrder: 2,
              coordinate: null,
              isCompleted: false,
            },
          ],
          isOptimized: true,
        },
      },
      1,
    );

    expect(migrated.draft.stops[0]?.entryOrder).toBe(2);
    expect(migrated.draft.isOptimized).toBe(true);
  });
});

describe('the optimization result itself', () => {
  const result = {
    tier: 'T1',
    isDegraded: false,
    orderedStopIds: ['b', 'a'],
    legs: [],
    totalDistanceMeters: 12_000,
    totalDurationSeconds: 1800,
    unreachableStopIds: [],
  } as const;

  const withResult = () => {
    const store = newStore();
    for (const id of ['a', 'b']) store.getState().addStopToDraft(stop(id));
    store.getState().applyResult(result);
    return store;
  };

  it('is held so the map has geometry to draw', () => {
    expect(withResult().getState().result).toEqual(result);
  });

  it('is never written to storage', () => {
    // It carries Google-derived geometry, and a client store has no expiry
    // mechanism to hold it under the thirty-day rule (ADR-0007). The server
    // keeps it with a purge job; here it is re-read rather than cached.
    const store = withResult();
    expect(Object.keys(store.getState())).toContain('result');

    const persisted = JSON.stringify(store.persist.getOptions().partialize?.(store.getState()));
    expect(persisted).not.toContain('totalDurationSeconds');
    expect(persisted).toContain('routeId');
  });

  it('is discarded by a hand reorder, which the geometry no longer describes', () => {
    const store = withResult();
    store.getState().moveStopTo(0, 1);

    expect(store.getState().result).toBeNull();
  });

  it('is discarded by removing a stop', () => {
    const store = withResult();
    store.getState().removeStopById('a');

    expect(store.getState().result).toBeNull();
  });

  it('survives a relabel, which changes no order', () => {
    const store = withResult();
    store.getState().setStopLabel('a', 'Warehouse');

    expect(store.getState().result).not.toBeNull();
  });
});
