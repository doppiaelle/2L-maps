import { createHandler } from '../_shared/handler.ts';
import { optimizeUpstream } from '../_shared/endpoints/optimize.ts';
import { optimizeRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, routesAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/**
 * `/optimize` — tier T1.
 *
 * No decisions live here. This file is excluded from `tsc` because it imports
 * Deno globals, so anything written in it is unchecked by construction; the
 * logic is in `_shared/endpoints/optimize.ts`, where it is typed and tested.
 */
const handler = createHandler({
  endpoint: '/optimize',
  schema: optimizeRequestSchema,
  callUpstream: (request) => optimizeUpstream(request, routesAdapter()),
});

serveWith(handler, defaultLimits);
