import {
  collapse,
  resolve,
  resolveQueue,
  type MutationKind,
  type QueuedMutation,
} from './conflicts';

/**
 * The conflict table of docs/11_STATE_MANAGEMENT.md §8, case by case.
 *
 * The property worth protecting is the asymmetry: exactly one situation reaches
 * the user. Every extra dialog trains people to dismiss dialogs, so a rule that
 * over-asks is not a safe default — it degrades the one question that matters.
 */

const mutation = (kind: MutationKind, overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
  id: overrides.id ?? `m-${Math.random().toString(16).slice(2)}`,
  kind,
  routeId: overrides.routeId ?? 'route-1',
  fields: overrides.fields ?? [],
  occurredAt: overrides.occurredAt ?? '2026-08-07T10:00:00.000Z',
  idempotencyKey: overrides.idempotencyKey ?? 'key-1',
});

describe('the cases that resolve without asking', () => {
  it('applies a local edit when nothing remote touched the route', () => {
    const local = mutation('update-route-fields', { fields: ['name'] });
    expect(resolve(local, [])).toEqual({ kind: 'apply-local' });
  });

  it('applies both when two devices edited different fields', () => {
    // Not a collision at all. Treating it as one would surface a conflict where
    // none exists, which is the failure mode this table is built to avoid.
    const local = mutation('update-route-fields', { fields: ['name'] });
    const remote = mutation('update-route-fields', {
      fields: ['is_round_trip'],
      occurredAt: '2026-08-07T11:00:00.000Z',
    });
    expect(resolve(local, [remote])).toEqual({ kind: 'apply-local' });
  });

  it('discards the older write when the same field collided', () => {
    const local = mutation('update-route-fields', {
      fields: ['name'],
      occurredAt: '2026-08-07T10:00:00.000Z',
    });
    const remote = mutation('update-route-fields', {
      fields: ['name'],
      occurredAt: '2026-08-07T11:00:00.000Z',
    });
    expect(resolve(local, [remote])).toEqual({
      kind: 'discard-local',
      reason: 'superseded-by-newer',
    });
  });

  it('keeps the local write when it is the newer one', () => {
    const local = mutation('update-route-fields', {
      fields: ['name'],
      occurredAt: '2026-08-07T12:00:00.000Z',
    });
    const remote = mutation('update-route-fields', {
      fields: ['name'],
      occurredAt: '2026-08-07T11:00:00.000Z',
    });
    expect(resolve(local, [remote])).toEqual({ kind: 'apply-local' });
  });

  it('keeps the local write on an exact timestamp tie', () => {
    // Two clocks agreeing to the millisecond means they were not really
    // compared. Keeping the user's own work is the better failure: they can see
    // and undo a change that stayed, but cannot recover one that vanished.
    const at = '2026-08-07T10:00:00.000Z';
    const local = mutation('update-route-fields', { fields: ['name'], occurredAt: at });
    const remote = mutation('update-route-fields', { fields: ['name'], occurredAt: at });
    expect(resolve(local, [remote])).toEqual({ kind: 'apply-local' });
  });

  it('lets a delete beat an edit, with a stated reason', () => {
    const local = mutation('update-route-fields', { fields: ['name'] });
    const remote = mutation('delete-route');
    expect(resolve(local, [remote])).toEqual({
      kind: 'discard-local',
      reason: 'route-deleted',
    });
  });

  it('evaluates deletion before anything else', () => {
    // Asking the user to choose an ordering for a route that no longer exists
    // would be absurd, so the delete check has to come first.
    const local = mutation('reorder-stops');
    const remote = [mutation('reorder-stops'), mutation('delete-route')];
    expect(resolve(local, remote)).toEqual({ kind: 'discard-local', reason: 'route-deleted' });
  });

  it('treats two creates as two routes, not a conflict', () => {
    const local = mutation('create-route', { routeId: 'route-a' });
    const remote = mutation('create-route', { routeId: 'route-a' });
    expect(resolve(local, [remote])).toEqual({ kind: 'apply-local' });
  });

  it('ignores mutations belonging to a different route', () => {
    const local = mutation('update-route-fields', { routeId: 'route-1', fields: ['name'] });
    const remote = mutation('delete-route', { routeId: 'route-2' });
    expect(resolve(local, [remote])).toEqual({ kind: 'apply-local' });
  });
});

