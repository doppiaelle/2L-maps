import { createParseAdapter, type ParseAdapter } from './upstream/parse.ts';
import { createOpenRouterParseAdapter } from './upstream/parse-openrouter.ts';
import { createPlacesAdapter } from './upstream/places.ts';
import { createHybridRoutingAdapter } from './upstream/hybrid-routing.ts';
import { createHereSearchAdapter } from './upstream/here-search.ts';
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

export function hybridRoutingAdapter(): ReturnType<typeof createHybridRoutingAdapter> {
  return createHybridRoutingAdapter({
    orsApiKey: requireEnv('ORS_API_KEY'),
    hereApiKey: requireEnv('HERE_REST_API_KEY'),
    fetchImpl: fetch,
  });
}

export function hereSearchAdapter(): ReturnType<typeof createHereSearchAdapter> {
  return createHereSearchAdapter({
    apiKey: requireEnv('HERE_REST_API_KEY'),
    fetchImpl: fetch,
  });
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
  const provider = readEnv('PARSE_PROVIDER');
  const anthropicKey = readEnv('ANTHROPIC_API_KEY');
  const openRouterKey = readEnv('OPENROUTER_API_KEY');

  // `PARSE_PROVIDER` is an override, not a requirement. It used to be the only
  // way to reach OpenRouter, so a project holding an OpenRouter key and no
  // Anthropic key fell through to the Anthropic branch and threw on a secret it
  // was never going to have — and the endpoint failed for a configuration that
  // was, in substance, complete. A setting whose omission breaks a working setup
  // is a trap, not a default.
  const useOpenRouter =
    provider === 'openrouter' || (provider === '' && anthropicKey === '' && openRouterKey !== '');

  if (useOpenRouter) {
    const model = readEnv('PARSE_MODEL');
    return createOpenRouterParseAdapter({
      apiKey: requireEnv('OPENROUTER_API_KEY'),
      fetchImpl: fetch,
      maxCandidates: MAX_STOPS,
      ...(model === '' ? {} : { model }),
    });
  }

  // Anthropic still wins whenever its key is present, including when both are.
  // ADR-0017's reasoning is unchanged: many free endpoints retain prompts for
  // training and a pasted delivery list is third-party personal data, so the
  // cheaper path is chosen deliberately or not at all.
  return createParseAdapter({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    fetchImpl: fetch,
    maxCandidates: MAX_STOPS,
  });
}

/** An optional variable: absent and empty are the same thing to a deployment. */
function readEnv(key: string): string {
  return (typeof Deno === 'undefined' ? undefined : Deno.env.get(key)) ?? '';
}

/**
 * Rate limits, from [`docs/33_API_CONTRACTS.md`](../../../docs/33_API_CONTRACTS.md) §10.
 *
 * **Only burst lives here.** The monthly allowance used to be a single Pro-shaped
 * table, which meant every plan was charged the Pro ceiling and a free user was
 * refused by step 2 before ever reaching it. Per-plan allowances now live in
 * `plans.ts`, read by the quota gate and by `/usage-quota` alike so the number
 * that refuses and the number that is displayed cannot drift
 * ([ADR-0029](../../../docs/adr/0029-single-driver-wedge-and-subscription-first-freemium.md)).
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
