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
  placeText: null,
  note: null,
  position,
  entryOrder: position,
  coordinate: null,
});

const write = () =>
  toRows({ ...emptyDraft('route-1'), stops: [stop('a', 0), stop('b', 1)] }, 'user-1', {
    status: 'draft',
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
  const selects: { table: string; query: { columns: string } & Record<string, unknown> }[] = [];
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
    stops: [
      {
        place_id: 'ChIJa',
        entry_order: 0,
        optimized_order: 0,
        places_cache: { formatted_address: 'Corso Francia 12, 10138 Torino TO, Italia' },
      },
      {
        place_id: 'ChIJb',
        entry_order: 1,
        optimized_order: 1,
        places_cache: { formatted_address: 'Via Meucci 3, 10098 Rivoli TO, Italia' },
      },
    ],
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

  it('reads three columns per stop, not the whole row', async () => {
    // Loading every stop of every route in full would make opening History cost
    // more than opening a route — the reason this used to be a bare count. Three
    // small columns is a different proposition, and it is what turns a row that
    // could be any Tuesday into one that names its own day.
    const { port, selects } = portWith({ selectData: [summaryRow()] });
    await createRoutesProvider(port).list(20);

    const columns = String(selects[0]?.query.columns);
    expect(columns).toContain('stops(place_id,entry_order,optimized_order');
    expect(columns).not.toContain('label');
    expect(columns).not.toContain('leg_distance_m');
  });

  it('takes the endpoints’ addresses off our own cache, buying nothing', async () => {
    // Through the foreign key `stops.place_id` already has to `places_cache`, on
    // the same query. No upstream call and no unit of quota — the address book
    // reads it the same way.
    const { port, selects } = portWith({ selectData: [summaryRow()] });
    const summaries = await createRoutesProvider(port).list(20);

    expect(String(selects[0]?.query.columns)).toContain('places_cache(formatted_address)');
    expect(summaries?.[0]?.stops[0]?.address).toBe('Corso Francia 12, 10138 Torino TO, Italia');
    expect(summaries?.[0]?.stopCount).toBe(2);
    expect(selects).toHaveLength(1);
  });

  it('accepts a route whose addresses the purge has taken', async () => {
    // `places_cache` is nulled at thirty days and the embed comes back null with
    // it (ADR-0007). That is the ordinary state of an old route, and refusing to
    // parse it would empty a driver's History on its thirty-first day.
    const { port } = portWith({
      selectData: [
        summaryRow({
          stops: [{ place_id: 'ChIJa', entry_order: 0, optimized_order: null, places_cache: null }],
        }),
      ],
    });

    const summaries = await createRoutesProvider(port).list(20);
    expect(summaries?.[0]?.stops[0]?.address).toBeNull();
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
    placeText: null,
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
      [{ ...routeRow({ status: 'in_progress' }), updated_at: '2026-08-11T05:15:00.000Z' }],
      [stopRow({ state: 'pending' })],
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
    expect(loaded?.progress).toEqual({
      routeId: 'route-1',
      startedAt: '2026-08-11T05:15:00.000Z',
    });
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
