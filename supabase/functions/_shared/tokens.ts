import type { TokenVerifier } from './dependencies';

/**
 * Who is calling, decided by the auth server rather than by us.
 *
 * The JWT is presented to `GET /auth/v1/user`, which answers with the user or
 * refuses. That is one same-region round trip per metered request, and it buys
 * two things worth more than the milliseconds.
 *
 * **It works on every project.** Verifying the signature here would mean holding
 * the signing key, and Supabase projects sign with a shared secret or with an
 * asymmetric key depending on when they were created and whether keys have been
 * rotated since. A verifier that knows how a token was signed is a verifier that
 * breaks on a rotation nobody told it about — silently, by rejecting everyone.
 *
 * **It respects revocation.** A signed-out session and a deleted account both
 * still carry a structurally valid token until it expires. Local verification
 * would accept both for the rest of the hour.
 *
 * `verify_jwt = true` in `config.toml` is the first gate and this is the second.
 * The platform's check runs before our code and rejects a malformed or expired
 * token; this one establishes *which user* — and, being independent, it still
 * holds if that flag is ever changed by hand in a dashboard.
 *
 * **It fails closed.** Every failure returns null, which the pipeline turns into
 * 401. An error while deciding who the caller is must never be the thing that
 * lets them past (`docs/10_NAVIGATION_FLOW.md` §10 applies to the server too).
 */

export interface TokenVerifierOptions {
  /** The project URL. Auto-injected into every Edge Function as `SUPABASE_URL`. */
  readonly supabaseUrl: string;
  /** The publishable anon key, required as the `apikey` header. It grants
   *  nothing on its own — RLS decides everything (docs/19_SECURITY.md §5). */
  readonly anonKey: string;
  readonly fetchImpl?: typeof fetch;
  /** Bounded so a slow auth server degrades to a 401 rather than holding the
   *  request open until the platform kills it with no envelope at all. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export function createTokenVerifier(options: TokenVerifierOptions): TokenVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    verify: async (authorizationHeader: string | null): Promise<string | null> => {
      if (authorizationHeader === null) return null;

      // The scheme is checked rather than assumed: `Bearer` is what the client
      // sends, and forwarding anything else would ask the auth server to
      // interpret a header we did not recognise.
      const token = /^Bearer\s+(.+)$/i.exec(authorizationHeader)?.[1]?.trim();
      if (token === undefined || token === '') return null;

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetchImpl(`${options.supabaseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
            apikey: options.anonKey,
          },
          signal: controller.signal,
        });

        if (!response.ok) return null;

        const body: unknown = await response.json();
        const id = (body as { id?: unknown } | null)?.id;
        // A 200 with no id is not a user. Returning it would attach every
        // subsequent query to the string "undefined".
        return typeof id === 'string' && id !== '' ? id : null;
      } catch {
        // Timeout, abort, unreachable, or a body that is not JSON. All of them
        // mean the same thing here: we do not know who this is.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
