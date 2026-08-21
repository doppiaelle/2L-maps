import { hereRefreshUpstream } from '../_shared/endpoints/here-search.ts';
import { createHandler } from '../_shared/handler.ts';
import { defaultLimits, hereSearchAdapter } from '../_shared/runtime.ts';
import { hereRefreshRequestSchema } from '../_shared/schemas.ts';
import { serveWith } from '../_shared/serve.ts';

const handler = createHandler({
  endpoint: '/place-details',
  schema: hereRefreshRequestSchema,
  callUpstream: async (request, user, context) =>
    hereRefreshUpstream(request, {
      database: context.database,
      places: hereSearchAdapter(),
      userId: user.userId,
    }),
});

serveWith(handler, defaultLimits);
