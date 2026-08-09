/**
 * The Places API (New) adapters — autocomplete, details, geocoding.
 *
 * These three carry 78% of this product's COGS between them
 * (docs/31_COST_MODEL.md §8), so every request shape here is a cost decision:
 *
 * - **The session token is mandatory on autocomplete.** Without it Places bills
 *   each keystroke as its own request instead of the whole session as one. It is
 *   a required parameter of the function rather than an option, so it cannot be
 *   forgotten at a call site.
 * - **Field masks are minimal.** Places prices by requested field the same way
 *   Routes does. Autocomplete buys the suggestion text and the id; details buys
 *   the location and the formatted address. Nothing buys photos, opening hours,
 *   or reviews, because nothing renders them.
 * - **Details and geocoding are batched by the caller**, which is why they take
 *   arrays: twenty-five sequential lookups cost twenty-five times one batch.
 *
 * The 30-day coordinate rule (ADR-0007) lives above this layer. These adapters
 * return what Google said; the caller decides what may be stored and for how
 * long.
 */

const AUTOCOMPLETE_ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places';
const GEOCODE_ENDPOINT = 'https://geocode.googleapis.com/v1/geocode/address';

/** Suggestion text and the id, and nothing else. */
export const FIELD_MASK_AUTOCOMPLETE =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat';

/** What a stop needs to be drawn and handed off. */
export const FIELD_MASK_DETAILS = 'id,formattedAddress,location';

export interface PlaceSuggestionResult {
  readonly placeId: string;
  readonly primaryText: string;
  readonly secondaryText: string;
}

export interface ResolvedPlaceResult {
  readonly placeId: string;
  readonly formattedAddress: string;
  readonly lat: number;
  readonly lng: number;
}

export type PlacesFailure =
  | { readonly kind: 'unreachable'; readonly retryable: true }
  | { readonly kind: 'timeout'; readonly retryable: true }
  | { readonly kind: 'rejected'; readonly retryable: false; readonly status: number }
  | { readonly kind: 'malformed'; readonly retryable: false };

export interface PlacesAdapterOptions {
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs?: number;
}

type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: PlacesFailure };

export function createPlacesAdapter(options: PlacesAdapterOptions) {
  const { apiKey, fetchImpl } = options;
  const timeoutMs = options.timeoutMs ?? 5_000;

  const call = async (
    url: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
    fieldMask: string,
  ): Promise<Outcome<unknown>> => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method,
        signal: timeout.signal,
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      return {
        ok: false,
        failure: timeout.signal.aborted
          ? { kind: 'timeout', retryable: true }
          : { kind: 'unreachable', retryable: true },
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return {
        ok: false,
        failure:
          response.status >= 500
            ? { kind: 'unreachable', retryable: true }
            : { kind: 'rejected', retryable: false, status: response.status },
      };
    }

    return { ok: true, value: await response.json().catch(() => null) };
  };

  return {
    /**
     * Autocomplete. `sessionToken` is a required parameter, not an option —
     * the type system is doing cost control here.
     */
    suggest: async (
      input: string,
      sessionToken: string,
      opts: { readonly locale?: string; readonly bias?: { lat: number; lng: number } } = {},
    ): Promise<Outcome<readonly PlaceSuggestionResult[]>> => {
      const outcome = await call(
        AUTOCOMPLETE_ENDPOINT,
        {
          method: 'POST',
          body: {
            input,
            sessionToken,
            ...(opts.locale === undefined ? {} : { languageCode: opts.locale }),
            ...(opts.bias === undefined
              ? {}
              : {
                  locationBias: {
                    circle: {
                      center: { latitude: opts.bias.lat, longitude: opts.bias.lng },
                      radius: 50_000,
                    },
                  },
                }),
          },
        },
        FIELD_MASK_AUTOCOMPLETE,
      );

      if (!outcome.ok) return outcome;
      const suggestions = readSuggestions(outcome.value);
      return suggestions === null
        ? { ok: false, failure: { kind: 'malformed', retryable: false } }
        : { ok: true, value: suggestions };
    },

    /**
     * Place details, one `place_id` at a time.
     *
     * Places has no batch details endpoint, so the batching the caller sees is
     * concurrency here. A failure on one id does not fail the batch — the caller
     * reports it as unresolved, and the stop survives without geometry
     * (`CLAUDE.md` §0 rule 3).
     */
    detailsFor: async (
      placeIds: readonly string[],
    ): Promise<{
      readonly resolved: readonly ResolvedPlaceResult[];
      readonly unresolved: readonly string[];
      /** Set when every single lookup failed for a retryable reason: that is an
       *  outage, not twenty-five demolished buildings, and the caller should
       *  say so rather than reporting the whole route unresolvable. */
      readonly outage: PlacesFailure | null;
    }> => {
      const results = await Promise.all(
        placeIds.map(async (placeId) => {
          const outcome = await call(
            `${DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}`,
            { method: 'GET' },
            FIELD_MASK_DETAILS,
          );
          if (!outcome.ok) return { placeId, place: null, failure: outcome.failure };
          const place = readPlace(outcome.value, placeId);
          return { placeId, place, failure: null };
        }),
      );

      const resolved = results.flatMap((r) => (r.place === null ? [] : [r.place]));
      const unresolved = results.flatMap((r) => (r.place === null ? [r.placeId] : []));

      const retryableFailures = results.filter((r) => r.failure?.retryable === true);
      const outage =
        resolved.length === 0 && retryableFailures.length === results.length && results.length > 0
          ? (retryableFailures[0]?.failure ?? null)
          : null;

      return { resolved, unresolved, outage };
    },

    /**
     * Geocode free-text addresses.
     *
     * Index-preserving on purpose: the caller matched each row to a line the
     * user typed, and losing that correspondence turns "row 4 could not be
     * found" into "something could not be found".
     */
    geocode: async (
      addresses: readonly string[],
      region: string,
    ): Promise<{
      readonly resolved: readonly (ResolvedPlaceResult & { index: number })[];
      readonly unresolved: readonly { index: number; input: string }[];
      readonly outage: PlacesFailure | null;
    }> => {
      const results = await Promise.all(
        addresses.map(async (address, index) => {
          const outcome = await call(
            `${GEOCODE_ENDPOINT}/${encodeURIComponent(address)}?regionCode=${encodeURIComponent(region)}`,
            { method: 'GET' },
            FIELD_MASK_DETAILS,
          );
          if (!outcome.ok) return { index, address, place: null, failure: outcome.failure };
          return { index, address, place: readGeocodeResult(outcome.value), failure: null };
        }),
      );

      const resolved = results.flatMap((r) =>
        r.place === null ? [] : [{ ...r.place, index: r.index }],
      );
      const unresolved = results.flatMap((r) =>
        r.place === null ? [{ index: r.index, input: r.address }] : [],
      );

      const retryableFailures = results.filter((r) => r.failure?.retryable === true);
      const outage =
        resolved.length === 0 && retryableFailures.length === results.length && results.length > 0
          ? (retryableFailures[0]?.failure ?? null)
          : null;

      return { resolved, unresolved, outage };
    },
  };
}

