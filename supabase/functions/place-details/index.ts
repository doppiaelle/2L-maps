import { ApiError } from '../_shared/errors';
import { createHandler } from '../_shared/handler';
import { placeDetailsRequestSchema } from '../_shared/schemas';
import { defaultLimits, placesAdapter } from '../_shared/runtime';
import { serveWith } from '../_shared/serve';

/**
 * `/place-details` — turn durable `place_id`s back into usable coordinates
 * ([ADR-0007](../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 *
 * Thin by design: the wiring order lives in `createHandler`, the upstream
 * behaviour in the Places adapter, and both are tested. Nothing decidable
 * belongs in this file, because nothing in this file can run under Jest.
 */
const handler = createHandler({
  endpoint: '/place-details',
  schema: placeDetailsRequestSchema,
  callUpstream: async (request) => {
    const outcome = await placesAdapter().detailsFor(request.placeIds);
    if (outcome.outage !== null)
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service', {
        degradationHint: 'RETRY_LATER',
      });
    return {
      result: {
        resolved: outcome.resolved,
        unresolved: outcome.unresolved.map((placeId) => ({ placeId })),
      },
      tier: null,
      units: request.placeIds.length,
    };
  },
});

serveWith(handler, defaultLimits);
