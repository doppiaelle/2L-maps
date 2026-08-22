import { ApiError } from '../errors.ts';
import { logUpstreamRefusal, scrub, type UpstreamError } from './upstream-error.ts';

export interface HerePlace {
  readonly providerPlaceId: string;
  readonly formattedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface HereSearchPort {
  suggest: (
    input: string,
    options?: {
      readonly locale?: string | null;
      readonly bias?: { readonly lat: number; readonly lng: number } | null;
      readonly limit?: number;
    },
  ) => Promise<readonly HerePlace[]>;
  geocode: (address: string, region?: string) => Promise<HerePlace | null>;
}

interface HereSearchOptions {
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
}

export function createHereSearchAdapter(options: HereSearchOptions): HereSearchPort {
  const request = async (url: URL): Promise<readonly HerePlace[]> => {
    url.searchParams.set('apiKey', options.apiKey);

    let response: Response;
    try {
      response = await options.fetchImpl(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw unavailable();
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const providerError = readHereError(body, [
        url.searchParams.get('q') ?? '',
        url.searchParams.get('at') ?? '',
      ]);
      logUpstreamRefusal('here-search', response.status, providerError);
      throw unavailable(response.status, providerError);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw unavailable();
    }

    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new ApiError('INTERNAL', 'Something went wrong on our side');
    }

    return payload.items.flatMap((item: unknown) => {
      if (!isRecord(item) || !isRecord(item.position)) return [];
      const latitude = item.position.lat;
      const longitude = item.position.lng;
      const formattedAddress =
        isRecord(item.address) && typeof item.address.label === 'string'
          ? item.address.label
          : item.title;
      if (
        typeof item.id !== 'string' ||
        typeof formattedAddress !== 'string' ||
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return [];
      }
      return [
        {
          providerPlaceId: item.id,
          formattedAddress,
          latitude,
          longitude,
        },
      ];
    });
  };

  return {
    suggest: async (input, settings = {}) => {
      const url = new URL('https://autosuggest.search.hereapi.com/v1/autosuggest');
      url.searchParams.set('q', input);
      url.searchParams.set('limit', String(settings.limit ?? 8));
      if (settings.locale != null) url.searchParams.set('lang', settings.locale);
      const context = settings.bias ?? { lat: 41.8719, lng: 12.5674 };
      // HERE Autosuggest requires a spatial context. When GPS is not ready,
      // use the centre of Italy so the country filter remains valid rather than
      // sending an invalid country-only request.
      url.searchParams.set('at', context.lat + ',' + context.lng);
      url.searchParams.set('in', 'countryCode:ITA');
      return request(url);
    },
    geocode: async (address, region = 'IT') => {
      const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
      url.searchParams.set('q', address);
      url.searchParams.set('limit', '1');
      if (region.toUpperCase() === 'IT') url.searchParams.set('in', 'countryCode:ITA');
      const places = await request(url);
      return places[0] ?? null;
    },
  };
}

function unavailable(
  providerStatus?: number,
  providerError?: UpstreamError | null,
): ApiError {
  const details = {
    ...(providerStatus === undefined ? {} : { providerStatus }),
    ...(providerError?.status === undefined
      ? {}
      : { providerCode: providerError.status }),
    ...(providerError?.message === undefined || providerError.message === ''
      ? {}
      : { providerMessage: providerError.message }),
  };
  return new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service', {
    ...(Object.keys(details).length === 0 ? {} : { details }),
    degradationHint: 'RETRY_LATER',
  });
}

function readHereError(
  body: string,
  redact: readonly string[],
): UpstreamError | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const nested = isRecord(parsed.error) ? parsed.error : parsed;
  const status =
    typeof nested.status === 'string'
      ? nested.status
      : typeof nested.code === 'string'
        ? nested.code
        : typeof nested.code === 'number'
          ? String(nested.code)
          : typeof parsed.error === 'string'
            ? parsed.error
            : 'UNKNOWN';
  const message =
    typeof nested.message === 'string'
      ? nested.message
      : typeof nested.error_description === 'string'
        ? nested.error_description
        : typeof parsed.error_description === 'string'
          ? parsed.error_description
          : typeof parsed.error === 'string'
            ? parsed.error
            : '';

  return { status, message: scrub(message, redact) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
