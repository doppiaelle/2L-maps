import { ApiError } from '../_shared/errors.ts';
import { createHandler } from '../_shared/handler.ts';
import { parseAddressesRequestSchema } from '../_shared/schemas.ts';
import { defaultLimits, parseAdapter } from '../_shared/runtime.ts';
import { serveWith } from '../_shared/serve.ts';

/**
 * `/parse-addresses` — unstructured input to candidate addresses
 * ([ADR-0016](../../../docs/adr/0016-ai-assisted-stop-entry.md)).
 *
 * The image never reaches storage or a log, here or anywhere: it is parsed and
 * discarded within this request (risk C19).
 */
const handler = createHandler({
  endpoint: '/parse-addresses',
  schema: parseAddressesRequestSchema,
  callUpstream: async (request) => {
    const outcome = await parseAdapter()({
      ...(request.text === undefined ? {} : { text: request.text }),
      ...(request.imageBase64 === undefined ? {} : { imageBase64: request.imageBase64 }),
      locale: request.locale ?? null,
    });
    if (!outcome.ok) {
      // The upstream's own status, carried so the refusal is diagnosable. A
      // wrong or unavailable model id and a revoked key both arrive here as
      // "could not read that", and without the number they are the same event —
      // which is exactly how a working key and a model the account cannot reach
      // became indistinguishable in production.
      //
      // Not sensitive: it is the HTTP status of a third-party call, never their
      // response body and never a credential.
      const upstreamStatus = outcome.failure.kind === 'rejected' ? outcome.failure.status : null;

      throw new ApiError(
        outcome.failure.kind === 'refused' ? 'INVALID_REQUEST' : 'UPSTREAM_UNAVAILABLE',
        outcome.failure.kind === 'refused'
          ? 'That content could not be read'
          : 'Could not read that just now',
        { details: { reason: outcome.failure.kind, upstreamStatus } },
      );
    }
    return {
      result: {
        candidates: outcome.result.addresses.map((address, index) => ({ index, address })),
        unparsed: outcome.result.unparsed,
      },
      tier: null,
      units: 1,
    };
  },
});

serveWith(handler, defaultLimits);
