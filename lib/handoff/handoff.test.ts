import { HANDOFF_URL_MAX_LENGTH, type NavigationProviderId } from '@/types';

import {
  ALL_PROVIDERS,
  capabilitiesOf,
  estimatedHandoffCount,
  requiresCoordinates,
  strategyFor,
} from './capabilities';
import { planHandoff } from './chunking';
import { buildUrl, type HandoffPlace } from './urls';

/**
 * Every handoff strategy is tested against its capability matrix, and long
 * Italian addresses are tested against the URL ceiling. Both are non-negotiable
 * coverage (CLAUDE.md §5).
 *
 * The ceiling is the subtle one. Sizing chunks by counting stops produces a URL
 * that still opens — it simply does not contain the stops past the cut. The user
 * would discover the truncation by arriving at the wrong last stop.
 */

const place = (n: number, address?: string): HandoffPlace => ({
  placeId: `place-${n}`,
  coordinate: { latitude: 45.4 + n * 0.01, longitude: 9.1 + n * 0.01 },
  address: address ?? `Address ${n}`,
});

/** A realistic long Italian address — the case that breaches the ceiling early. */
const longItalianAddress = (n: number): string =>
  `Via Guglielmo Marconi ${n}, Frazione Santa Maria degli Angeli, ` +
  `Sesto San Giovanni, Città Metropolitana di Milano, Lombardia, Italia`;

/** A place with no coordinate — the post-expiry state (ADR-0007). */
const addressOnly = (n: number): HandoffPlace => ({
  placeId: `place-${n}`,
  coordinate: null,
  address: longItalianAddress(n),
});

const route = (count: number): HandoffPlace[] => Array.from({ length: count }, (_, i) => place(i));

describe('capability matrix', () => {
  it('only Google Maps accepts more than one stop', () => {
    // This asymmetry is the entire design problem the handoff module solves.
    expect(capabilitiesOf('google-maps').canChunkHandoff).toBe(true);
    expect(capabilitiesOf('waze').canChunkHandoff).toBe(false);
    expect(capabilitiesOf('apple-maps').canChunkHandoff).toBe(false);
  });

  it('maps each provider to a strategy', () => {
    expect(strategyFor('google-maps')).toBe('chunked');
    expect(strategyFor('waze')).toBe('leg-by-leg');
    expect(strategyFor('apple-maps')).toBe('leg-by-leg');
  });

  it('reports an unsupported capability rather than throwing', () => {
    // Liskov: every provider must be substitutable. A strategy that explodes on a
    // capability it lacks is not (CLAUDE.md §1).
    for (const provider of ALL_PROVIDERS) {
      expect(() => capabilitiesOf(provider)).not.toThrow();
      expect(typeof capabilitiesOf(provider).canChunkHandoff).toBe('boolean');
    }
  });

  it('only Waze requires coordinates', () => {
    expect(requiresCoordinates('waze')).toBe(true);
    expect(requiresCoordinates('google-maps')).toBe(false);
    expect(requiresCoordinates('apple-maps')).toBe(false);
  });

  it('estimates interruptions per provider', () => {
    // 12 intermediates: Google packs them, the others stop at every one.
    expect(estimatedHandoffCount('google-maps', 12)).toBe(2);
    expect(estimatedHandoffCount('waze', 12)).toBe(13);
    expect(estimatedHandoffCount('apple-maps', 12)).toBe(13);
  });
});