describe('the one case that reaches the user', () => {
  it('asks when both sides reordered the same route', () => {
    // Both orders are coherent; the difference is the user's intent, and no
    // timestamp rule can recover it.
    const local = mutation('reorder-stops');
    const remote = mutation('reorder-stops', { occurredAt: '2026-08-07T11:00:00.000Z' });
    expect(resolve(local, [remote])).toEqual({ kind: 'ask-user', conflict: 'reorder' });
  });

  it('asks regardless of which reorder is newer', () => {
    // Last-write-wins is exactly the rule that does not apply here: the newer
    // order is not the more correct one.
    const local = mutation('reorder-stops', { occurredAt: '2026-08-07T12:00:00.000Z' });
    const remote = mutation('reorder-stops', { occurredAt: '2026-08-07T09:00:00.000Z' });
    expect(resolve(local, [remote])).toEqual({ kind: 'ask-user', conflict: 'reorder' });
  });

  it('does not ask when only the local side reordered', () => {
    const local = mutation('reorder-stops');
    const remote = mutation('update-route-fields', { fields: ['name'] });
    expect(resolve(local, [remote])).toEqual({ kind: 'apply-local' });
  });

  it('is the only resolution that ever asks', () => {
    // The guard on the asymmetry. Any new kind that starts asking has to fail
    // here first and be justified.
    const kinds: MutationKind[] = [
      'create-route',
      'update-route-fields',
      'delete-route',
      'add-stop',
      'remove-stop',
      'update-stop-fields',
      'mark-stop-state',
    ];
    for (const kind of kinds) {
      const local = mutation(kind, { fields: ['name'] });
      const remote = [
        mutation('update-route-fields', {
          fields: ['name'],
          occurredAt: '2026-08-07T11:00:00.000Z',
        }),
        mutation('reorder-stops'),
      ];
      expect(resolve(local, remote).kind).not.toBe('ask-user');
    }
  });
});

describe('draining the queue', () => {
  it('preserves the order the user acted in', () => {
    // A later edit may depend on an earlier one — removing a stop a previous
    // mutation added. Batching by type would break that.
    const queue = [
      mutation('add-stop', { id: 'a' }),
      mutation('remove-stop', { id: 'b' }),
      mutation('mark-stop-state', { id: 'c' }),
    ];
    expect(resolveQueue(queue, []).map((r) => r.mutation.id)).toEqual(['a', 'b', 'c']);
  });

  it('resolves each entry independently', () => {
    const queue = [
      mutation('update-route-fields', { id: 'stale', fields: ['name'] }),
      mutation('add-stop', { id: 'fine' }),
    ];
    const remote = [
      mutation('update-route-fields', {
        fields: ['name'],
        occurredAt: '2026-08-07T11:00:00.000Z',
      }),
    ];
    const resolved = resolveQueue(queue, remote);
    expect(resolved[0]?.resolution.kind).toBe('discard-local');
    expect(resolved[1]?.resolution.kind).toBe('apply-local');
  });

  it('handles an empty queue', () => {
    expect(resolveQueue([], [])).toEqual([]);
  });
});

describe('collapsing redundant mutations', () => {
  it('keeps only the last edit of the same fields', () => {
    // Five relabellings offline are five queue entries and one server-visible
    // outcome. Draining all five wastes requests, and on a metered endpoint
    // wastes money.
    const queue = [
      mutation('update-stop-fields', { id: '1', fields: ['label'] }),
      mutation('update-stop-fields', { id: '2', fields: ['label'] }),
      mutation('update-stop-fields', { id: '3', fields: ['label'] }),
    ];
    expect(collapse(queue).map((m) => m.id)).toEqual(['3']);
  });

  it('does not collapse edits to different fields', () => {
    const queue = [
      mutation('update-stop-fields', { id: '1', fields: ['label'] }),
      mutation('update-stop-fields', { id: '2', fields: ['note'] }),
    ];
    expect(collapse(queue).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('does not collapse edits to different routes', () => {
    const queue = [
      mutation('update-route-fields', { id: '1', routeId: 'r1', fields: ['name'] }),
      mutation('update-route-fields', { id: '2', routeId: 'r2', fields: ['name'] }),
    ];
    expect(collapse(queue).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('never collapses state changes, because the sequence is the meaning', () => {
    // Completing then skipping a stop is not the same as skipping it, and the
    // intermediate state has already been shown to the user.
    const queue = [
      mutation('mark-stop-state', { id: '1' }),
      mutation('mark-stop-state', { id: '2' }),
    ];
    expect(collapse(queue).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('never collapses adds, removes or reorders', () => {
    const queue = [
      mutation('add-stop', { id: '1' }),
      mutation('add-stop', { id: '2' }),
      mutation('reorder-stops', { id: '3' }),
      mutation('reorder-stops', { id: '4' }),
      mutation('remove-stop', { id: '5' }),
    ];
    expect(collapse(queue)).toHaveLength(5);
  });

  it('preserves order among what survives', () => {
    const queue = [
      mutation('add-stop', { id: 'a' }),
      mutation('update-stop-fields', { id: 'b', fields: ['label'] }),
      mutation('update-stop-fields', { id: 'c', fields: ['label'] }),
      mutation('remove-stop', { id: 'd' }),
    ];
    expect(collapse(queue).map((m) => m.id)).toEqual(['a', 'c', 'd']);
  });
});
