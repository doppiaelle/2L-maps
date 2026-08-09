import { MAX_STOPS, MIN_STOPS, type Stop } from '@/types';

import {
  addStop,
  applyOptimizedOrder,
  emptyDraft,
  labelStop,
  moveStop,
  readiness,
  remainingCapacity,
  removeStop,
  restoreStop,
  setShape,
  wasAlreadyOptimal,
} from './draft';

/**
 * The draft route is the user's unsaved work. These tests are mostly about two
 * things it must never do: lose a stop, and keep claiming a result that no longer
 * describes the order on screen.
 */

const stop = (id: string, placeId = `place-${id}`): Stop => ({
  id,
  placeId,
  label: null,
  note: null,
  position: 0,
  entryOrder: 0,
  coordinate: null,
  isCompleted: false,
});

const draftWith = (ids: string[]) =>
  ids.reduce((draft, id) => {
    const result = addStop(draft, stop(id));
    if (!result.ok) throw new Error('fixture exceeded the cap');
    return result.draft;
  }, emptyDraft('r1'));

const ids = (draft: { stops: readonly Stop[] }) => draft.stops.map((s) => s.id);

describe('adding stops', () => {
  it('appends and numbers positions from zero', () => {
    const draft = draftWith(['a', 'b', 'c']);
    expect(ids(draft)).toEqual(['a', 'b', 'c']);
    expect(draft.stops.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('allows the same address twice', () => {
    // A morning delivery and an afternoon collection at one address is a real
    // working day, and the schema carries no unique constraint either.
    const first = addStop(emptyDraft('r1'), stop('a', 'depot'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addStop(first.draft, stop('b', 'depot'));
    expect(second.ok).toBe(true);
  });

  it('refuses at the maximum rather than silently truncating', () => {
    const full = draftWith(Array.from({ length: MAX_STOPS }, (_, i) => `s${i}`));
    expect(remainingCapacity(full)).toBe(0);
    expect(addStop(full, stop('one-too-many'))).toEqual({ ok: false, refusal: 'at-maximum' });
  });

  it('reports the remaining capacity so the limit can be stated in advance', () => {
    expect(remainingCapacity(emptyDraft('r1'))).toBe(MAX_STOPS);
    expect(remainingCapacity(draftWith(['a', 'b']))).toBe(MAX_STOPS - 2);
  });
});

describe('removing and undoing', () => {
  it('returns the removed stop and its index, so undo can restore it in place', () => {
    // A destructive action is undoable rather than confirmed, and undo needs the
    // position back — otherwise the stop reappears at the end of the list.
    const draft = draftWith(['a', 'b', 'c']);
    const result = removeStop(draft, 'b');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removed.id).toBe('b');
    expect(result.atIndex).toBe(1);
    expect(ids(result.draft)).toEqual(['a', 'c']);
  });

  it('restores a stop exactly where it was', () => {
    const draft = draftWith(['a', 'b', 'c']);
    const removed = removeStop(draft, 'b');
    if (!removed.ok) throw new Error('unreachable');

    const restored = restoreStop(removed.draft, removed.removed, removed.atIndex);
    expect(ids(restored)).toEqual(['a', 'b', 'c']);
    expect(restored.stops.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('clamps a restore index past the end rather than dropping the stop', () => {
    const draft = draftWith(['a']);
    const restored = restoreStop(draft, stop('z'), 99);
    expect(ids(restored)).toEqual(['a', 'z']);
  });

  it('reports a missing stop rather than silently doing nothing', () => {
    expect(removeStop(draftWith(['a']), 'ghost')).toEqual({ ok: false, refusal: 'not-found' });
  });
});

describe('reordering by hand', () => {
  it('moves a stop and renumbers', () => {
    const result = moveStop(draftWith(['a', 'b', 'c']), 2, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.draft)).toEqual(['c', 'a', 'b']);
    expect(result.draft.stops.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('clamps a drag that ends past the list', () => {
    // Refusing would drop the stop back where it started, which reads as the
    // gesture having failed rather than as a limit.
    const result = moveStop(draftWith(['a', 'b', 'c']), 0, 99);
    expect(result.ok && ids(result.draft)).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op when the position does not change', () => {
    const result = moveStop(draftWith(['a', 'b']), 0, 0);
    expect(result.ok && ids(result.draft)).toEqual(['a', 'b']);
  });

  it('reports an out-of-range source', () => {
    expect(moveStop(draftWith(['a']), 5, 0)).toEqual({ ok: false, refusal: 'not-found' });
  });
});

describe('the degraded label follows the order it described', () => {
  const degraded = () => applyOptimizedOrder(draftWith(['a', 'b', 'c']), ['c', 'b', 'a'], true);

  it('is set when a T0 result is applied', () => {
    expect(degraded().isDegraded).toBe(true);
  });

  it('clears when the user reorders by hand', () => {
    // The label described an order that no longer exists. Leaving it would tell
    // the user their own arrangement was computed without traffic data.
    const result = moveStop(degraded(), 0, 2);
    expect(result.ok && result.draft.isDegraded).toBe(false);
  });

  it('clears when a stop is added or removed', () => {
    const added = addStop(degraded(), stop('d'));
    expect(added.ok && added.draft.isDegraded).toBe(false);

    const removed = removeStop(degraded(), 'a');
    expect(removed.ok && removed.draft.isDegraded).toBe(false);
  });

  it('clears when the route shape is toggled', () => {
    // The optimal order genuinely differs between round trip and one way.
    expect(setShape(degraded(), 'round-trip').isDegraded).toBe(false);
  });

  it('survives a relabel, which does not change the order', () => {
    const result = labelStop(degraded(), 'a', 'Farmacia');
    expect(result.ok && result.draft.isDegraded).toBe(true);
  });
});

describe('applying an optimization result', () => {
  it('reorders the stops it names', () => {
    const draft = applyOptimizedOrder(draftWith(['a', 'b', 'c']), ['c', 'a', 'b'], false);
    expect(ids(draft)).toEqual(['c', 'a', 'b']);
  });

  it('appends any stop the result omitted rather than losing it', () => {
    // A short list from the server must not silently drop the user's stop.
    const draft = applyOptimizedOrder(draftWith(['a', 'b', 'c']), ['c'], false);
    expect(ids(draft)).toEqual(['c', 'a', 'b']);
    expect(draft.stops).toHaveLength(3);
  });

  it('ignores an id the draft does not contain rather than fabricating a stop', () => {
    const draft = applyOptimizedOrder(draftWith(['a', 'b']), ['b', 'ghost', 'a'], false);
    expect(ids(draft)).toEqual(['b', 'a']);
  });

  it('ignores a repeated id rather than duplicating the stop', () => {
    const draft = applyOptimizedOrder(draftWith(['a', 'b']), ['a', 'a', 'b'], false);
    expect(ids(draft)).toEqual(['a', 'b']);
  });

  it('renumbers positions to match the new order', () => {
    const draft = applyOptimizedOrder(draftWith(['a', 'b', 'c']), ['c', 'b', 'a'], false);
    expect(draft.stops.map((s) => s.position)).toEqual([0, 1, 2]);
  });
});

describe('readiness to optimize', () => {
  it('needs at least the documented minimum', () => {
    expect(readiness(emptyDraft('r1'))).toEqual({
      canOptimize: false,
      reason: 'too-few-stops',
    });
    expect(readiness(draftWith(Array.from({ length: MIN_STOPS }, (_, i) => `s${i}`)))).toEqual({
      canOptimize: true,
    });
  });

  it('is satisfied at exactly the maximum', () => {
    const full = draftWith(Array.from({ length: MAX_STOPS }, (_, i) => `s${i}`));
    expect(readiness(full)).toEqual({ canOptimize: true });
  });
});

describe('immutability', () => {
  it('never mutates the draft it was given', () => {
    // A caller holding a stale reference that diverges from what was persisted is
    // how unsaved work disappears without anything appearing to fail.
    const before = draftWith(['a', 'b']);
    const snapshot = ids(before);

    addStop(before, stop('c'));
    removeStop(before, 'a');
    moveStop(before, 0, 1);
    applyOptimizedOrder(before, ['b', 'a'], true);
    setShape(before, 'round-trip');

    expect(ids(before)).toEqual(snapshot);
    expect(before.isDegraded).toBe(false);
  });
});

describe('an order the optimizer left alone', () => {
  const withStops = (count: number) => {
    let draft = emptyDraft('route-1');
    for (let i = 0; i < count; i += 1) {
      const result = addStop(draft, stop(`s${i}`));
      if (!result.ok) throw new Error('expected the stop to be added');
      draft = result.draft;
    }
    return draft;
  };

  it('is not claimed before any optimization has happened', () => {
    // "Already the fastest order" is an answer. Saying it about an order nobody
    // has checked would be a claim we cannot support.
    expect(wasAlreadyOptimal(withStops(3))).toBe(false);
  });

  it('is reported when the result returns the same order', () => {
    // A real and common outcome, and the user paid for it — so it is an answer,
    // not the absence of one (docs/08_SCREEN_SPECIFICATIONS.md §7).
    const applied = applyOptimizedOrder(withStops(3), ['s0', 's1', 's2'], false);
    expect(applied.isOptimized).toBe(true);
    expect(wasAlreadyOptimal(applied)).toBe(true);
  });

  it('is not reported when the result reorders anything', () => {
    const applied = applyOptimizedOrder(withStops(3), ['s2', 's0', 's1'], false);
    expect(wasAlreadyOptimal(applied)).toBe(false);
  });

  it('keeps the entry order through an optimization', () => {
    // It is what the current order is measured against; renumbering it would
    // make every order look original.
    const applied = applyOptimizedOrder(withStops(3), ['s2', 's0', 's1'], false);
    const entryOrders = applied.stops.map((s) => `${s.id}:${s.entryOrder}`);
    expect(entryOrders).toEqual(['s2:2', 's0:0', 's1:1']);
  });
});

describe('what a hand edit does to an optimization', () => {
  const optimized = () => {
    let draft = emptyDraft('route-1');
    for (const id of ['a', 'b', 'c']) {
      const result = addStop(draft, stop(id));
      if (!result.ok) throw new Error('expected the stop to be added');
      draft = result.draft;
    }
    return applyOptimizedOrder(draft, ['c', 'a', 'b'], false);
  };

  it('is discarded by adding a stop', () => {
    // The optimizer's answer described a route that no longer exists.
    const result = addStop(optimized(), stop('d'));
    expect(result.ok && result.draft.isOptimized).toBe(false);
  });

  it('is discarded by removing one', () => {
    const result = removeStop(optimized(), 'a');
    expect(result.ok && result.draft.isOptimized).toBe(false);
  });

  it('is discarded by a hand reorder', () => {
    const result = moveStop(optimized(), 0, 2);
    expect(result.ok && result.draft.isOptimized).toBe(false);
  });

  it('survives a relabel, which changes no order', () => {
    const result = labelStop(optimized(), 'a', 'Warehouse');
    expect(result.ok && result.draft.isOptimized).toBe(true);
  });
});

describe('entry order after a removal', () => {
  it('never gives two stops the same entry position', () => {
    // Derived from the highest so far rather than from the length, so removing
    // a stop and adding another cannot collide.
    let draft = emptyDraft('route-1');
    for (const id of ['a', 'b']) {
      const added = addStop(draft, stop(id));
      if (!added.ok) throw new Error('expected the stop to be added');
      draft = added.draft;
    }
    const removed = removeStop(draft, 'a');
    if (!removed.ok) throw new Error('expected the stop to be removed');

    const added = addStop(removed.draft, stop('c'));
    if (!added.ok) throw new Error('expected the stop to be added');

    const orders = added.draft.stops.map((s) => s.entryOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
