import { createTestDatabase, createUser, type TestDatabase } from './harness';

let database: TestDatabase;
let alice = '';
let bob = '';
let alicePlace = '';
let bobPlace = '';
let aliceRoute = '';

beforeAll(async () => {
  database = await createTestDatabase();
  alice = await createUser(database, 'neutral-alice@example.com');
  bob = await createUser(database, 'neutral-bob@example.com');

  const first = await database.asUser(
    alice,
    `insert into saved_places (user_id, address_text, label, note)
     values ($1, 'Via Roma 10, Milano', 'Lunedì centro', 'Citofono interno')
     returning id`,
    [alice],
  );
  alicePlace = (first.rows[0] as { id: string }).id;

  const second = await database.asUser(
    bob,
    `insert into saved_places (user_id, address_text)
     values ($1, 'Via Torino 4, Milano') returning id`,
    [bob],
  );
  bobPlace = (second.rows[0] as { id: string }).id;

  const route = await database.asUser(
    alice,
    `insert into routes (user_id, name, origin_saved_place_id)
     values ($1, 'Consegne centro', $2) returning id`,
    [alice, alicePlace],
  );
  aliceRoute = (route.rows[0] as { id: string }).id;
}, 60_000);

afterAll(async () => {
  await database.close();
});

describe('provider-neutral private places', () => {
  it('stores user-authored text behind an internal UUID', async () => {
    const result = await database.asUser(
      alice,
      'select id, address_text, label, note from saved_places',
    );
    expect(result.rows).toEqual([
      {
        id: alicePlace,
        address_text: 'Via Roma 10, Milano',
        label: 'Lunedì centro',
        note: 'Citofono interno',
      },
    ]);
  });

  it('does not reveal one user’s address book to another user', async () => {
    const result = await database.asUser(bob, 'select id from saved_places');
    expect(result.rows).toEqual([{ id: bobPlace }]);
  });

  it('rejects private places owned by another user', async () => {
    await expect(
      database.asUser(
        bob,
        `insert into saved_places (user_id, address_text)
         values ($1, 'Not my address')`,
        [alice],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('persists a route stop without any Google place identifier', async () => {
    await database.asUser(
      alice,
      `insert into stops (route_id, saved_place_id, label, entry_order)
       values ($1, $2, 'Prima consegna', 0)`,
      [aliceRoute, alicePlace],
    );

    const result = await database.asUser(
      alice,
      'select place_id, saved_place_id, label from stops where route_id = $1',
      [aliceRoute],
    );
    expect(result.rows).toEqual([
      { place_id: null, saved_place_id: alicePlace, label: 'Prima consegna' },
    ]);
  });

  it('rejects stops referencing another user’s private place', async () => {
    await expect(
      database.asUser(
        alice,
        `insert into stops (route_id, saved_place_id, entry_order)
         values ($1, $2, 1)`,
        [aliceRoute, bobPlace],
      ),
    ).rejects.toThrow(/saved place must belong to the route owner/i);
  });

  it('rejects a route origin owned by another user', async () => {
    await expect(
      database.asUser(
        alice,
        `insert into routes (user_id, origin_saved_place_id)
         values ($1, $2)`,
        [alice, bobPlace],
      ),
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it('accepts provider-neutral favourites once per private address', async () => {
    await database.asUser(
      alice,
      `insert into favourites (user_id, saved_place_id, label)
       values ($1, $2, 'Casa cliente')`,
      [alice, alicePlace],
    );

    await expect(
      database.asUser(
        alice,
        'insert into favourites (user_id, saved_place_id) values ($1, $2)',
        [alice, alicePlace],
      ),
    ).rejects.toThrow(/duplicate key/i);
  });
});

describe('HERE provider material remains server-written and short-lived', () => {
  it('lets only the owner read HERE coordinates', async () => {
    await database.asService(
      `insert into saved_place_coordinates
       (saved_place_id, provider, provider_place_id, provider_formatted_address,
        provider_raw_payload, lat, lng, provider_fetched_at, provider_expires_at)
       values ($1, 'here', 'here:milano:1', 'Via Roma 10, Milano',
               '{"source":"here"}', 45.4642, 9.19, now(), now() + interval '30 days')`,
      [alicePlace],
    );

    expect(
      (await database.asUser(alice, 'select saved_place_id from saved_place_coordinates')).rows,
    ).toEqual([{ saved_place_id: alicePlace }]);
    expect(
      (await database.asUser(bob, 'select saved_place_id from saved_place_coordinates')).rows,
    ).toEqual([]);
  });

  it('never grants the mobile client write access to HERE material', async () => {
    for (const privilege of ['insert', 'update', 'delete']) {
      const result = await database.asService(
        `select has_table_privilege('authenticated', $1, $2) as allowed`,
        ['public.saved_place_coordinates', privilege],
      );
      expect((result.rows[0] as { allowed: boolean }).allowed).toBe(false);
    }
  });

  it('rejects a retention window longer than thirty days', async () => {
    await expect(
      database.asService(
        `insert into saved_place_coordinates
         (saved_place_id, provider, lat, lng, provider_fetched_at, provider_expires_at)
         values ($1, 'here', 45.0, 9.0, now(), now() + interval '31 days')`,
        [bobPlace],
      ),
    ).rejects.toThrow(/saved_place_coordinates_ttl/i);
  });

  it('purges every HERE-derived field while preserving the user’s address', async () => {
    await database.asService(
      `update saved_place_coordinates
          set provider_fetched_at = now() - interval '31 days',
              provider_expires_at = now() - interval '1 day'
        where saved_place_id = $1`,
      [alicePlace],
    );

    const result = await database.asService('select purge_expired_coordinates() as count');
    expect((result.rows[0] as { count: number }).count).toBeGreaterThan(0);

    const cached = await database.asUser(
      alice,
      `select provider_place_id, provider_formatted_address, provider_raw_payload,
              lat, lng, provider_fetched_at, provider_expires_at
         from saved_place_coordinates where saved_place_id = $1`,
      [alicePlace],
    );
    expect(cached.rows[0]).toEqual({
      provider_place_id: null,
      provider_formatted_address: null,
      provider_raw_payload: null,
      lat: null,
      lng: null,
      provider_fetched_at: null,
      provider_expires_at: null,
    });

    const saved = await database.asUser(
      alice,
      'select address_text, label, note from saved_places where id = $1',
      [alicePlace],
    );
    expect(saved.rows[0]).toEqual({
      address_text: 'Via Roma 10, Milano',
      label: 'Lunedì centro',
      note: 'Citofono interno',
    });
  });

  it('removes expired route geometry without deleting itinerary membership', async () => {
    await database.asService(
      `update routes
          set optimized_at = now() - interval '31 days',
              polyline = 'provider-polyline',
              eta = now(),
              total_distance_m = 1200,
              total_duration_s = 300
        where id = $1`,
      [aliceRoute],
    );
    await database.asService(
      `update stops set leg_distance_m = 1200, leg_duration_s = 300
        where route_id = $1`,
      [aliceRoute],
    );

    await database.asService('select purge_expired_coordinates()');

    const route = await database.asUser(
      alice,
      `select name, polyline, eta, total_distance_m, total_duration_s
         from routes where id = $1`,
      [aliceRoute],
    );
    expect(route.rows[0]).toEqual({
      name: 'Consegne centro',
      polyline: null,
      eta: null,
      total_distance_m: null,
      total_duration_s: null,
    });

    const stop = await database.asUser(
      alice,
      `select saved_place_id, label, leg_distance_m, leg_duration_s
         from stops where route_id = $1`,
      [aliceRoute],
    );
    expect(stop.rows[0]).toEqual({
      saved_place_id: alicePlace,
      label: 'Prima consegna',
      leg_distance_m: null,
      leg_duration_s: null,
    });
  });

  it('keeps the existing purge observable and idempotent', async () => {
    await database.asService('select purge_expired_coordinates()');
    const next = await database.asService('select purge_expired_coordinates() as count');
    expect((next.rows[0] as { count: number }).count).toBe(0);

    const status = await database.asService('select coordinate_purge_healthy() as healthy');
    expect((status.rows[0] as { healthy: boolean }).healthy).toBe(true);
  });
});
