import { createHandler } from '../_shared/handler.ts';
import { autocompleteUpstream } from '../_shared/endpoints/places-autocomplete.ts';
import { autocompleteRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, placesAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/**
 * `/places-autocomplete`.
 *
 * No decisions here; they are in `_shared/endpoints/places-autocomplete.ts`,
 * where they are typed and tested.
 */
const handler = createHandler({
  endpoint: '/places-autocomplete',
  schema: autocompleteRequestSchema,
  callUpstream: (request, _user, context) =>
    autocompleteUpstream(request, { database: context.database, places: placesAdapter() }),
});

serveWith(handler, defaultLimits);
