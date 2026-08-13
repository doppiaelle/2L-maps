import type { DraftRoute } from './draft';
import type { LatLng } from '@/lib/geo/haversine';

/**
 * The idempotency key for an optimization attempt.
 *
 * **It used to be the inputs, concatenated, and it overran the contract from
 * three stops upwards.** The key was
 * `${routeId}:${shape}:${origin}:${placeIds.join(',')}`; `optimizeRequestSchema`
 * bounds it at 128 characters. A Google place id is around 27 characters at its
 * shortest and far longer for an interpolated street address, so three stops
 * measured 133 and four measured 161 — a 400 `INVALID_REQUEST` before the
 * request reached the pipeline, reported on screen as "Could not optimize".
 * A two-stop route fitted, which is why the failure looked intermittent rather
 * than structural.
 *
 * Hashing fixes the length at a constant. Nothing reads the key's parts — the
 * server compares it for equality and nothing else — so the only properties it
 * has to keep are the two below, and a hash keeps both.
 */

/** Comfortably inside the schema's 128, with room for the route id in front. */
const FINGERPRINT_LENGTH = 16;

/**
 * FNV-1a, 64-bit, hex.
 *
 * The same function the shared cache key uses (`supabase/functions/_shared/cache-key.ts`),
 * deliberately duplicated rather than shared: the client bundle and the Deno
 * functions have no module in common, and an import across that boundary is a
 * dependency neither runtime can express. Both are ten lines and both are
 * tested; the duplication is cheaper than the coupling would be
 * (`CLAUDE.md` §12 rule 4 — duplicate once, abstract on the third).
 */
export function fingerprint(input: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * PRIME) & MASK;
  }

  return hash.toString(16).padStart(FINGERPRINT_LENGTH, '0');
}

/**
 * Derived from the draft, so an edit changes it and a retry does not.
 *
 * Two attempts on the same stops in the same order are the same work, and the
 * server should charge for it once. A *new* attempt after an edit must not
 * collide, or the server would answer with the previous route's result.
 *
 * The route id stays in the clear. It is a UUID of known length, it makes a key
 * legible in a log line, and keeping it outside the hash means two different
 * routes that happen to hold identical stops still get different keys — which is
 * what stops one route's result being served for another.
 */
export function idempotencyKeyFor(
  draft: DraftRoute,
  originCoordinate: LatLng | null = null,
): string {
  const stops = draft.stops.map((stop) => stop.placeId).join(',');
  const coordinate =
    originCoordinate === null
      ? 'none'
      : `${originCoordinate.latitude},${originCoordinate.longitude}`;
  const origin = draft.originIsCurrentLocation
    ? `current-location:${coordinate}`
    : `place:${draft.originPlaceId ?? 'first-stop'}`;

  // routeStart/routeEnd are included even though they currently map onto the
  // origin and shape fields too. They preserve the product meaning of the
  // request if the backend representation changes later, and keep “return to
  // start” separate from “return to current location” today.
  const work = [draft.shape, draft.routeStart, draft.routeEnd, origin, stops].join(':');
  return `${draft.routeId}:${fingerprint(work)}`;
}
