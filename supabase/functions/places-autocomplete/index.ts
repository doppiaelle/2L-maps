import { ApiError } from '../_shared/errors';
import { createHandler } from '../_shared/handler';
import { autocompleteRequestSchema } from '../_shared/schemas';
import { defaultLimits, placesAdapter } from '../_shared/runtime';
import { serveWith } from '../_shared/serve';

/**
 * `/places-autocomplete`.
 *
 * **No cache, deliberately.** Places session semantics make a cached suggestion
 * both stale and a billing anomaly, so `readCache` is absent rather than
 * present-and-empty (docs/13_BACKEND.md §6).
 */
const handler = createHandler({
  endpoint: '/places-autocomplete',
  schema: autocompleteRequestSchema,
  callUpstream: async (request) => {
    const outcome = await placesAdapter().suggest(request.input, request.sessionToken, {
      ...(request.locale === undefined ? {} : { locale: request.locale }),
      ...(request.bias === undefined
        ? {}
        : { bias: { lat: request.bias.latitude, lng: request.bias.longitude } }),
    });
    if (!outcome.ok)
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service');
    return { result: { suggestions: outcome.value }, tier: null, units: 1 };
  },
});

serveWith(handler, defaultLimits);
