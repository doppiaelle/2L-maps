import { createRequestContext } from './context';
import { errorResponse } from './http';

import type { HandlerContext } from './handler';

/**
 * The Deno boundary, in one place.
 *
 * Every entrypoint ends with `serveWith(handler, limits)`, so the parts that
 * cannot run under Jest — `Deno.serve`, the Postgres connection, the JWT
 * verifier — are written once rather than seven times. Seven copies of untested
 * code is six more chances for one of them to differ.
 *
 * The database and token wiring are resolved lazily, per request, rather than at
 * module load. A cold start that throws while evaluating a module produces a
 * platform error with no envelope; the same failure inside a request produces a
 * contract-shaped response the client already knows how to render.
 */

interface DenoGlobal {
  serve: (handler: (request: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
}
declare const Deno: DenoGlobal | undefined;

/** How a request gets its database and token verifier. */
export type ContextFactory = () => Promise<Omit<HandlerContext, 'limits'>>;

/**
 * The default is the real one.
 *
 * It was previously null until something called `setContextFactory`, and nothing
 * ever did — so every deployed function answered `INTERNAL` to every request,
 * and the failure was invisible here because no test can reach this file. Wiring
 * that must be performed for the code to work at all, and that nothing forces,
 * is wiring that will be missing.
 *
 * The override survives for a local harness that wants a different connection;
 * it is no longer what production depends on.
 */
let contextFactory: ContextFactory = () => Promise.resolve(createRequestContext());

/** Substitute the context, for a local Deno run against another database. */
export function setContextFactory(factory: ContextFactory): void {
  contextFactory = factory;
}

export function serveWith(
  handler: (request: Request, context: HandlerContext) => Promise<Response>,
  limits: () => HandlerContext['limits'],
): void {
  if (typeof Deno === 'undefined') return;

  Deno.serve(async (request: Request): Promise<Response> => {
    try {
      const base = await contextFactory();
      return await handler(request, { ...base, limits: limits() });
    } catch {
      // The thrown value is never read: it can carry a connection string or a
      // key, and neither may reach a response body or a log line
      // (CLAUDE.md §9 rule 8).
      return errorResponse('INTERNAL', 'Something went wrong on our side');
    }
  });
}
