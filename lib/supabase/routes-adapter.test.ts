import { createRoutesProvider, type RoutesPort } from './routes-adapter';
import { toRows } from '@/lib/route/persistence';
import { emptyDraft } from '@/lib/route/draft';
import type { Stop } from '@/types';

/**
 * The adapter is a boundary, so these tests are about what happens when the
 * other side of it misbehaves: a shape nobody expected, a policy refusal, a
 * foreign key, no radio at all. Each of those has a different thing to say to a
 * driver, and a single "something went wrong" would be four failures wearing one
 * costume.
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

const write = () =>
  toRows({ ...emptyDraft('route-1'), stops: [stop('a', 0), stop('b', 1)] }, 'user-1', {
    status: 'draft',
    progress: null,
    totals: null,
  });

interface Call {
  readonly table: string;
  readonly rows?: readonly object[];
}

const portWith = (
  overrides: Partial<{
    upsertError: { message: string } | null;
    selectData: unknown;
    selectError: { message: string } | null;
    updateError: { message: string } | null;
  }> = {},
) => {
  const calls: Call[] = [];
  const selects: { table: string; query: unknown }[] = [];
  const updates: Record<string, unknown>[] = [];

  const port: RoutesPort = {
    upsert: async (table, rows) => {
      calls.push({ table, rows });
      return { error: overrides.upsertError ?? null };
    },
    select: async (table, query) => {
      selects.push({ table, query });
      return { data: overrides.selectData ?? [], error: overrides.selectError ?? null };
    },
    update: async (_table, values) => {
      updates.push({ ...values });
      return { error: overrides.updateError ?? null };
    },
    deleteRows: async (table) => {
      calls.push({ table });
      return { error: null };
    },
  };

  return { port, calls, selects, updates };
};

describe('saving', () => {
  it('writes the route before its stops', async () => {
    // `stops.route_id` references `routes`, so the other order fails the foreign
    // key on a route that is about to exist.
    const { port, calls } = portWith();
    await createRoutesProvider(port).save(write());

    expect(calls.map((call) => call.table)).toEqual(['routes', 'stops', 'stops']);
  });

  it('clears the old stops before writing the new ones', async () => {
    // Otherwise a route that loses a stop keeps it: the upsert writes the ones
    // that are there and says nothing about the one that is not.
    const { port, calls } = portWith();
    await createRoutesProvider(port).save(write());

    const stopCalls = calls.filter((call) => call.table === 'stops');
    expect(stopCalls[0]?.rows).toBeUndefined();
    expect(stopCalls[1]?.rows).toHaveLength(2);
  });

  it('does not write an empty stop list as a row', async () => {
    const { port, calls } = portWith();
    const empty = toRows(emptyDraft('route-1'), 'user-1', {
      status: 'draft',
      progress: null,
      totals: null,
    });

    await createRoutesProvider(port).save(empty);
    expect(calls.filter((call) => call.rows !== undefined)).toHaveLength(1);
  });

  it('names a missing place rather than reporting a generic failure', async () => {
    // The stop's place_id has no row in the shared cache yet. That is
    // recoverable — opening the route resolves it — and the message the user
    // gets has to be different from "saving failed".
    const { port } = portWith({
      upsertError: { message: 'insert violates foreign key constraint "stops_place_id_fkey"' },
    });

    const outcome = await createRoutesProvider(port).save(write());
    expect(outcome).toEqual({ ok: false, failure: { kind: 'unknown-place' } });
  });

  it('names a policy refusal, which is not the same as a bug', async () => {
    const { port } = portWith({
      upsertError: { message: 'new row violates row-level security policy for table "routes"' },
    });

    const outcome = await createRoutesProvider(port).save(write());
    expect(outcome).toEqual({ ok: false, failure: { kind: 'not-permitted' } });
  });

  it('names being offline, where the next action is to do nothing', async () => {
    const { port } = portWith({ upsertError: { message: 'Network request failed' } });

    const outcome = await createRoutesProvider(port).save(write());
    expect(outcome).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});

describe('listing', () => {
  const summaryRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'route-1',
    user_id: 'user-1',
    name: null,
    status: 'completed',
    is_round_trip: false,
    origin_place_id: null,
    origin_is_current_location: true,
    optimized_at: null,
    optimization_tier: 'T1',
    is_degraded: false,
    total_distance_m: 42_000,
    total_duration_s: 3_600,
    updated_at: '2026-08-04T09:30:00.000Z',
    stops: [{ count: 12 }],
    ...overrides,
  });

  it('excludes soft-deleted routes', async () => {
    // The row survives so a delete performed offline stays reconcilable, but it
    // is gone from the user's point of view.
    const { port, selects } = portWith({ selectData: [summaryRow()] });
    await createRoutesProvider(port).list(20);

    expect(selects[0]?.query).toMatchObject({ isNull: 'deleted_at' });
  });

  it('orders newest first', async () => {
    const { port, selects } = portWith({ selectData: [summaryRow()] });
    await createRoutesProvider(port).list(20);

    expect(selects[0]?.query).toMatchObject({ order: { column: 'updated_at', ascending: false } });
  });

  it('reads the stop count without reading the stops', async () => {
    // Loading every stop of every route to show a count would make opening
    // History cost more than opening a route.
    const { port } = portWith({ selectData: [summaryRow()] });
    const summaries = await createRoutesProvider(port).list(20);

    expect(summaries?.[0]?.stopCount).toBe(12);
  });

  it('reports an unreadable answer as unreadable, not as an empty history', async () => {
    // "You have never saved a route" is a lie a user cannot argue with. Null
    // becomes an error state with a retry.
    const { port } = portWith({ selectData: [{ id: 'route-1' }] });
    expect(await createRoutesProvider(port).list(20)).toBeNull();
  });

  it('reports a query failure the same way', async () => {
    const { port } = portWith({ selectError: { message: 'nope' } });
    expect(await createRoutesProvider(port).list(20)).toBeNull();
  });
});

describe('loading', () => {
  const routeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'route-1',
    user_id: 'user-1',
    name: null,
    status: 'optimized',
    is_round_trip: false,
    origin_place_id: null,
    origin_is_current_location: true,
    optimized_at: '2026-08-04T09:00:00.000Z',
    optimization_tier: 'T1',
    is_degraded: false,
    total_distance_m: 42_000,
    total_duration_s: 3_600,
    ...overrides,
  });

  const stopRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'stop-a',
    route_id: 'route-1',
    place_id: 'place-a',
    label: null,
    note: null,
    entry_order: 0,
    optimized_order: 0,
    state: 'pending',
    leg_distance_m: null,
    leg_duration_s: null,
    ...overrides,
  });

  it('returns null for a route that is not the caller’s', async () => {
    // RLS already returned nothing. This turns nothing into a state the screen
    // can show, rather than an empty route the user did not open.
    const { port } = portWith({ selectData: [] });
    expect(await createRoutesProvider(port).load('route-1')).toBeNull();
  });

  it('rebuilds the draft, its status and its progress together', async () => {
    const responses: unknown[] = [
      [routeRow({ status: 'in_progress' })],
      [stopRow({ state: 'completed' })],
    ];
    let index = 0;

    const port: RoutesPort = {
      upsert: async () => ({ error: null }),
      select: async () => ({ data: responses[index++] ?? [], error: null }),
      update: async () => ({ error: null }),
      deleteRows: async () => ({ error: null }),
    };

    const loaded = await createRoutesProvider(port).load('route-1');
    expect(loaded?.status).toBe('in_progress');
    expect(loaded?.draft.stops).toHaveLength(1);
    // Restored together, or the user lands on the right screen with the wrong
    // contents — which reads as data loss.
    expect(loaded?.progress?.states).toEqual({ 'stop-a': 'completed' });
  });
});

describe('advancing the lifecycle', () => {
  it('refuses an illegal transition without writing', async () => {
    // An enum column accepts any of its values, so the database has no
    // constraint for this. The state machine is only real if something enforces
    // it.
    const { port, updates } = portWith();
    const outcome = await createRoutesProvider(port).advance('route-1', 'completed', 'draft');

    expect(outcome).toEqual({
      ok: false,
      failure: { kind: 'illegal-transition', from: 'completed', to: 'draft' },
    });
    expect(updates).toHaveLength(0);
  });

  it('stamps the completion once, when the route finishes', async () => {
    const { port, updates } = portWith();
    await createRoutesProvider(port).advance('route-1', 'in_progress', 'completed');

    expect(updates[0]).toMatchObject({ status: 'completed' });
    expect(updates[0]?.['completed_at']).toEqual(expect.any(String));
  });

  it('does not stamp a completion on any other transition', async () => {
    const { port, updates } = portWith();
    await createRoutesProvider(port).advance('route-1', 'draft', 'optimized');

    expect(updates[0]?.['completed_at']).toBeUndefined();
  });
});
