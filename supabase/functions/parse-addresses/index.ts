import { parseAddressesUpstream } from '../_shared/endpoints/parse-addresses.ts';
import { createHandler } from '../_shared/handler.ts';
import { parseAddressesRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, parseAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/**
 * `/parse-addresses` — unstructured input to candidate addresses
 * ([ADR-0016](../../../docs/adr/0016-ai-assisted-stop-entry.md)).
 *
 * Composition only. Everything this endpoint decides lives in
 * `_shared/endpoints/parse-addresses.ts`, where `tsc` can check it and a test
 * can reach it — this file is excluded from both.
 */
const handler = createHandler({
  endpoint: '/parse-addresses',
  schema: parseAddressesRequestSchema,
  callUpstream: (request) => parseAddressesUpstream(request, { parse: parseAdapter() }),
});

serveWith(handler, defaultLimits);
