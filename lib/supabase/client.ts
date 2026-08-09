import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createAuthProvider } from './auth-adapter';
import type { SupabaseAuthPort } from './auth-adapter';
import { createRoutesProvider } from './routes-adapter';
import type { RoutesPort, RoutesProvider } from './routes-adapter';
import type { AuthProvider } from '@/lib/providers/types';

/**
 * The Supabase client, built once.
 *
 * Two values reach the bundle, and both are meant to
 * ([`docs/19_SECURITY.md`](../../docs/19_SECURITY.md) §5): the project URL and
 * the **anon key**, which is a publishable identifier rather than a secret. It
 * grants nothing on its own — every table has RLS, and a table without a policy
 * is unreachable by design (`CLAUDE.md` §9 rule 3). The service-role key never
 * leaves Supabase secrets, and no Google credential other than the Maps
 * rendering key exists in the client at all
 * ([ADR-0006](../../docs/adr/0006-mandatory-backend-proxy.md)).
 *
 * **Configuration missing is a supported state.** It is what a fresh checkout
 * with no `.env` looks like, and the app has to say so rather than crash on
 * import — a crash at module load has no screen to report itself on.
 */

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export function readSupabaseConfig(
  env: Record<string, string | undefined> = process.env,
): SupabaseConfig | null {
  const url = env['EXPO_PUBLIC_SUPABASE_URL']?.trim() ?? '';
  const anonKey = env['EXPO_PUBLIC_SUPABASE_ANON_KEY']?.trim() ?? '';

  // Both or neither. Half a configuration produces a client that resolves every
  // request to a network error, which reads to a user as "the app is broken"
  // rather than "this build was never wired up".
  if (url === '' || anonKey === '') return null;
  return { url, anonKey };
}

/**
 * Where the Edge Functions live, or null when this build has no project.
 *
 * Derived from the project URL rather than configured separately, because they
 * are the same project and a second variable is a second thing to get wrong —
 * in a way that produces a working sign-in and a dead Optimize button, which is
 * the hardest kind of misconfiguration to diagnose from a phone.
 */
export function functionsBaseUrl(config: SupabaseConfig | null): string | null {
  if (config === null) return null;
  return `${config.url.replace(/\/+$/, '')}/functions/v1`;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      // The session is persisted so a returning user is not asked to sign in
      // again, and refreshed in the background so a token does not expire
      // mid-route.
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // React Native has no URL bar to read a callback fragment from; the deep
      // link handler owns that, and leaving this on makes the SDK look for a
      // browser that is not there.
      detectSessionInUrl: false,
    },
  });
}

/**
 * The authentication facade, or null when this build has no project configured.
 *
 * Null rather than a throwing stub: the caller has to handle the case anyway,
 * and a stub that throws on first use moves the failure to whichever screen
 * happens to touch it first.
 */
export function createSupabaseAuth(config: SupabaseConfig | null): AuthProvider | null {
  if (config === null) return null;
  // The SDK's auth surface is wider than the port; narrowing here is what keeps
  // the adapter honest about what it depends on.
  const client = createSupabaseClient(config);
  return createAuthProvider(client.auth as unknown as SupabaseAuthPort);
}

/**
 * The query builder, narrowed to the four operations the routes adapter uses.
 *
 * This is the only place the chainable PostgREST surface appears. It is a
 * composition root in the same sense as `supabase/functions/_shared/context.ts`
 * — no decisions, nothing branching, nothing worth a test — precisely so that
 * everything above it can be tested against `RoutesPort` without a project.
 *
 * The chain is built here rather than passed around because a half-built query
 * is a value with no meaning: `from('routes').select()` executes when awaited,
 * and handing one to another module makes it possible to await it twice.
 */
export function createPostgrestPort(client: SupabaseClient): RoutesPort {
  return {
    upsert: async (table, rows) => {
      const { error } = await client.from(table).upsert(rows as never[]);
      return { error: error === null ? null : { message: error.message } };
    },

    select: async (table, query) => {
      let builder = client.from(table).select(query.columns);

      for (const [column, value] of Object.entries(query.match ?? {})) {
        builder = builder.eq(column, value);
      }
      if (query.in !== undefined) builder = builder.in(query.in.column, [...query.in.values]);
      if (query.isNull !== undefined) builder = builder.is(query.isNull, null);
      if (query.order !== undefined) {
        builder = builder.order(query.order.column, { ascending: query.order.ascending });
      }
      if (query.limit !== undefined) builder = builder.limit(query.limit);

      const { data, error } = await builder;
      return { data, error: error === null ? null : { message: error.message } };
    },

    update: async (table, values, match) => {
      let builder = client.from(table).update(values);
      for (const [column, value] of Object.entries(match)) {
        builder = builder.eq(column, value);
      }
      const { error } = await builder;
      return { error: error === null ? null : { message: error.message } };
    },

    deleteRows: async (table, match) => {
      let builder = client.from(table).delete();
      for (const [column, value] of Object.entries(match)) {
        builder = builder.eq(column, value);
      }
      const { error } = await builder;
      return { error: error === null ? null : { message: error.message } };
    },
  };
}

/** Saved routes, or null when this build has no project — the same honest answer
 *  `createSupabaseAuth` gives, for the same reason. */
export function createSupabaseRoutes(config: SupabaseConfig | null): RoutesProvider | null {
  if (config === null) return null;
  return createRoutesProvider(createPostgrestPort(createSupabaseClient(config)));
}
