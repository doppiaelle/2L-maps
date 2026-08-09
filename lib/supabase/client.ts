import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createAuthProvider } from './auth-adapter';
import type { SupabaseAuthPort } from './auth-adapter';
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
