import type { LatLng } from '@/lib/geo/haversine';
import type { NavigationProviderId } from '@/types';

/**
 * Deep links for each navigation provider.
 *
 * These URL shapes are not contractual — no provider promises to keep them
 * working — which is why they live behind the `NavigationProvider` facade and are
 * versioned as a capability matrix (ADR-0004, docs/16_INTERNAL_NAVIGATION.md).
 *
 * Everything here is a pure string builder so the length ceiling can be measured
 * before a URL is opened. Chunk size is decided by measuring these outputs, never
 * by counting stops: a route of Italian addresses breaches 2,048 characters well
 * before it reaches nine waypoints.
 */

/** A place as a handoff target. Either identifier may be absent, and which one a
 *  provider needs differs — Waze takes coordinates only. */
export interface HandoffPlace {
  readonly placeId: string;
  /** Null when the coordinate cache has expired or was never populated. */
  readonly coordinate: LatLng | null;
  /** The formatted address, when one is cached. */
  readonly address: string | null;
}

export interface HandoffSegment {
  readonly origin: HandoffPlace;
  readonly destination: HandoffPlace;
  /** Stops passed through on the way. Empty for a leg-by-leg provider. */
  readonly waypoints: readonly HandoffPlace[];
}

/** Why a URL could not be built. Each has a distinct user-visible outcome. */
export type UrlFailure =
  /** Waze needs coordinates and this stop's cache has expired (ADR-0007). */
  | 'coordinates-required'
  /** Neither a coordinate nor an address is available for a stop. */
  | 'place-unresolvable';

export type UrlResult =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: UrlFailure };

/** Coordinates are preferred over the address: they are unambiguous, and they
 *  are shorter, which matters against the length ceiling. */
function locationToken(place: HandoffPlace): string | null {
  if (place.coordinate !== null) {
    return `${place.coordinate.latitude},${place.coordinate.longitude}`;
  }
  if (place.address !== null && place.address.length > 0) {
    return place.address;
  }
  return null;
}

/**
 * Google Maps universal link.
 *
 * Preferred over the `comgooglemaps://` scheme even on iOS, because the scheme
 * accepts a single destination while the universal link carries waypoints — and
 * it falls back to the web when the app is not installed, so it always resolves.
 */
export function buildGoogleMapsUrl(segment: HandoffSegment): UrlResult {
  const origin = locationToken(segment.origin);
  const destination = locationToken(segment.destination);
  if (origin === null || destination === null) {
    return { ok: false, reason: 'place-unresolvable' };
  }

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });

  if (segment.waypoints.length > 0) {
    const tokens: string[] = [];
    for (const waypoint of segment.waypoints) {
      const token = locationToken(waypoint);
      if (token === null) return { ok: false, reason: 'place-unresolvable' };
      tokens.push(token);
    }
    params.set('waypoints', tokens.join('|'));
  }

  return { ok: true, url: `https://www.google.com/maps/dir/?${params.toString()}` };
}

/**
 * Waze. One destination, coordinates only.
 *
 * There is no address form: a stop whose coordinates have expired cannot be
 * handed off to Waze at all until it is re-hydrated. That is a blocked handoff
 * with a stated cause, not a degraded one.
 */
export function buildWazeUrl(segment: HandoffSegment): UrlResult {
  const { coordinate } = segment.destination;
  if (coordinate === null) {
    return { ok: false, reason: 'coordinates-required' };
  }
  return {
    ok: true,
    url: `waze://?ll=${coordinate.latitude},${coordinate.longitude}&navigate=yes`,
  };
}

/** Apple Maps. One destination; accepts an address, so it survives an expired
 *  coordinate. */
export function buildAppleMapsUrl(segment: HandoffSegment): UrlResult {
  const destination = locationToken(segment.destination);
  if (destination === null) {
    return { ok: false, reason: 'place-unresolvable' };
  }
  const origin = locationToken(segment.origin);
  const params = new URLSearchParams({ daddr: destination, dirflg: 'd' });
  if (origin !== null) params.set('saddr', origin);

  return { ok: true, url: `maps://?${params.toString()}` };
}

export function buildUrl(provider: NavigationProviderId, segment: HandoffSegment): UrlResult {
  switch (provider) {
    case 'google-maps':
      return buildGoogleMapsUrl(segment);
    case 'waze':
      return buildWazeUrl(segment);
    case 'apple-maps':
      return buildAppleMapsUrl(segment);
  }
}