function readSuggestions(payload: unknown): readonly PlaceSuggestionResult[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = (payload as Record<string, unknown>)['suggestions'];
  // No suggestions is a valid answer — the user typed something that matches
  // nothing — and an absent key means the same thing.
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;

  const suggestions: PlaceSuggestionResult[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const prediction = (entry as Record<string, unknown>)['placePrediction'];
    if (typeof prediction !== 'object' || prediction === null) continue;

    const p = prediction as Record<string, unknown>;
    const placeId = typeof p['placeId'] === 'string' ? p['placeId'] : null;
    if (placeId === null) continue;

    const format = p['structuredFormat'];
    const { primary, secondary } = readStructuredFormat(format);
    suggestions.push({ placeId, primaryText: primary, secondaryText: secondary });
  }
  return suggestions;
}

function readStructuredFormat(value: unknown): { primary: string; secondary: string } {
  if (typeof value !== 'object' || value === null) return { primary: '', secondary: '' };
  const format = value as Record<string, unknown>;
  return {
    primary: readText(format['mainText']),
    secondary: readText(format['secondaryText']),
  };
}

function readText(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const text = (value as Record<string, unknown>)['text'];
  return typeof text === 'string' ? text : '';
}

function readPlace(payload: unknown, fallbackId: string): ResolvedPlaceResult | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const place = payload as Record<string, unknown>;

  const location = place['location'];
  if (typeof location !== 'object' || location === null) return null;
  const loc = location as Record<string, unknown>;

  const lat = loc['latitude'];
  const lng = loc['longitude'];
  const formattedAddress = place['formattedAddress'];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (typeof formattedAddress !== 'string') return null;

  // Google may return the canonical id when the one we asked with has been
  // superseded. Preferring theirs keeps the stored key current.
  const id = typeof place['id'] === 'string' ? place['id'] : fallbackId;
  return { placeId: id, formattedAddress, lat, lng };
}

function readGeocodeResult(payload: unknown): ResolvedPlaceResult | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const results = (payload as Record<string, unknown>)['results'];
  if (!Array.isArray(results) || results.length === 0) return null;

  // The first result only. An ambiguous address resolved to five candidates is
  // a row the user should correct, not one we should guess at.
  const place = readPlace(results[0], '');

  // Here there is no id to fall back to — we asked with an address, not a key.
  // A row without one is unresolved, because an empty string stored as the
  // durable half of a stop is worse than no stop at all (ADR-0007).
  return place === null || place.placeId === '' ? null : place;
}
