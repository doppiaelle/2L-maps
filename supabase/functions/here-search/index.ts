import { hereSuggestionsUpstream } from '../_shared/endpoints/here-search.ts';
import { createHandler } from '../_shared/handler.ts';
import { defaultLimits, hereSearchAdapter } from '../_shared/runtime.ts';
import { hereSearchRequestSchema } from '../_shared/schemas.ts';
import { serveWith } from '../_shared/serve.ts';

const handler = createHandler({
  endpoint: '/places-autocomplete',
  schema: hereSearchRequestSchema,
  callUpstream: async (request) => hereSuggestionsUpstream(request, hereSearchAdapter()),
});

serveWith(handler, defaultLimits);
