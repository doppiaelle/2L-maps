import { COORDINATE_MAX_AGE_DAYS } from '@/types';

import { createTestDatabase, createUser, migrationFiles, type TestDatabase } from './harness';

/**
 * The migrations are executed here, not merely reviewed.
 *
 * "RLS is on for every table, with no exceptions. A table without a policy is
 * unreachable by design, not by accident" (CLAUDE.md §9 rule 3) is the kind of
 * claim that is easy to write and easy to be wrong about — a single forgotten
 * `enable row level security` leaves a table world-readable and nothing complains.
 * These tests make that failure loud.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await database.close();
});

describe('the migrations apply', () => {
  it('has migrations to run', () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it('creates every table the specification lists', async () => {
    const result = await database.asService(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    const tables = (result.rows as { tablename: string }[]).map((r) => r.tablename);

    expect(tables).toEqual(
      expect.arrayContaining([
        'favourites',
        'optimization_cache',
        'optimization_jobs',
        'places_cache',
        'routes',
        'stops',
        'usage_events',
        'user_entitlements',
      ]),
    );
  });

  it('leaves coordinate columns nullable, which is the whole durability boundary', async () => {
    // A NOT NULL here would make the purge impossible and turn ADR-0007 into a
    // rule the schema actively prevents from being followed.
    const result = await database.asService(
      `select column_name, is_nullable
         from information_schema.columns
        where table_name = 'places_cache'
          and column_name in ('lat', 'lng', 'formatted_address', 'coords_refreshed_at')
        order by column_name`,
    );
    for (const row of result.rows as { column_name: string; is_nullable: string }[]) {
      expect(row.is_nullable).toBe('YES');
    }
  });

  it('allows the same place twice in one route', async () => {
    // A morning delivery and an afternoon collection at the same address is
    // legitimate, so no unique constraint may exist on (route_id, place_id).
    const result = await database.asService(
      `select indexdef from pg_indexes where tablename = 'stops'`,
    );
    const defs = (result.rows as { indexdef: string }[]).map((r) => r.indexdef);
    const uniqueOnPlace = defs.filter(
      (d) => d.includes('UNIQUE') && d.includes('route_id') && d.includes('place_id'),
    );
    expect(uniqueOnPlace).toEqual([]);
  });
});

describe('row-level security is enabled everywhere', () => {
  it('leaves no table in public without RLS', async () => {
    const result = await database.asService(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and not c.relrowsecurity
        order by c.relname`,
    );
    expect((result.rows as { relname: string }[]).map((r) => r.relname)).toEqual([]);
  });

  it('gives the client no write path to entitlements', async () => {
    // Granting itself entitlement is the single most valuable thing an attacker
    // could do, so `authenticated` must have no insert, update or delete policy
    // (ADR-0011).
    const result = await database.asService(
      `select cmd from pg_policies
        where schemaname = 'public' and tablename = 'user_entitlements'`,
    );
    const commands = (result.rows as { cmd: string }[]).map((r) => r.cmd);
    expect(commands).toEqual(['SELECT']);
  });

  it('gives the client no write path to usage events', async () => {
    // A writable usage table makes the quota advisory.
    const result = await database.asService(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'usage_events'`,
    );
    expect((result.rows as { cmd: string }[]).map((r) => r.cmd)).toEqual(['SELECT']);
  });

  it('makes the shared optimization cache unreachable from the client', async () => {
    // RLS on with no policy at all: the table is unreachable by design.
    const result = await database.asService(
      `select count(*)::int as n from pg_policies
        where schemaname = 'public' and tablename = 'optimization_cache'`,
    );
    expect((result.rows[0] as { n: number }).n).toBe(0);
  });
});

describe('client grants match the RLS surface', () => {
  const tableAllowed = async (table: string, privilege: string) => {
    const result = await database.asService(
      `select has_table_privilege('authenticated', $1, $2) as allowed`,
      [`public.${table}`, privilege],
    );
    return (result.rows[0] as { allowed: boolean }).allowed;
  };

  const functionAllowed = async (signature: string, privilege: string) => {
    const result = await database.asService(
      `select has_function_privilege('authenticated', $1, $2) as allowed`,
      [`public.${signature}`, privilege],
    );
    return (result.rows[0] as { allowed: boolean }).allowed;
  };

  it('lets PostgREST enter the public schema', async () => {
    const result = await database.asService(
      `select has_schema_privilege('authenticated', 'public', 'usage') as allowed`,
    );
    expect((result.rows[0] as { allowed: boolean }).allowed).toBe(true);
  });

  it('grants full access only to personal route data and favourites', async () => {
    for (const table of ['routes', 'stops', 'favourites']) {
      for (const privilege of ['select', 'insert', 'update', 'delete']) {
        expect(await tableAllowed(table, privilege)).toBe(true);
      }
    }
  });

  it('keeps shared and accounting tables read-only or unreachable', async () => {
    expect(await tableAllowed('places_cache', 'select')).toBe(true);
    for (const privilege of ['insert', 'update', 'delete']) {
      expect(await tableAllowed('places_cache', privilege)).toBe(false);
    }

    for (const table of ['user_entitlements', 'usage_events', 'optimization_jobs']) {
      expect(await tableAllowed(table, 'select')).toBe(true);
      for (const privilege of ['insert', 'update', 'delete']) {
        expect(await tableAllowed(table, privilege)).toBe(false);
      }
    }

    for (const privilege of ['select', 'insert', 'update', 'delete']) {
      expect(await tableAllowed('optimization_cache', privilege)).toBe(false);
    }
  });

  it('lets the client call the address-book RPC', async () => {
    expect(await functionAllowed('record_place_use(text)', 'execute')).toBe(true);
  });
});

describe('RLS holds between two real users', () => {
  let alice = '';
  let bob = '';
  let aliceRoute = '';

  beforeAll(async () => {
    alice = await createUser(database, 'alice@example.com');
    bob = await createUser(database, 'bob@example.com');

    await database.asService(
      `insert into places_cache (place_id, formatted_address, lat, lng, coords_refreshed_at)
       values ('place-milan', 'Piazza del Duomo, Milano', 45.4642, 9.19, now())`,
    );

    const inserted = await database.asUser(
      alice,
      `insert into routes (user_id, name) values ($1, 'Alice morning round') returning id`,
      [alice],
    );
    aliceRoute = (inserted.rows[0] as { id: string }).id;

    await database.asUser(
      alice,
      `insert into stops (route_id, place_id, entry_order) values ($1, 'place-milan', 0)`,
      [aliceRoute],
    );
  });

  it('lets a user read their own route', async () => {
    const result = await database.asUser(alice, 'select id from routes');
    expect(result.rows).toHaveLength(1);
  });

  it('returns nothing rather than another user’s route', async () => {
    // Empty, not an error. A query returning nothing is debuggable; a query
    // returning someone else's rows is a breach.
    const result = await database.asUser(bob, 'select id from routes');
    expect(result.rows).toEqual([]);
  });

  it('hides stops belonging to another user, through the parent route', async () => {
    // `stops` has no user_id of its own, so this proves the inherited policy
    // actually works rather than silently passing everything.
    expect((await database.asUser(alice, 'select id from stops')).rows).toHaveLength(1);
    expect((await database.asUser(bob, 'select id from stops')).rows).toEqual([]);
  });

  it('refuses to let a user insert a route owned by someone else', async () => {
    await expect(
      database.asUser(bob, `insert into routes (user_id, name) values ($1, 'stolen')`, [alice]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses to let a user add a stop to a route they do not own', async () => {
    await expect(
      database.asUser(
        bob,
        `insert into stops (route_id, place_id, entry_order) values ($1, 'place-milan', 1)`,
        [aliceRoute],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses to let a user grant themselves entitlement', async () => {
    await expect(
      database.asUser(
        bob,
        `insert into user_entitlements (user_id, status) values ($1, 'active')`,
        [bob],
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('refuses to let a user write usage events', async () => {
    await expect(
      database.asUser(
        bob,
        `insert into usage_events (user_id, endpoint) values ($1, '/optimize')`,
        [bob],
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('lets any authenticated user read the shared place cache', async () => {
    // Public Google data, and sharing it is the point: one user's lookup benefits
    // everyone (docs/31_COST_MODEL.md).
    const result = await database.asUser(bob, 'select place_id from places_cache');
    expect(result.rows).toHaveLength(1);
  });

  it('refuses to let a user poison the shared place cache', async () => {
    await expect(
      database.asUser(bob, `insert into places_cache (place_id, lat, lng) values ('fake', 0, 0)`),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });
});

describe('the coordinate purge', () => {
  it('uses the same 30-day window as the application constant', async () => {
    // The document is the source and both sides cite it; this asserts they have
    // not drifted apart (CLAUDE.md §13 rule 9).
    const result = await database.asService('select coordinate_max_age() as age');
    const age = (result.rows[0] as { age: unknown }).age;
    expect(JSON.stringify(age)).toContain(String(COORDINATE_MAX_AGE_DAYS));
  });

  it('nulls coordinates older than the window and keeps the place_id', async () => {
    await database.asService(
      `insert into places_cache (place_id, formatted_address, lat, lng, coords_refreshed_at)
       values ('stale', 'Via Roma 1', 45.0, 9.0, now() - interval '31 days')`,
    );

    const purged = await database.asService('select purge_expired_coordinates() as n');
    expect((purged.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);

    const row = await database.asService(
      `select place_id, lat, lng, formatted_address, coords_refreshed_at
         from places_cache where place_id = 'stale'`,
    );
    const record = row.rows[0] as Record<string, unknown>;
    // The row survives; only the perishable columns are cleared. Every dependent
    // stop keeps its foreign key, its label and its position.
    expect(record['place_id']).toBe('stale');
    expect(record['lat']).toBeNull();
    expect(record['lng']).toBeNull();
    expect(record['formatted_address']).toBeNull();
    expect(record['coords_refreshed_at']).toBeNull();
  });

  it('leaves a coordinate inside the window alone', async () => {
    await database.asService(
      `insert into places_cache (place_id, lat, lng, coords_refreshed_at)
       values ('fresh-29', 45.0, 9.0, now() - interval '29 days')`,
    );
    await database.asService('select purge_expired_coordinates()');

    const row = await database.asService(
      `select lat from places_cache where place_id = 'fresh-29'`,
    );
    expect((row.rows[0] as { lat: number | null }).lat).not.toBeNull();
  });

  it('records every run so a silent failure is detectable', async () => {
    const result = await database.asService(
      'select count(*)::int as n from coordinate_purge_runs where succeeded',
    );
    expect((result.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it('reports healthy after a successful run', async () => {
    // The predicate that must page when it goes false: a purge that stopped
    // running is a continuing terms violation producing no error anywhere.
    const result = await database.asService('select coordinate_purge_healthy() as healthy');
    expect((result.rows[0] as { healthy: boolean }).healthy).toBe(true);
  });

  it('is actually scheduled, not merely defined', async () => {
    const result = await database.asService(
      `select schedule from cron.job where jobname = 'purge-expired-coordinates'`,
    );
    expect(result.rows).toHaveLength(1);
  });
});
