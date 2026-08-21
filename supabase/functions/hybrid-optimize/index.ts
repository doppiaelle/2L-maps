import { createHandler } from '../_shared/handler.ts';
import { hybridOptimizeRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, hybridRoutingAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/**
 * Provider-neutral hybrid optimization behind the existing /optimize quota.
 *
 * The public function has its own migration path, but shares authentication,
 * entitlement, rate limiting and allowance with the existing production route.
 */
const handler = createHandler({
  endpoint: '/optimize',
  schema: hybridOptimizeRequestSchema,
  callUpstream: async (request) => ({
    result: await hybridRoutingAdapter().optimize(request.stops),
    tier: 'hybrid-ors-here',
    units: 1,
  }),
});

serveWith(handler, defaultLimits);
