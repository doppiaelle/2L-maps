import { createHandler } from '../_shared/handler.ts';
import { placeDetailsUpstream } from '../_shared/endpoints/place-details.ts';
import { placeDetailsRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, placesAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/**
 * `/place-details` — turn durable `place_id`s back into usable coordinates
 * ([ADR-0007](../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 *
 * Thin by design: the cache-first split and the write-back live in
 * `_shared/endpoints/place-details.ts`, where they are typed and tested. Nothing
 * decidable belongs in this file, because nothing in this file can run under
 * Jest.
 */
const handler = createHandler({
  endpoint: '/place-details',
  schema: placeDetailsRequestSchema,
  callUpstream: (request, _user, context) =>
    placeDetailsUpstream(request, { database: context.database, places: placesAdapter() }),
});

serveWith(handler, defaultLimits);
