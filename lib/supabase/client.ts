import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

import { createAuthProvider } from './auth-adapter';
import type { AuthBrowserPort, SupabaseAuthPort } from './auth-adapter';
import { AUTH_REDIRECT_URL, type SupabaseConfig } from './config';
import { createFavouritesProvider } from './favourites-adapter';
import type { FavouritesPort, FavouritesProvider } from './favourites-adapter';
import { createRoutesProvider } from './routes-adapter';
import type { RoutesPort, RoutesProvider } from './routes-adapter';
import { trace } from '@/lib/diagnostics/app-trace';
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
      // PKCE rather than the implicit flow. The callback then carries a
      // short-lived code exchanged over HTTPS instead of a token in a URL — and
      // a URL on a phone is handed to the OS, logged by it, and visible to any
      // app registered for the scheme.
      flowType: 'pkce',
    },
  });
}

/**
 * The browser half of sign-in.
 *
 * `openAuthSessionAsync` uses the platform's authentication session — a Custom
 * Tab on Android — rather than a plain browser window. The difference matters:
 * it shares the system cookie jar, so a user already signed in to Google is not
 * asked again, and it closes itself when the redirect fires.
 */
export function createAuthBrowser(): AuthBrowserPort {
  return {
    openAuthSession: (url, redirectTo) => WebBrowser.openAuthSessionAsync(url, redirectTo),
  };
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
  return createAuthProvider(client.auth as unknown as SupabaseAuthPort, createAuthBrowser(), {
    redirectTo: AUTH_REDIRECT_URL,
  });
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
      const startedAt = Date.now();
      trace({
        level: 'debug',
        area: 'supabase',
        event: 'upsert_start',
        data: { table, rowCount: rows.length },
      });
      const { error } = await client.from(table).upsert(rows as never[]);
      tracePostgrestResult('upsert', table, startedAt, error);
      return { error: error === null ? null : { message: error.message } };
    },

    select: async (table, query) => {
      const startedAt = Date.now();
      trace({
        level: 'debug',
        area: 'supabase',
        event: 'select_start',
        data: {
          table,
          hasMatch: query.match !== undefined,
          hasIn: query.in !== undefined,
          isNull: query.isNull ?? null,
          limit: query.limit ?? null,
        },
      });
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
      tracePostgrestResult('select', table, startedAt, error, {
        rowCount: Array.isArray(data) ? data.length : null,
      });
      return { data, error: error === null ? null : { message: error.message } };
    },

    update: async (table, values, match) => {
      const startedAt = Date.now();
      trace({
        level: 'debug',
        area: 'supabase',
        event: 'update_start',
        data: { table, valueKeys: Object.keys(values), matchKeys: Object.keys(match) },
      });
      let builder = client.from(table).update(values);
      for (const [column, value] of Object.entries(match)) {
        builder = builder.eq(column, value);
      }
      const { error } = await builder;
      tracePostgrestResult('update', table, startedAt, error);
      return { error: error === null ? null : { message: error.message } };
    },

    deleteRows: async (table, match) => {
      const startedAt = Date.now();
      trace({
        level: 'debug',
        area: 'supabase',
        event: 'delete_start',
        data: { table, matchKeys: Object.keys(match) },
      });
      let builder = client.from(table).delete();
      for (const [column, value] of Object.entries(match)) {
        builder = builder.eq(column, value);
      }
      const { error } = await builder;
      tracePostgrestResult('delete', table, startedAt, error);
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

/** The address book. Its one write is an RPC rather than an update, so the
 *  increment is atomic and the owner comes from the session. */
export function createSupabaseFavourites(config: SupabaseConfig | null): FavouritesProvider | null {
  if (config === null) return null;

  const client = createSupabaseClient(config);
  const port: FavouritesPort = {
    select: createPostgrestPort(client).select,
    recordUse: async (placeId) => {
      const startedAt = Date.now();
      trace({
        level: 'debug',
        area: 'supabase',
        event: 'rpc_start',
        data: { rpc: 'record_place_use', hasPlaceId: placeId.length > 0 },
      });
      const { error } = await client.rpc('record_place_use', { p_place_id: placeId });
      tracePostgrestResult('rpc', 'record_place_use', startedAt, error);
      return { error: error === null ? null : { message: error.message } };
    },
  };

  return createFavouritesProvider(port);
}

function tracePostgrestResult(
  operation: string,
  table: string,
  startedAt: number,
  error: {
    readonly message: string;
    readonly code?: string;
    readonly details?: string;
    readonly hint?: string;
  } | null,
  extra: Readonly<Record<string, unknown>> = {},
): void {
  if (error === null) {
    trace({
      level: 'debug',
      area: 'supabase',
      event: `${operation}_ok`,
      data: { table, durationMs: Date.now() - startedAt, ...extra },
    });
    return;
  }

  trace({
    level: 'error',
    area: 'supabase',
    event: `${operation}_error`,
    data: {
      table,
      durationMs: Date.now() - startedAt,
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
      ...extra,
    },
  });
}
