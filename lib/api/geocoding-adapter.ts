import { z } from 'zod';

import type {
  GeocodingFailure,
  GeocodingProvider,
  ParseInput,
  PlaceSuggestion,
  ResolvedPlace,
} from '@/lib/providers/types';
import { AUTOCOMPLETE_MIN_CHARACTERS, MAX_STOPS } from '@/types';
import type { PlaceId } from '@/types';

import type { ApiClient, ApiFailure } from './client';

/**
 * The concrete `GeocodingProvider`, over our own Edge Functions.
 *
 * This adapter guards the most expensive line in the product. Address entry is
 * 78% of per-user COGS (docs/31_COST_MODEL.md §8), so the checks here are not
 * defensive programming — each one is a request we decline to pay for:
 *
 * - **Below the character minimum, we do not call.** The server rejects it too,
 *   but a 400 still costs a round trip and a cold start.
 * - **An empty batch does not call.** Twenty-five stops all cached locally is
 *   the good case, not a reason to ask for nothing.
 * - **A batch over the ceiling is refused here**, rather than sent for the
 *   server to reject after it has already parsed it.
 *
 * Partial success is the rule throughout. An import of thirty addresses where
 * two lines are unreadable yields twenty-eight stops and two visible rows — a
 * response that discards the batch because of one bad line is the failure this
 * whole shape exists to prevent.
 */

const suggestionSchema = z.object({
  placeId: z.string(),
  primaryText: z.string(),
  secondaryText: z.string(),
});

const suggestResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
});

/** A resolved row carries both halves: the durable key and the perishable
 *  coordinate (ADR-0007). */
