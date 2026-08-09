import { createHandler } from '../_shared/handler';
import { autocompleteUpstream } from '../_shared/endpoints/places-autocomplete';
import { autocompleteRequestSchema } from '../_shared/schemas';
import { defaultLimits, placesAdapter } from '../_shared/runtime';
import { serveWith } from '../_shared/serve';

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
