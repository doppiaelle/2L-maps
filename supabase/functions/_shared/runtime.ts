import { createParseAdapter } from './upstream/parse';
import { createPlacesAdapter } from './upstream/places';
import { createRoutesAdapter } from './upstream/routes';
import { MAX_STOPS } from '../../../types/constants';

import type { HandlerContext } from './handler';

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

export function parseAdapter(): ReturnType<typeof createParseAdapter> {
  return createParseAdapter({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    fetchImpl: fetch,
    maxCandidates: MAX_STOPS,
  });
}

/**
 * Quota and rate limits, from [`docs/33_API_CONTRACTS.md`](../../../docs/33_API_CONTRACTS.md) §10.
 *
 * Server configuration by design: these move without an app release, which is
 * the control that keeps the ad-supported free tier cost-neutral
 * ([ADR-0011](../../../docs/adr/0011-server-side-quota-enforcement.md),
 * [ADR-0015](../../../docs/adr/0015-ad-supported-free-tier.md)). The values here
 * are the Pro allowance; per-plan allowances are read from the entitlement row.
 */
export function defaultLimits(): HandlerContext['limits'] {
  return {
    monthly: {
      '/optimize': 300,
      '/places-autocomplete': 1_200,
      '/geocode': 1_500,
      '/place-details': 1_500,
      '/parse-addresses': 100,
    },
    burst: {
      '/optimize': { max: 20, windowSeconds: 3_600 },
      '/places-autocomplete': { max: 60, windowSeconds: 60 },
      '/geocode': { max: 30, windowSeconds: 60 },
      '/place-details': { max: 30, windowSeconds: 60 },
      '/parse-addresses': { max: 10, windowSeconds: 60 },
    },
  };
}
