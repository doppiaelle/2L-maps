import { HANDOFF_URL_MAX_LENGTH, type NavigationProviderId } from '@/types';

import { capabilitiesOf } from './capabilities';
import { buildUrl, type HandoffPlace, type HandoffSegment, type UrlFailure } from './urls';

/**
 * Splitting a route into handoffs.
 *
 * **Chunk size is measured, never counted.** Nine waypoints is the typical result
 * with Italian addresses, not a constant: a route whose stops are
 * "Via Guglielmo Marconi 145, Sesto San Giovanni, Milano" breaches the
 * 2,048-character ceiling several stops before it reaches nine. Sizing by count
 * would silently truncate the route — the URL still opens, and the stops past the
 * cut simply are not in it (docs/16_INTERNAL_NAVIGATION.md §5).
 *
 * **Chunks overlap by one stop on purpose.** Chunk *n*'s destination is chunk
 * *n+1*'s origin, so the user is never asked to navigate from a position the app
 * did not send them to.
 */

export interface ChunkPlan {
  readonly chunks: readonly HandoffChunk[];
  /** True when at least one chunk was cut short by the URL ceiling rather than by
   *  the waypoint count. Worth surfacing: it explains an unexpected extra stop. */
  readonly wasLimitedByUrlLength: boolean;
}

export interface HandoffChunk {
  readonly segment: HandoffSegment;
  readonly url: string;
}

export type ChunkFailure =
  | { readonly reason: UrlFailure }
  /** A single leg alone exceeds the ceiling — nothing can be split further. */
  | { readonly reason: 'single-leg-too-long' }
  | { readonly reason: 'too-few-places' };

export type ChunkResult =
  | { readonly ok: true; readonly plan: ChunkPlan }
  | { readonly ok: false; readonly failure: ChunkFailure };

/**
 * Build the handoff sequence for an ordered route.
 *
 * `places` is the full ordered route including the origin. A leg-by-leg provider
 * produces one chunk per leg; a chunked provider packs as many waypoints into
 * each URL as both the ceiling and the waypoint cap allow.
 */
export function planHandoff(
  provider: NavigationProviderId,
  places: readonly HandoffPlace[],
  maxUrlLength: number = HANDOFF_URL_MAX_LENGTH,
): ChunkResult {
  if (places.length < 2) {
    return { ok: false, failure: { reason: 'too-few-places' } };
  }

  const { canChunkHandoff, maxWaypointsPerHandoff } = capabilitiesOf(provider);
  if (!canChunkHandoff) {
    return planLegByLeg(provider, places);
  }

  const chunks: HandoffChunk[] = [];
  let wasLimitedByUrlLength = false;
  let startIndex = 0;

  while (startIndex < places.length - 1) {
    const origin = places[startIndex];
    if (origin === undefined) break;

    // Grow the chunk one stop at a time, keeping the last version that fit. The
    // ceiling is a property of the built URL, so the only way to know is to build
    // it (docs/16_INTERNAL_NAVIGATION.md §5).
    let best: { chunk: HandoffChunk; endIndex: number } | null = null;
    let stoppedOnLength = false;

    const maxEnd = Math.min(places.length - 1, startIndex + maxWaypointsPerHandoff + 1);

    for (let endIndex = startIndex + 1; endIndex <= maxEnd; endIndex += 1) {
      const destination = places[endIndex];
      if (destination === undefined) break;

      const segment: HandoffSegment = {
        origin,
        destination,
        waypoints: places.slice(startIndex + 1, endIndex),
      };

      const built = buildUrl(provider, segment);
      if (!built.ok) return { ok: false, failure: { reason: built.reason } };

      if (built.url.length > maxUrlLength) {
        stoppedOnLength = true;
        break;
      }
      best = { chunk: { segment, url: built.url }, endIndex };
    }

    if (best === null) {
      // Even origin → next stop alone does not fit. Splitting cannot help.
      return { ok: false, failure: { reason: 'single-leg-too-long' } };
    }

    if (stoppedOnLength) wasLimitedByUrlLength = true;

    chunks.push(best.chunk);
    // The overlap: this chunk's destination opens the next one.
    startIndex = best.endIndex;
  }

  return { ok: true, plan: { chunks, wasLimitedByUrlLength } };
}

function planLegByLeg(
  provider: NavigationProviderId,
  places: readonly HandoffPlace[],
): ChunkResult {
  const chunks: HandoffChunk[] = [];

  for (let i = 0; i < places.length - 1; i += 1) {
    const origin = places[i];
    const destination = places[i + 1];
    if (origin === undefined || destination === undefined) continue;

    const segment: HandoffSegment = { origin, destination, waypoints: [] };
    const built = buildUrl(provider, segment);
    if (!built.ok) return { ok: false, failure: { reason: built.reason } };

    chunks.push({ segment, url: built.url });
  }

  return { ok: true, plan: { chunks, wasLimitedByUrlLength: false } };
}
