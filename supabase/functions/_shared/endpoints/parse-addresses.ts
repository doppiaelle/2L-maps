import { ApiError } from '../errors.ts';

import type { UpstreamOutcome } from '../pipeline.ts';

/**
 * `/parse-addresses` — unstructured input to candidate addresses
 * ([ADR-0016](../../../../docs/adr/0016-ai-assisted-stop-entry.md)).
 *
 * **This logic lived in the Deno entrypoint until now, and that is why it is
 * here.** Every `index.ts` under `supabase/functions/` is excluded from `tsc`,
 * so anything
 * written there is unchecked by construction and cannot be reached by a test.
 * This endpoint's response shape — the one field name the client parses — was
 * therefore the only one in the product that nothing verified, while the same
 * class of mismatch had already taken `/optimize` down for its entire existence
 * ([ADR-0023](../../../../docs/adr/0023-legs-name-their-stops.md)). The rule the
 * endpoint suite states is that **an entrypoint contains no decisions**; this is
 * that rule applied rather than repeated.
 *
 * The image never reaches storage or a log, here or anywhere: it is parsed and
 * discarded within this request (risk C19).
 */

export interface ParsePort {
  (input: {
    readonly text?: string;
    readonly imageBase64?: string;
    readonly locale: string | null;
  }): Promise<
    | {
        readonly ok: true;
        readonly result: {
          readonly addresses: readonly string[];
          readonly unparsed: readonly string[];
        };
      }
    | { readonly ok: false; readonly failure: { readonly kind: string; readonly status?: number } }
  >;
}

export interface ParseAddressesRequest {
  readonly text?: string | undefined;
  readonly imageBase64?: string | undefined;
  readonly locale?: string | null | undefined;
}

export interface ParseAddressesResult {
  /** Indexed, because the client shows them as rows the user can edit and an
   *  index is how a row is identified after the list is re-sorted. */
  readonly candidates: readonly { readonly index: number; readonly address: string }[];
  /** Lines the model could not read. Shown, never discarded: a driver who
   *  pasted thirty addresses must be told which two did not survive. */
  readonly unparsed: readonly string[];
}

export async function parseAddressesUpstream(
  request: ParseAddressesRequest,
  deps: { readonly parse: ParsePort },
): Promise<UpstreamOutcome<ParseAddressesResult>> {
  const outcome = await deps.parse({
    ...(request.text === undefined ? {} : { text: request.text }),
    ...(request.imageBase64 === undefined ? {} : { imageBase64: request.imageBase64 }),
    locale: request.locale ?? null,
  });

  if (!outcome.ok) {
    // The upstream's own status, carried so the refusal is diagnosable. A wrong
    // or unavailable model id and a revoked key both arrive here as "could not
    // read that", and without the number they are the same event — which is
    // exactly how a working key and a model the account cannot reach became
    // indistinguishable in production.
    //
    // Not sensitive: it is the HTTP status of a third-party call, never their
    // response body and never a credential.
    throw new ApiError(
      outcome.failure.kind === 'refused' ? 'INVALID_REQUEST' : 'UPSTREAM_UNAVAILABLE',
      outcome.failure.kind === 'refused'
        ? 'That content could not be read'
        : 'Could not read that just now',
      {
        details: {
          reason: outcome.failure.kind,
          upstreamStatus: outcome.failure.status ?? null,
        },
      },
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
}
