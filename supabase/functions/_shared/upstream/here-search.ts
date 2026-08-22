import { ApiError } from '../errors.ts';

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
      console.error(JSON.stringify({ event: 'here_upstream_http_error', status: response.status }));
      throw unavailable(response.status);
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
      if (settings.bias != null) {
        url.searchParams.set('at', settings.bias.lat + ',' + settings.bias.lng);
      } else {
        url.searchParams.set('in', 'countryCode:ITA');
      }
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

function unavailable(providerStatus?: number): ApiError {
  return new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service', {
    ...(providerStatus === undefined ? {} : { details: { providerStatus } }),
    degradationHint: 'RETRY_LATER',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
