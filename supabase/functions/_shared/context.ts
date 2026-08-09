import postgres from 'postgres';

import { createTokenVerifier } from './tokens';

import type { DatabaseClient } from './dependencies';
import type { HandlerContext } from './handler';

/**
 * The request context: a database connection and a token verifier.
 *
 * Together with `runtime.ts` this is the composition root, and it carries the
 * same warning: **nothing here is exercised by the test suite**, because reading
 * `Deno.env` and opening a Postgres connection are the two things the test
 * environment cannot do. So it holds no decisions. Every branch worth testing
 * lives one layer down — the verifier in `tokens.ts`, the queries in
 * `dependencies.ts` and `places-cache.ts`, all of them injected with what this
 * file builds.
 *
 * **The connection is opened once per isolate, not once per request.** Edge
 * Functions reuse a warm isolate across requests, and a fresh connection per
 * request would exhaust the pooler under exactly the load that matters. The
 * lazy singleton below is what makes a cold start pay for the connection and
 * every warm request inherit it.
 *
 * The service role is used deliberately and is why every query in
 * `dependencies.ts` filters by `user_id` explicitly: the service role bypasses
 * RLS, so on this side of the wire ownership is something the code asserts
 * rather than something the database enforces
 * ([`docs/19_SECURITY.md`](../../../docs/19_SECURITY.md)).
 */

interface DenoEnv {
  env: { get: (key: string) => string | undefined };
}
declare const Deno: DenoEnv | undefined;

function requireEnv(key: string): string {
  const value = typeof Deno === 'undefined' ? undefined : Deno.env.get(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required secret: ${key}`);
  }
  return value;
}

let connection: ReturnType<typeof postgres> | null = null;

function sql(): ReturnType<typeof postgres> {
  if (connection === null) {
    connection = postgres(requireEnv('SUPABASE_DB_URL'), {
      // The transaction pooler does not support prepared statements, and this is
      // the connection string Supabase injects.
      prepare: false,
      // Small on purpose: an isolate serves a handful of concurrent requests and
      // hundreds of isolates share one pooler.
      max: 3,
      idle_timeout: 20,
    });
  }
  return connection;
}

export function createDatabaseClient(): DatabaseClient {
  return {
    queryOne: async <T>(query: string, params: readonly unknown[]): Promise<T | null> => {
      const rows = await sql().unsafe(query, params as never[]);
      return (rows[0] as T | undefined) ?? null;
    },
    queryMany: async <T>(query: string, params: readonly unknown[]): Promise<readonly T[]> => {
      const rows = await sql().unsafe(query, params as never[]);
      return rows as unknown as readonly T[];
    },
    execute: async (query: string, params: readonly unknown[]): Promise<void> => {
      await sql().unsafe(query, params as never[]);
    },
  };
}

/** Built per request from values the platform injects into every function. */
export function createRequestContext(): Omit<HandlerContext, 'limits'> {
  return {
    database: createDatabaseClient(),
    tokens: createTokenVerifier({
      supabaseUrl: requireEnv('SUPABASE_URL'),
      anonKey: requireEnv('SUPABASE_ANON_KEY'),
    }),
  };
}