const resolvedRowSchema = z.object({
  placeId: z.string(),
  formattedAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const geocodeResponseSchema = z.object({
  resolved: z.array(resolvedRowSchema.extend({ index: z.number().int() })),
  unresolved: z.array(z.object({ index: z.number().int(), input: z.string() })),
});

const placeDetailsResponseSchema = z.object({
  resolved: z.array(resolvedRowSchema),
  unresolved: z.array(z.object({ placeId: z.string() })),
});

const parseResponseSchema = z.object({
  candidates: z.array(z.object({ index: z.number().int(), address: z.string() })),
  unparsed: z.array(z.string()),
});

export interface GeocodingAdapterOptions {
  readonly client: ApiClient;
}

const toPlace = (row: z.infer<typeof resolvedRowSchema>): ResolvedPlace => ({
  placeId: row.placeId,
  formattedAddress: row.formattedAddress,
  coordinate: { latitude: row.lat, longitude: row.lng },
});

export function createGeocodingProvider(options: GeocodingAdapterOptions): GeocodingProvider {
  const { client } = options;

  return {
    suggest: async (input, sessionToken, opts) => {
      // Not a validation nicety: below the minimum the server answers 400 and we
      // have paid a round trip to be told what we already knew. The debounce
      // upstream and this check are the same cost decision seen twice.
      if (input.trim().length < AUTOCOMPLETE_MIN_CHARACTERS) {
        return { ok: true, suggestions: [] };
      }

      const result = await client.post(
        '/places-autocomplete',
        {
          input,
          // Mandatory. Without it Places bills every keystroke as its own
          // session instead of one (docs/31_COST_MODEL.md).
          sessionToken,
          bias:
            opts?.bias === undefined ? null : { lat: opts.bias.latitude, lng: opts.bias.longitude },
          locale: opts?.locale ?? null,
        },
        suggestResponseSchema,
      );

      if (!result.ok) return { ok: false, failure: toGeocodingFailure(result.failure) };

      const suggestions: readonly PlaceSuggestion[] = result.data.suggestions;
      return { ok: true, suggestions };
    },

    resolveBatch: async (placeIds: readonly PlaceId[]) => {
      // Every stop already has a fresh coordinate. Asking anyway would be a
      // billed request for data we hold.
      if (placeIds.length === 0) {
        return { ok: true, resolved: [], unresolved: [] };
      }
      if (placeIds.length > MAX_STOPS) {
        return { ok: false, failure: { kind: 'upstream-unavailable' } };
      }

      const result = await client.post('/place-details', { placeIds }, placeDetailsResponseSchema);
      if (!result.ok) return { ok: false, failure: toGeocodingFailure(result.failure) };

      return {
        ok: true,
        resolved: result.data.resolved.map(toPlace),
        // A `place_id` Google no longer recognises is reported, never dropped:
        // the stop stays in the route without geometry and the user is told
        // which one needs re-entering (CLAUDE.md §0 rule 3).
        unresolved: result.data.unresolved.map((row) => row.placeId),
      };
    },

    geocodeAddresses: async (addresses: readonly string[]) => {
      if (addresses.length === 0) {
        return { ok: true, resolved: [], unresolved: [] };
      }
      if (addresses.length > MAX_STOPS) {
        return { ok: false, failure: { kind: 'upstream-unavailable' } };
      }

      const result = await client.post(
        '/geocode',
        { addresses, region: 'IT' },
        geocodeResponseSchema,
      );
      if (!result.ok) return { ok: false, failure: toGeocodingFailure(result.failure) };

      return {
        ok: true,
        resolved: result.data.resolved.map(toPlace),
        // Reported as the text the user typed, not as an index. An index is
        // meaningless in an error message, and matching it back to a line is
        // work every caller would otherwise repeat.
        unresolved: result.data.unresolved.map((row) => row.input),
      };
    },

    parse: async (input: ParseInput) => {
      const result = await client.post('/parse-addresses', toParseBody(input), parseResponseSchema);
      if (!result.ok) return { ok: false, failure: toGeocodingFailure(result.failure) };

      // Truncated rather than rejected. The model does not know our stop
      // ceiling, and a paste that overshoots it is a user with a long list —
      // giving them the first MAX_STOPS to review beats an error that loses all
      // of them. The remainder surfaces as unparsed so nothing vanishes.
      const all = result.data.candidates;
      const kept = all.slice(0, MAX_STOPS);
      const overflow = all.slice(MAX_STOPS).map((row) => row.address);

      return {
        ok: true,
        candidates: kept.map((row) => row.address),
        unparsed: [...result.data.unparsed, ...overflow],
      };
    },
  };
}

function toParseBody(input: ParseInput): Record<string, unknown> {
  const locale = input.locale ?? null;
  return input.kind === 'text'
    ? { text: input.text, locale }
    : { imageBase64: input.base64, locale };
}

/**
 * Translate a transport failure into something an address field can act on.
 *
 * Narrower than the routing taxonomy on purpose. There is no degraded path for
 * an address — a stop either resolves or it does not — so the only distinctions
 * worth keeping are the ones that change what the user is told to do: subscribe,
 * wait for the month to turn, reconnect, or try again.
 */
function toGeocodingFailure(failure: ApiFailure): GeocodingFailure {
  switch (failure.code) {
    case 'NO_ENTITLEMENT':
      return { kind: 'no-entitlement' };

    case 'QUOTA_EXHAUSTED':
      return {
        kind: 'quota-exhausted',
        resetsAt:
          typeof failure.details['resetsAt'] === 'string' ? failure.details['resetsAt'] : '',
      };

    case 'NETWORK_UNAVAILABLE':
      return { kind: 'offline' };

    // A missing session token is our defect, not the user's, and there is
    // nothing they can do about it — so it reads as an upstream failure and
    // alerts on our side rather than explaining our bug to them.
    case 'MISSING_SESSION_TOKEN':
    case 'RATE_LIMITED':
    case 'INVALID_REQUEST':
    case 'UPSTREAM_TIMEOUT':
    case 'UPSTREAM_UNAVAILABLE':
    case 'MALFORMED_RESPONSE':
    case 'INTERNAL':
    case 'UNAUTHENTICATED':
    case 'PARTIAL_RESULT':
    default:
      return { kind: 'upstream-unavailable' };
  }
}
