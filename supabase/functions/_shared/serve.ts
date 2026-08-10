import { createRequestContext } from './context.ts';
import { errorResponse } from './http.ts';

import type { HandlerContext } from './handler.ts';

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
    } catch (error) {
      // **Logged here, never returned.** The two have different rules and
      // conflating them is what made this backend undebuggable: the response
      // must say nothing (an error can carry a connection string), but the log
      // is the only place an operator can ever learn why a function died.
      //
      // Swallowing it entirely meant a missing secret produced `INTERNAL` to
      // the client and *silence* in the Supabase logs — so the one question
      // worth asking, "why is every request failing", had no answer anywhere.
      //
      // Only the message and the type are logged. Our own throws name the thing
      // that is missing ("Missing required secret: GOOGLE_SERVER_API_KEY") and
      // never its value, which is what keeps this inside §9 rule 8. The stack is
      // omitted deliberately: it can quote source containing a literal.
      console.error(
        JSON.stringify({
          event: 'request_failed',
          type: error instanceof Error ? error.name : typeof error,
          reason: error instanceof Error ? error.message : 'non-error thrown',
        }),
      );
      return errorResponse('INTERNAL', 'Something went wrong on our side');
    }
  });
}
