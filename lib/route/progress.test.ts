import type { Stop } from '@/types';

import {
  emptyProgress,
  hasStarted,
  markStop,
  nextStop,
  pruneToStops,
  stateOf,
  stopsForReoptimization,
  summarise,
  type RouteProgress,
} from './progress';

/**
 * Route progress is the state the user has invested most in — it accumulates
 * across a whole working day of driving, and the app is backgrounded for nearly
 * all of it. Losing it or corrupting it is the failure that ends the
 * relationship, so these tests are about what must never happen rather than about
 * the happy path.
 */

const stop = (id: string, position: number): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  note: null,
  position,
  entryOrder: position,
  coordinate: null,
  isCompleted: false,
});

const route = [stop('a', 0), stop('b', 1), stop('c', 2), stop('d', 3)];

describe('marking stops', () => {
  it('treats an unmarked stop as pending', () => {
    expect(stateOf(emptyProgress('r1'), 'a')).toBe('pending');
  });

  it('does not mutate the progress it was given', () => {
    // A caller holding a stale reference that silently diverges from what was
    // persisted is how progress gets lost without anything appearing to fail.
    const before = emptyProgress('r1');
    const after = markStop(before, 'a', 'completed');
    expect(before.states).toEqual({});
    expect(after.states).toEqual({ a: 'completed' });
  });

  it('is idempotent', () => {
    const once = markStop(emptyProgress('r1'), 'a', 'completed');
    const twice = markStop(once, 'a', 'completed');
    expect(twice.states).toEqual(once.states);
  });

  it('allows undoing a mistaken Done', () => {
    // A user who taps Done by mistake must be able to take it back. Refusing
    // would strand them with a stop marked finished that they never visited.
    const progress = markStop(markStop(emptyProgress('r1'), 'a', 'completed'), 'a', 'pending');
    expect(stateOf(progress, 'a')).toBe('pending');
  });

  it('allows completing a stop that was skipped', () => {
    // Skipping meant "not now". Visiting it later is normal, not an error.
    const progress = markStop(markStop(emptyProgress('r1'), 'a', 'skipped'), 'a', 'completed');
    expect(stateOf(progress, 'a')).toBe('completed');
  });
});

describe('choosing the next stop', () => {
  it('is the first pending stop in order', () => {
    const progress = markStop(emptyProgress('r1'), 'a', 'completed');
    expect(nextStop(progress, route)?.id).toBe('b');
  });

  it('does not route back to a skipped stop', () => {
    // The user chose to pass it. Silently sending them back would override a
    // decision they made deliberately.
    const progress = markStop(emptyProgress('r1'), 'a', 'skipped');
    expect(nextStop(progress, route)?.id).toBe('b');
  });

  it('does not offer an unreachable stop', () => {
    // The engine could not route there, so sending the user is sending them to a
    // known failure.
    const progress = markStop(emptyProgress('r1'), 'a', 'unreachable');
    expect(nextStop(progress, route)?.id).toBe('b');
  });

  it('returns null when everything is settled', () => {
    let progress = emptyProgress('r1');
    for (const s of route) progress = markStop(progress, s.id, 'completed');
    expect(nextStop(progress, route)).toBeNull();
  });

  it('returns null for an empty route rather than throwing', () => {
    expect(nextStop(emptyProgress('r1'), [])).toBeNull();
  });
});

describe('the summary', () => {
  it('counts each state separately', () => {
    let progress = emptyProgress('r1');
    progress = markStop(progress, 'a', 'completed');
    progress = markStop(progress, 'b', 'skipped');
    progress = markStop(progress, 'c', 'unreachable');

    expect(summarise(progress, route)).toEqual({
      total: 4,
      completed: 1,
      skipped: 1,
      unreachable: 1,
      remaining: 1,
      isFinished: false,
    });
  });

  it('counts a fully skipped route as finished', () => {
    // Nothing was delivered, but there is nothing left to do — and the user needs
    // the route to end so they can close it.
    let progress = emptyProgress('r1');
    for (const s of route) progress = markStop(progress, s.id, 'skipped');
    expect(summarise(progress, route).isFinished).toBe(true);
  });

  it('does not call an empty route finished', () => {
    // There was nothing to finish; a completion summary for it would be nonsense.
    expect(summarise(emptyProgress('r1'), []).isFinished).toBe(false);
  });

  it('ignores progress entries for stops not in the route', () => {
    // An orphan must not inflate the counts.
    const progress = markStop(emptyProgress('r1'), 'ghost', 'completed');
    expect(summarise(progress, route).completed).toBe(0);
    expect(summarise(progress, route).remaining).toBe(4);
  });
});

describe('pruning removed stops', () => {
  it('drops orphaned entries', () => {
    // An orphan keeps counting toward the totals and holds isFinished false
    // forever, stranding the user on a route they cannot complete.
    let progress = emptyProgress('r1');
    progress = markStop(progress, 'a', 'completed');
    progress = markStop(progress, 'removed', 'completed');

    expect(pruneToStops(progress, route).states).toEqual({ a: 'completed' });
  });

  it('lets a route finish after the last pending stop is removed', () => {
    let progress = emptyProgress('r1');
    for (const s of route) progress = markStop(progress, s.id, 'completed');
    const shortened = route.slice(0, 3);

    const pruned = pruneToStops(progress, shortened);
    expect(summarise(pruned, shortened).isFinished).toBe(true);
  });

  it('is a no-op when nothing was removed', () => {
    const progress = markStop(emptyProgress('r1'), 'a', 'completed');
    expect(pruneToStops(progress, route)).toEqual(progress);
  });
});

describe('mid-route re-optimization', () => {
  it('excludes completed stops', () => {
    const progress = markStop(emptyProgress('r1'), 'a', 'completed');
    expect(stopsForReoptimization(progress, route).map((s) => s.id)).not.toContain('a');
  });

  it('includes skipped stops, at the end', () => {
    // Skipping meant "not now", and a re-optimization is the natural moment to
    // offer them again — but not ahead of stops the user has not seen yet.
    let progress = emptyProgress('r1');
    progress = markStop(progress, 'a', 'skipped');
    progress = markStop(progress, 'b', 'completed');

    expect(stopsForReoptimization(progress, route).map((s) => s.id)).toEqual(['c', 'd', 'a']);
  });

  it('excludes unreachable stops entirely', () => {
    const progress = markStop(emptyProgress('r1'), 'a', 'unreachable');
    expect(stopsForReoptimization(progress, route).map((s) => s.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('hasStarted', () => {
  it('is false until something is settled', () => {
    // Abandoning untouched work costs the user nothing, so it needs no confirming.
    expect(hasStarted(emptyProgress('r1'))).toBe(false);
  });

  it('is true once any stop is marked, including skipped', () => {
    const progress: RouteProgress = markStop(emptyProgress('r1'), 'a', 'skipped');
    expect(hasStarted(progress)).toBe(true);
  });
});
