import { createHandler } from '../_shared/handler.ts';
import { geocodeUpstream } from '../_shared/endpoints/geocode.ts';
import { geocodeRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, placesAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/** `/geocode` — batch resolution for list import. Partial success always, and a
 *  write-through to `places_cache` so the next lookup of the same place is free. */
const handler = createHandler({
  endpoint: '/geocode',
  schema: geocodeRequestSchema,
  callUpstream: (request, _user, context) =>
    geocodeUpstream(request, { database: context.database, places: placesAdapter() }),
});

serveWith(handler, defaultLimits);
