import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

/**
 * A real Postgres to run the migrations against.
 *
 * The development environment has no Docker daemon, so the local Supabase stack
 * cannot start. PGlite is Postgres compiled to WebAssembly and runs in-process,
 * which turns "the migrations are written but never executed" into "the
 * migrations are executed and the RLS policies are tested against two distinct
 * users" — the difference between a reviewed schema and a verified one.
 *
 * What it does not give us: pg_cron, Supabase's real auth stack, or the exact
 * extension set of a hosted project. Those are shimmed below, and each shim is
 * narrow enough that what it stands in for is obvious.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/**
 * Supabase provides these before any migration runs. Recreating them is what lets
 * the migrations execute unmodified — a migration edited to suit the test would
 * no longer be the thing being tested.
 */
const SUPABASE_SHIM = `
  create schema if not exists auth;
  create schema if not exists extensions;

  -- Supabase's roles. RLS policies name them, so they must exist.
  do $$ begin
    create role anon nologin noinherit;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role authenticated nologin noinherit;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role service_role nologin noinherit bypassrls;
  exception when duplicate_object then null; end $$;

  create table auth.users (
    id         uuid primary key default gen_random_uuid(),
    email      text,
    created_at timestamptz not null default now()
  );

  -- The real implementation reads the verified JWT claims that PostgREST sets on
  -- the connection. The shape is the same, so a policy written against it here
  -- behaves the same in production.
  create function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
  $$;

  create publication supabase_realtime;

  -- pg_cron is not available in PGlite. The stub records the schedule so a test
  -- can assert the purge really is scheduled, rather than the migration quietly
  -- skipping it.
  create schema if not exists cron;
  create table cron.job (
    jobname  text primary key,
    schedule text not null,
    command  text not null
  );
  -- Parameters are prefixed because an unprefixed \`jobname\` is ambiguous against
  -- the column of the same name inside the insert.
  create function cron.schedule(p_jobname text, p_schedule text, p_command text) returns bigint
  language plpgsql
  as $$
  begin
    insert into cron.job (jobname, schedule, command) values (p_jobname, p_schedule, p_command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
    return 1;
  end;
  $$;
`;

/** `create extension pg_cron` cannot work here; the shim above stands in for it. */
const UNSUPPORTED_STATEMENTS = [/create\s+extension\s+if\s+not\s+exists\s+pg_cron[^;]*;/gi];

export interface TestDatabase {
  readonly db: PGlite;
  /** Run as a signed-in user, with RLS enforced. */
  asUser: (userId: string, sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  /** Run as the server, bypassing RLS — what an Edge Function does. */
  asService: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  close: () => Promise<void>;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** Boot a database with the shim and every migration applied, in filename order. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);

  for (const file of migrationFiles()) {
    let sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const pattern of UNSUPPORTED_STATEMENTS) {
      sql = sql.replace(pattern, '');
    }
    try {
      await db.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${file} failed: ${message}`);
    }
  }

  // Supabase grants these to `authenticated` by default. Without them the role
  // gets "permission denied" instead of an RLS-filtered result, which would make
  // every policy test pass for the wrong reason.
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
  `);

  /**
   * Everything here runs inside one transaction, because `set local` only holds
   * for the duration of one — outside it the role reverts immediately and the
   * query runs as the owner, who bypasses RLS. A harness with that bug reports
   * every policy as working.
   */
  const asUser = async (userId: string, sql: string, params: unknown[] = []) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated;`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId }),
      ]);
      return tx.query(sql, params);
    });

  const asService = async (sql: string, params: unknown[] = []) => db.query(sql, params);

  return { db, asUser, asService, close: () => db.close() };
}

/** Create a user and return its id, as Supabase Auth would. */
export async function createUser(database: TestDatabase, email: string): Promise<string> {
  const result = await database.asService(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  );
  const row = result.rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error('user insert returned no row');
  return row.id;
}
