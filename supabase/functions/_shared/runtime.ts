import { createParseAdapter, type ParseAdapter } from './upstream/parse.ts';
import { createOpenRouterParseAdapter } from './upstream/parse-openrouter.ts';
import { createPlacesAdapter } from './upstream/places.ts';
import { createRoutesAdapter } from './upstream/routes.ts';
import { MAX_STOPS } from '../../../types/constants.ts';

import type { HandlerContext } from './handler.ts';

/**
 * The composition root: where secrets are read and adapters are built.
 *
 * This is the only file in the repository that reads an environment variable
 * holding a credential. Everything else receives what it needs as an argument,
 * which is what makes the rest of the backend testable without a single secret
 * present — and what keeps a key from being pulled into a module that later gets
 * imported somewhere it should not be (`CLAUDE.md` §9 rule 2).
 *
 * **Nothing here is exercised by the test suite**, because reading `Deno.env` and
 * opening a Postgres connection are exactly the two things this environment
 * cannot do. That is why it is small enough to read in one sitting and contains
 * no branching worth testing: every decision lives one layer down, where it is
 * covered.
 */

/** The Deno global, described rather than imported, so this file type-checks in
 *  Node even though it only ever runs in Deno. */
interface DenoEnv {
  env: { get: (key: string) => string | undefined };
}
declare const Deno: DenoEnv | undefined;

/** Absent is fatal and says which one. A function that starts without its key
 *  fails on the first user request instead of at boot, which turns a deployment
 *  mistake into an incident. */
function requireEnv(key: string): string {
  const value = typeof Deno === 'undefined' ? undefined : Deno.env.get(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required secret: ${key}`);
  }
  return value;
}

export function googleServerKey(): string {
  // Distinct from the client's Maps rendering key, which is restricted to the
  // Maps SDK and useless for these APIs (CLAUDE.md §0 rule 1).
  return requireEnv('GOOGLE_SERVER_API_KEY');
}

export function routesAdapter(): ReturnType<typeof createRoutesAdapter> {
  return createRoutesAdapter({ apiKey: googleServerKey(), fetchImpl: fetch });
}

export function placesAdapter(): ReturnType<typeof createPlacesAdapter> {
  return createPlacesAdapter({ apiKey: googleServerKey(), fetchImpl: fetch });
}

/**
 * Which model parses a paste.
 *
 * A switch rather than a replacement ([ADR-0017](../../../docs/adr/0017-parse-provider-switch.md)):
 * ADR-0016's choice of `claude-haiku-4-5` stands as the default, and OpenRouter
 * exists so the endpoint can be exercised against a free model without a paid
 * account.
 *
 * **Anthropic is the default deliberately.** Many free endpoints retain prompts
 * for training, and a pasted delivery list is third-party personal data —
 * customers' addresses, not the user's. Nobody should reach the cheaper path by
 * omission; it has to be asked for.
 */
export function parseAdapter(): ParseAdapter {
  const provider = (typeof Deno === 'undefined' ? undefined : Deno.env.get('PARSE_PROVIDER')) ?? '';

  if (provider === 'openrouter') {
    const model = typeof Deno === 'undefined' ? undefined : Deno.env.get('PARSE_MODEL');
    return createOpenRouterParseAdapter({
      apiKey: requireEnv('OPENROUTER_API_KEY'),
      fetchImpl: fetch,
      maxCandidates: MAX_STOPS,
      ...(model === undefined || model === '' ? {} : { model }),
    });
  }

  return createParseAdapter({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    fetchImpl: fetch,
    maxCandidates: MAX_STOPS,
  });
}

/**
 * Rate limits, from [`docs/33_API_CONTRACTS.md`](../../../docs/33_API_CONTRACTS.md) §10.
 *
 * **Only burst lives here.** The monthly allowance used to be a single Pro-shaped
 * table, which meant every plan was charged the Pro ceiling and a free user was
 * refused by step 2 before ever reaching it. Per-plan allowances now live in
 * `plans.ts`, read by the quota gate and by `/usage-quota` alike so the number
 * that refuses and the number that is displayed cannot drift
 * ([ADR-0015](../../../docs/adr/0015-ad-supported-free-tier.md)).
 *
 * Burst stays flat across plans on purpose: it catches a stuck input or a retry
 * loop, which is a defect rather than a purchase.
 */
export function defaultLimits(): HandlerContext['limits'] {
  return {
    burst: {
      '/optimize': { max: 20, windowSeconds: 3_600 },
      '/places-autocomplete': { max: 60, windowSeconds: 60 },
      '/geocode': { max: 30, windowSeconds: 60 },
      '/place-details': { max: 30, windowSeconds: 60 },
      '/parse-addresses': { max: 10, windowSeconds: 60 },
    },
  };
}
