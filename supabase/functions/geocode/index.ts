import { ApiError } from '../_shared/errors';
import { createHandler } from '../_shared/handler';
import { geocodeRequestSchema } from '../_shared/schemas';
import { defaultLimits, placesAdapter } from '../_shared/runtime';
import { serveWith } from '../_shared/serve';

/** `/geocode` — batch resolution for list import. Partial success always. */
const handler = createHandler({
  endpoint: '/geocode',
  schema: geocodeRequestSchema,
  callUpstream: async (request) => {
    const outcome = await placesAdapter().geocode(request.addresses, request.region ?? 'IT');
    if (outcome.outage !== null)
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service', {
        degradationHint: 'RETRY_LATER',
      });
    return {
      result: { resolved: outcome.resolved, unresolved: outcome.unresolved },
      tier: null,
      units: request.addresses.length,
    };
  },
});

serveWith(handler, defaultLimits);
