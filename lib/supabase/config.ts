/**
 * What this build knows about its backend, and nothing else.
 *
 * Separate from `client.ts` because it imports nothing. `client.ts` pulls in the
 * Supabase SDK, AsyncStorage and the browser module the moment it is touched —
 * a heavy price for asking "is this build configured at all?", which is a
 * question the launch sequence asks before it does anything else.
 *
 * **`EXPO_PUBLIC_*` variables are substituted, not read.** There is no
 * environment on a phone. Babel replaces `process.env.EXPO_PUBLIC_NAME` with a
 * string literal at build time, and it can only do so where it can see the name.
 * Reaching them through a variable — `const env = process.env; env['NAME']` — is
 * invisible to that substitution, and `process.env` in a release bundle is an
 * empty object.
 *
 * That failure is silent at every stage: the build succeeds, the app installs,
 * and every value is `undefined`, so the app reports itself unconfigured while
 * the secrets sit correctly in CI. It is not detectable by a type, a lint rule
 * or a unit test — in Jest `process.env` is a real object and every branch here
 * behaves. **The check that catches it greps the built bundle**, in
 * `.github/workflows/verify.yml`.
 */

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/** Named so a test can supply the pair without pretending to be an environment. */
export interface SupabaseEnv {
  readonly url: string | undefined;
  readonly anonKey: string | undefined;
}

/** The two static member expressions. This shape is load-bearing; see above. */
function bundledEnv(): SupabaseEnv {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function readSupabaseConfig(env: SupabaseEnv = bundledEnv()): SupabaseConfig | null {
  const url = env.url?.trim() ?? '';
  const anonKey = env.anonKey?.trim() ?? '';

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

/**
 * Where the provider sends the user back after sign-in.
 *
 * A literal rather than `Linking.createURL`, because the value has to match what
 * the auth server is configured to allow: it appears in `supabase/config.toml`
 * under `additional_redirect_urls`, and a mismatch is refused with an error page
 * in a browser the user did not ask to open. One string in two places that must
 * agree is better than a computed one in two places that might not.
 */
export const AUTH_REDIRECT_URL = 'twolmaps://auth-callback';
