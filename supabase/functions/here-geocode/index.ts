import { hereGeocodeUpstream } from '../_shared/endpoints/here-search.ts';
import { createHandler } from '../_shared/handler.ts';
import { defaultLimits, hereSearchAdapter } from '../_shared/runtime.ts';
import { hereGeocodeRequestSchema } from '../_shared/schemas.ts';
import { serveWith } from '../_shared/serve.ts';

const handler = createHandler({
  endpoint: '/geocode',
  schema: hereGeocodeRequestSchema,
  callUpstream: async (request, user, context) =>
    hereGeocodeUpstream(request, {
      database: context.database,
      places: hereSearchAdapter(),
      userId: user.userId,
    }),
});

serveWith(handler, defaultLimits);