describe('URL building per provider', () => {
  it('Google Maps carries waypoints in one URL', () => {
    const result = buildUrl('google-maps', {
      origin: place(0),
      destination: place(3),
      waypoints: [place(1), place(2)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toContain('https://www.google.com/maps/dir/');
    expect(result.url).toContain('travelmode=driving');
    expect(decodeURIComponent(result.url)).toContain('|');
  });

  it('Waze takes coordinates and refuses when they have expired', () => {
    // No address form exists, so this is a blocked handoff with a stated cause,
    // not a degraded one.
    const expired = addressOnly(1);
    const result = buildUrl('waze', { origin: place(0), destination: expired, waypoints: [] });
    expect(result).toEqual({ ok: false, reason: 'coordinates-required' });
  });

  it('Waze builds from coordinates when they are fresh', () => {
    const result = buildUrl('waze', {
      origin: place(0),
      destination: place(1),
      waypoints: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toMatch(/^waze:\/\/\?ll=[\d.]+,[\d.]+&navigate=yes$/);
  });

  it('Apple Maps survives an expired coordinate because it accepts an address', () => {
    const result = buildUrl('apple-maps', {
      origin: place(0),
      destination: addressOnly(1),
      waypoints: [],
    });
    expect(result.ok).toBe(true);
  });

  it('reports a place with neither coordinate nor address as unresolvable', () => {
    const empty: HandoffPlace = { placeId: 'p', coordinate: null, address: null };
    expect(
      buildUrl('google-maps', { origin: place(0), destination: empty, waypoints: [] }),
    ).toEqual({ ok: false, reason: 'place-unresolvable' });
  });
});

describe('chunking against the URL ceiling', () => {
  it('the documented ceiling is 2048 characters', () => {
    expect(HANDOFF_URL_MAX_LENGTH).toBe(2048);
  });

  it('never emits a URL longer than the ceiling', () => {
    // The property that matters. A URL over the ceiling still opens — it simply
    // omits the stops past the cut, and the user discovers that by arriving
    // somewhere unexpected.
    const longRoute: HandoffPlace[] = Array.from({ length: 20 }, (_, i) => ({
      placeId: `p-${i}`,
      coordinate: null,
      address: longItalianAddress(i),
    }));
    const result = planHandoff('google-maps', longRoute);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const chunk of result.plan.chunks) {
      expect(chunk.url.length).toBeLessThanOrEqual(HANDOFF_URL_MAX_LENGTH);
    }
  });

  it('a typical long Italian address still reaches the waypoint cap', () => {
    // Measured: a 128-character address gives a 1,687-character URL at nine
    // waypoints, so the cap binds first and the ceiling never engages. "Nine is
    // typical" holds — the ceiling is the safety net for the exceptional case
    // below, not the usual limit.
    const longRoute: HandoffPlace[] = Array.from({ length: 12 }, (_, i) => ({
      placeId: `p-${i}`,
      coordinate: null,
      address: longItalianAddress(i),
    }));
    const result = planHandoff('google-maps', longRoute);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.chunks[0]?.segment.waypoints.length).toBe(9);
    expect(result.plan.wasLimitedByUrlLength).toBe(false);
  });

  it('an exceptionally long address cuts the chunk short and the plan says so', () => {
    // Addresses carrying c/o details, a building, a floor and an internal number
    // do reach this length, and they are exactly the case a fixed count of nine
    // would truncate silently.
    const verbose = (n: number): string =>
      `${longItalianAddress(n)}, presso Condominio Residenziale Le Terrazze del Parco, ` +
      `Scala C, Piano 4, Interno 27, citofono Bianchi-Rossi, ZTL area C`;

    const longRoute: HandoffPlace[] = Array.from({ length: 12 }, (_, i) => ({
      placeId: `p-${i}`,
      coordinate: null,
      address: verbose(i),
    }));
    const result = planHandoff('google-maps', longRoute);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.wasLimitedByUrlLength).toBe(true);

    const firstChunk = result.plan.chunks[0];
    expect(firstChunk).toBeDefined();
    expect(firstChunk?.segment.waypoints.length).toBeLessThan(9);
    expect(firstChunk?.url.length).toBeLessThanOrEqual(HANDOFF_URL_MAX_LENGTH);
  });

  it('short coordinate-based stops reach the waypoint cap instead', () => {
    const result = planHandoff('google-maps', route(12));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.wasLimitedByUrlLength).toBe(false);
    expect(result.plan.chunks[0]?.segment.waypoints.length).toBe(9);
  });

  it('chunks overlap so the route never has a gap', () => {
    // Chunk n's destination is chunk n+1's origin. Without this the user is asked
    // to navigate from a position the app never sent them to.
    const result = planHandoff('google-maps', route(20));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { chunks } = result.plan;
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i += 1) {
      expect(chunks[i + 1]?.segment.origin.placeId).toBe(chunks[i]?.segment.destination.placeId);
    }
  });

  it('covers every stop across the chunks, in order, with no omission', () => {
    const places = route(20);
    const result = planHandoff('google-maps', places);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const visited: string[] = [];
    for (const chunk of result.plan.chunks) {
      if (visited.length === 0) visited.push(chunk.segment.origin.placeId);
      for (const waypoint of chunk.segment.waypoints) visited.push(waypoint.placeId);
      visited.push(chunk.segment.destination.placeId);
    }
    expect(visited).toEqual(places.map((p) => p.placeId));
  });

  it('fails clearly when a single leg cannot fit', () => {
    // Splitting further is impossible, so this must be reported rather than
    // producing a truncated URL.
    const absurd: HandoffPlace[] = [
      { placeId: 'a', coordinate: null, address: 'x'.repeat(3000) },
      { placeId: 'b', coordinate: null, address: 'y'.repeat(3000) },
    ];
    expect(planHandoff('google-maps', absurd)).toEqual({
      ok: false,
      failure: { reason: 'single-leg-too-long' },
    });
  });
});

describe('leg-by-leg providers', () => {
  it.each(['waze', 'apple-maps'] as NavigationProviderId[])(
    '%s produces one handoff per leg',
    (provider) => {
      const places = route(5);
      const result = planHandoff(provider, places);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.chunks).toHaveLength(4);
      for (const chunk of result.plan.chunks) {
        expect(chunk.segment.waypoints).toHaveLength(0);
      }
    },
  );

  it('leg-by-leg is never limited by URL length', () => {
    // A single destination cannot breach 2,048 characters in practice.
    const result = planHandoff('apple-maps', route(25));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.wasLimitedByUrlLength).toBe(false);
    expect(result.plan.chunks).toHaveLength(24);
  });

  it('Waze reports the expired coordinate rather than silently skipping the stop', () => {
    const places = [place(0), addressOnly(1), place(2)];
    expect(planHandoff('waze', places)).toEqual({
      ok: false,
      failure: { reason: 'coordinates-required' },
    });
  });
});

describe('degenerate routes', () => {
  it.each(ALL_PROVIDERS)('%s rejects a route with fewer than two places', (provider) => {
    expect(planHandoff(provider, [])).toEqual({ ok: false, failure: { reason: 'too-few-places' } });
    expect(planHandoff(provider, [place(0)])).toEqual({
      ok: false,
      failure: { reason: 'too-few-places' },
    });
  });

  it.each(ALL_PROVIDERS)('%s handles a two-place route as a single handoff', (provider) => {
    const result = planHandoff(provider, [place(0), place(1)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.chunks).toHaveLength(1);
  });
});
