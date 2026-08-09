import {
  buildDependencies,
  type DatabaseClient,
  type QuotaLimits,
  type TokenVerifier,
} from './dependencies';
import { errorResponse, jsonResponse, pipelineResponse, readJson } from './http';
import { runPipeline, type AuthenticatedUser, type UpstreamOutcome } from './pipeline';
import { parseRequest } from './schemas';

import type { z } from 'zod';

/**
 * The wiring every metered endpoint shares.
 *
 * It exists so the order cannot be got wrong. Each entrypoint is otherwise a
 * chance to validate after calling upstream, or to skip the quota check on the
 * one path nobody reviewed — and both mistakes are invisible until a bill
 * arrives. Here the sequence is written once: read, validate, then hand a
 * *typed* request to the seven-step pipeline, which owns everything after that
 * ([ADR-0006](../../../docs/adr/0006-mandatory-backend-proxy.md)).
 *
 * The entrypoint files are deliberately five lines each. Deno's `serve` cannot
 * run in this environment, so anything that lives in an entrypoint is untested
 * by construction; anything that lives here is not.
 */

export interface HandlerContext {
  readonly database: DatabaseClient;
  readonly tokens: TokenVerifier;
  readonly limits: QuotaLimits;
}

export interface HandlerDefinition<TRequest, TResult> {
  readonly endpoint: string;
  readonly schema: z.ZodType<TRequest>;
  callUpstream: (request: TRequest, user: AuthenticatedUser) => Promise<UpstreamOutcome<TResult>>;
  readCache?: (request: TRequest) => Promise<TResult | null>;
  writeCache?: (request: TRequest, result: TResult) => Promise<void>;
  /** POST for everything except the read-only quota endpoint. */
  readonly method?: 'GET' | 'POST';
}

export function createHandler<TRequest, TResult>(definition: HandlerDefinition<TRequest, TResult>) {
  const method = definition.method ?? 'POST';

  return async (request: Request, context: HandlerContext): Promise<Response> => {
    if (request.method !== method) {
      // Answered before authentication on purpose: it is a routing mistake, not
      // an access decision, and there is nothing to protect.
      return errorResponse('INVALID_REQUEST', 'Unsupported method');
    }

    const body = method === 'GET' ? {} : await readJson(request);

    // Validation precedes everything metered. A malformed request that reached
    // upstream would be a billed call for a result nobody can use
    // (CLAUDE.md §9 rule 5).
    const parsed = parseRequest(definition.schema, body);
    if (!parsed.ok) {
      return errorResponse(
        parsed.code,
        parsed.code === 'MISSING_SESSION_TOKEN'
          ? 'Search session missing'
          : 'Something went wrong on our side',
      );
    }

    const dependencies = buildDependencies<TRequest, TResult>({
      endpoint: definition.endpoint,
      database: context.database,
      tokens: context.tokens,
      limits: context.limits,
      authorizationHeader: request.headers.get('authorization'),
      callUpstream: definition.callUpstream,
      ...(definition.readCache === undefined ? {} : { readCache: definition.readCache }),
      ...(definition.writeCache === undefined ? {} : { writeCache: definition.writeCache }),
    });

    return pipelineResponse(await runPipeline(parsed.value, dependencies));
  };
}

/**
 * The unmetered read.
 *
 * `/usage-quota` consumes no quota and calls nothing upstream, so putting it
 * through the metered pipeline would have it check an allowance in order to
 * report that allowance — and deny the answer to exactly the user who most needs
 * it, the one who has run out (docs/33_API_CONTRACTS.md).
 */
export function createQuotaHandler(
  read: (userId: string, context: HandlerContext) => Promise<unknown>,
): (request: Request, context: HandlerContext) => Promise<Response> {
  return async (request, context) => {
    if (request.method !== 'GET') {
      return errorResponse('INVALID_REQUEST', 'Unsupported method');
    }

    const userId = await context.tokens.verify(request.headers.get('authorization'));
    if (userId === null) {
      return errorResponse('UNAUTHENTICATED', 'Sign in to continue');
    }

    return jsonResponse(200, await read(userId, context));
  };
}
