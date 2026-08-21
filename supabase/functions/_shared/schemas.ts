import { z } from 'zod';

import { MAX_STOPS, MIN_STOPS } from '../../../types/constants.ts';

/**
 * Input validation at the boundary.
 *
 * "Validate every Edge Function input against a schema before use"
 * (CLAUDE.md §9 rule 5). Data arriving over the network is `unknown` until parsed
 * — trusting a request shape is how production breaks quietly, and on a metered
 * endpoint it is also how a malformed request becomes a billed upstream call.
 *
 * The stop limits come from types/constants.ts, which cites the document that
 * owns them. Restating 25 here would put the number in a third place.
 */

/** Google place identifiers are opaque; we bound the length rather than the
 *  alphabet, so a format change upstream does not reject valid input. */
const placeId = z.string().min(1).max(512);

/**
 * A stop as the client sends it.
 *
 * `stopId` is the **client's** identifier and it is required, because the
 * response returns the order as a list of these. Ordering by `placeId` instead would
 * collapse two stops at the same address into one — two deliveries in the same
 * building is an ordinary Tuesday, not an edge case — and ordering by position
 * would make the reply meaningless the moment the client re-sorted anything.
 */
const stopInput = z.object({
  /**
   * The client's own id for this stop.
   *
   * **128, not 64.** The client used to build it as `${placeId}:${timestamp}`,
   * and a Google place id for an interpolated street address runs past 64 on its
   * own — so `/optimize` refused those routes with a 400 the pipeline never saw
   * and the logs never recorded. New ids are short and generated
   * (`lib/route/route-id.ts`), but a draft persisted before that change still
   * carries a long one, and refusing it would break the route a user already had
   * on screen rather than the code that created it.
   */
  stopId: z.string().min(1).max(128),
  placeId,
  /** A stop the user has pinned in place. Carried now, honoured when pinning
   *  ships — the field is documented, so accepting it costs nothing and
   *  rejecting it would break a client that sends what the contract promises. */
  isPinned: z.boolean().optional(),
  label: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

/**
 * `/optimize`.
 *
 * The stop count is enforced here as well as in the client. The client's check is
 * for the user's benefit — stating the limit before it is reached — and this one
 * is the enforcement: a client can be modified, and above 25 stops the request
 * would silently escalate to a tier that bills per stop (ADR-0011).
 */
export const optimizeRequestSchema = z.object({
  routeId: z.string().uuid(),
  origin: z.object({
    placeId: placeId.nullable(),
    isCurrentLocation: z.boolean(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  }),
  stops: z.array(stopInput).min(MIN_STOPS).max(MAX_STOPS),
  isRoundTrip: z.boolean(),
  departureTime: z.string().datetime().nullable().optional(),
  /** Makes a client retry after a timeout free rather than a second billed call. */
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;

/**
 * Provider-neutral coordinate routing for the ORS -> HERE migration.
 *
 * Identifiers belong to the app rather than a geocoder; server-side validation
 * rejects malformed or oversized routes before either paid provider is called.
 */
export const hybridOptimizeRequestSchema = z.object({
  stops: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        label: z.string().max(200).optional(),
      }),
    )
    .min(3)
    .max(MAX_STOPS),
});

export type HybridOptimizeRequest = z.infer<typeof hybridOptimizeRequestSchema>;

/**
 * `/places-autocomplete`.
 *
 * The session token is required, not optional. Without one every keystroke bills
 * as a separate request instead of falling under session pricing, which is the
 * single largest way this product's COGS can escape control
 * (docs/31_COST_MODEL.md). A request without a token is a client defect and is
 * rejected as one rather than quietly billed.
 */
export const autocompleteRequestSchema = z.object({
  input: z.string().min(1).max(200),
  sessionToken: z.string().min(1).max(128),
  // **`.nullable()` as well as `.optional()`, and the omission was fatal.** In
  // Zod, `.optional()` accepts an absent key and rejects an explicit `null`. The
  // client sends `locale: null` and `bias: null` when it has neither — which is
  // every search — so this schema rejected every request the app has ever made,
  // with 400 INVALID_REQUEST, before Google was ever contacted.
  //
  // Nothing caught it because both halves were tested separately: the schema
  // against hand-written fixtures that used `undefined`, the client against a
  // mocked server that accepted anything. `supabase/test/client-contract.test.ts`
  // now runs one against the other.
  locale: z.string().min(2).max(35).nullable().optional(),
  // `lat`/`lng`, per docs/33_API_CONTRACTS.md §`/places-autocomplete`, which is
  // also what the client sends. This schema asked for `latitude`/`longitude` and
  // a mandatory `radiusMeters` the contract never mentions — so even a request
  // that supplied a bias would have been refused. The document is the source
  // (`CLAUDE.md` §13 rule 9); this was the copy that drifted.
  bias: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
});

export type AutocompleteRequest = z.infer<typeof autocompleteRequestSchema>;

/**
 * `/geocode` — batch resolution for list import.
 *
 * Used instead of autocomplete for bulk entry because it is materially cheaper,
 * and it returns resolved and unresolved rows separately so the client can offer
 * partial success rather than failing the whole import.
 */
export const geocodeRequestSchema = z.object({
  addresses: z.array(z.string().min(1).max(500)).min(1).max(MAX_STOPS),
  region: z.string().length(2).optional(),
});

export type GeocodeRequest = z.infer<typeof geocodeRequestSchema>;

/** HERE requests are private, provider-neutral and never require Google session tokens. */
export const hereSearchRequestSchema = z.object({
  input: z.string().trim().min(1).max(200),
  locale: z.string().min(2).max(35).nullable().optional(),
  bias: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export const hereGeocodeRequestSchema = z.object({
  addresses: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_STOPS),
  region: z.string().length(2).optional(),
});

export const hereRefreshRequestSchema = z.object({
  savedPlaceIds: z.array(z.string().uuid()).min(1).max(MAX_STOPS),
});


/**
 * `/place-details` — the re-hydration path.
 *
 * `place_id` is storable indefinitely; the coordinates beside it expire after 30
 * consecutive days and are then null (ADR-0007). This endpoint turns the durable
 * keys back into a usable route, so its batch ceiling is the route ceiling.
 */
export const placeDetailsRequestSchema = z.object({
  placeIds: z.array(placeId).min(1).max(MAX_STOPS),
});

export type PlaceDetailsRequest = z.infer<typeof placeDetailsRequestSchema>;

/**
 * `/parse-addresses` — unstructured input to candidate addresses (ADR-0016).
 *
 * `text` and `imageBase64` are mutually exclusive, and the refinement below is
 * what makes that structural rather than a convention. Sending both would be
 * ambiguous about which one to bill for, and ambiguity on a metered endpoint
 * resolves in the expensive direction.
 *
 * The input bounds are cost controls, not politeness. Four thousand characters
 * is a long pasted message; beyond it we are paying to parse a document the user
 * did not mean to send.
 */
export const parseAddressesRequestSchema = z
  .object({
    text: z.string().min(1).max(4000).optional(),
    imageBase64: z.string().min(1).max(7_000_000).optional(),
    locale: z.string().max(35).nullable().optional(),
  })
  .refine((value) => (value.text === undefined) !== (value.imageBase64 === undefined), {
    message: 'exactly one of text or imageBase64',
  });

export type ParseAddressesRequest = z.infer<typeof parseAddressesRequestSchema>;

/**
 * The RevenueCat webhook.
 *
 * Deliberately permissive about fields we do not read: RevenueCat adds them, and
 * a strict schema would start rejecting valid events on their release schedule
 * rather than ours. The signature is what establishes authenticity; the schema
 * only establishes shape.
 */
export const revenueCatWebhookSchema = z.object({
  event: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().min(1),
    product_id: z.string().nullable().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    period_type: z.string().nullable().optional(),
    /** When RevenueCat says the event happened. Ordering by this rather than by
     *  arrival is what stops a cancellation that overtook its own renewal from
     *  locking a paying user out — delivery is not ordered. */
    event_timestamp_ms: z.number().nullable().optional(),
  }),
});

export type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;

/** Parsed input, or the taxonomy code the caller should respond with. */
export type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: 'INVALID_REQUEST' | 'MISSING_SESSION_TOKEN';
      /** The paths that failed, for the log line only — never their values, and
       *  never sent to the client. */
      readonly fields?: readonly string[];
    };

/**
 * Parse a request body.
 *
 * The failure detail never reaches the client. A malformed request is our own
 * defect (docs/33_API_CONTRACTS.md §6): the client built it, so the user cannot
 * act on the specifics, and echoing them back describes our internals to whoever
 * sent the request.
 */
export function parseRequest<T>(schema: z.ZodType<T>, body: unknown): ParseOutcome<T> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, value: result.data };

  // Autocomplete without a session token gets its own code, because it is the
  // one malformed request with a specific and expensive consequence.
  const missingSessionToken = result.error.issues.some((issue) => issue.path[0] === 'sessionToken');

  // **Which fields, never their values.** The handler logs these so a rejection
  // is findable in production — the two length overruns that broke `/optimize`
  // for weeks left no trace of any kind. A path is a field name we chose;
  // a value could be an address, and an address may not reach a log line
  // (`CLAUDE.md` §9 rule 7).
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
    .filter((path) => path.length > 0)
    .slice(0, 10);

  return {
    ok: false,
    code: missingSessionToken ? 'MISSING_SESSION_TOKEN' : 'INVALID_REQUEST',
    fields,
  };
}
