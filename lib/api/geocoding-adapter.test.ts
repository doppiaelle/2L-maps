import { AUTOCOMPLETE_MIN_CHARACTERS, MAX_STOPS } from '@/types';

import { ApiClient } from './client';
import { createGeocodingProvider } from './geocoding-adapter';

/**
 * Address entry is 78% of COGS, so most of these tests are about calls this
 * adapter refuses to make. A test that asserts "no request was issued" is
 * asserting a cost, not a behaviour.
 */

interface Recorded {
  path: string;
  body: unknown;
}

const harness = (status: number, payload: unknown) => {
  const calls: Recorded[] = [];
  const client = new ApiClient({
    baseUrl: 'https://edge.test',
    getAccessToken: async () => 'jwt',
    fetchImpl: (async (url: string, init: { body?: string }) => {
      calls.push({
        path: String(url).replace('https://edge.test', ''),
        body: init.body === undefined ? null : JSON.parse(init.body),
      });
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      };
    }) as unknown as typeof fetch,
  });
  return { provider: createGeocodingProvider({ client }), calls };
};

const ok = (payload: unknown) => harness(200, payload);
const envelope = (code: string, details: Record<string, unknown> = {}) => ({
  error: { code, message: 'human readable', details },
});

const row = (placeId: string, index = 0) => ({
  index,
  placeId,
  formattedAddress: `${placeId} street`,
  lat: 45.7,
  lng: 9.7,
});

describe('calls this adapter refuses to make', () => {
  it('does not search below the character minimum', async () => {
    const { provider, calls } = ok({ suggestions: [] });
    const result = await provider.suggest('vi', 'token-1');

    expect(result).toEqual({ ok: true, suggestions: [] });
    expect(calls).toHaveLength(0);
  });

  it('searches at the minimum', async () => {
    const { provider, calls } = ok({ suggestions: [] });
    await provider.suggest('a'.repeat(AUTOCOMPLETE_MIN_CHARACTERS), 'token-1');
    expect(calls).toHaveLength(1);
  });

  it('counts characters after trimming, so spaces do not buy a request', async () => {
    const { provider, calls } = ok({ suggestions: [] });
    await provider.suggest('  vi  ', 'token-1');
    expect(calls).toHaveLength(0);
  });

  it('does not re-hydrate an empty set', async () => {
    // Every stop already has a fresh coordinate — the good case, not a reason
    // to ask the server for nothing.
    const { provider, calls } = ok({ resolved: [], unresolved: [] });
    expect(await provider.resolveBatch([])).toEqual({ ok: true, resolved: [], unresolved: [] });
    expect(calls).toHaveLength(0);
  });

  it('does not geocode an empty list', async () => {
    const { provider, calls } = ok({ resolved: [], unresolved: [] });
    expect(await provider.geocodeAddresses([])).toEqual({
      ok: true,
      resolved: [],
      unresolved: [],
    });
    expect(calls).toHaveLength(0);
  });

  it('refuses an oversized batch here rather than paying to be told', async () => {
    const { provider, calls } = ok({ resolved: [], unresolved: [] });
    const tooMany = Array.from({ length: MAX_STOPS + 1 }, (_, i) => `place-${i}`);

    const result = await provider.resolveBatch(tooMany);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('the session token', () => {
  it('is always sent, because without it every keystroke bills separately', async () => {
    const { provider, calls } = ok({ suggestions: [] });
    await provider.suggest('via roma', 'session-abc');

    expect(calls[0]?.path).toBe('/places-autocomplete');
    expect(calls[0]?.body).toMatchObject({ sessionToken: 'session-abc' });
  });
});

describe('partial success is the rule', () => {
  it('keeps the addresses that resolved and reports the ones that did not', async () => {
    // The failure this shape exists to prevent: thirty imported addresses
    // discarded because two lines were unreadable.
    const { provider } = ok({
      resolved: [row('ChIJ-a', 0), row('ChIJ-b', 2)],
      unresolved: [{ index: 1, input: 'via inesistente 999' }],
    });

    const result = await provider.geocodeAddresses(['a', 'bad', 'c']);
    if (!result.ok) throw new Error('expected success');
    expect(result.resolved).toHaveLength(2);
    expect(result.unresolved).toEqual(['via inesistente 999']);
  });

  it('reports an unresolved line as its text, not its index', async () => {
    // An index is meaningless in an error message, and matching it back to a
    // line is work every caller would otherwise repeat.
    const { provider } = ok({
      resolved: [],
      unresolved: [{ index: 0, input: 'qwertyuiop' }],
    });
    const result = await provider.geocodeAddresses(['qwertyuiop']);
    expect(result.ok === true && result.unresolved).toEqual(['qwertyuiop']);
  });

  it('reports a place_id that no longer resolves instead of dropping the stop', async () => {
    // Places are demolished, merged and re-issued. A saved route can carry a
    // key Google no longer knows; the stop survives without geometry.
    const { provider } = ok({
      resolved: [{ placeId: 'ChIJ-a', formattedAddress: 'a', lat: 45.7, lng: 9.7 }],
      unresolved: [{ placeId: 'ChIJ-gone' }],
    });

    const result = await provider.resolveBatch(['ChIJ-a', 'ChIJ-gone']);
    if (!result.ok) throw new Error('expected success');
    expect(result.resolved.map((p) => p.placeId)).toEqual(['ChIJ-a']);
    expect(result.unresolved).toEqual(['ChIJ-gone']);
  });

  it('carries both halves of a resolved row', async () => {
    // The durable key and the perishable coordinate arrive together (ADR-0007).
    const { provider } = ok({
      resolved: [{ placeId: 'ChIJ-x', formattedAddress: 'Via Roma 12', lat: 45.7, lng: 9.7 }],
      unresolved: [],
    });
    const result = await provider.resolveBatch(['ChIJ-x']);
    if (!result.ok) throw new Error('expected success');
    expect(result.resolved[0]).toEqual({
      placeId: 'ChIJ-x',
      formattedAddress: 'Via Roma 12',
      coordinate: { latitude: 45.7, longitude: 9.7 },
    });
  });
});

describe('parsing unstructured input', () => {
  it('sends text one way and an image the other, never both', async () => {
    const text = ok({ candidates: [], unparsed: [] });
    await text.provider.parse({ kind: 'text', text: 'via roma 12' });
    expect(text.calls[0]?.body).toEqual({ text: 'via roma 12', locale: null });

    const image = ok({ candidates: [], unparsed: [] });
    await image.provider.parse({ kind: 'image', base64: 'AAAA', locale: 'it-IT' });
    expect(image.calls[0]?.body).toEqual({ imageBase64: 'AAAA', locale: 'it-IT' });
  });

  it('returns candidates for review rather than resolving them', async () => {
    // A silently wrong address is a driver at the wrong door, so parsing and
    // geocoding stay separate steps with the user in between (ADR-0016).
    const { provider, calls } = ok({
      candidates: [{ index: 0, address: 'Via Roma 12, Bergamo' }],
      unparsed: ['e poi non so'],
    });

    const result = await provider.parse({ kind: 'text', text: '…' });
    expect(result).toEqual({
      ok: true,
      candidates: ['Via Roma 12, Bergamo'],
      unparsed: ['e poi non so'],
    });
    // One call. Nothing was geocoded.
    expect(calls.map((c) => c.path)).toEqual(['/parse-addresses']);
  });

  it('truncates an overlong parse instead of losing it', async () => {
    // The model does not know our stop ceiling. A paste that overshoots is a
    // user with a long list — give them the first MAX_STOPS to review and show
    // the rest as unparsed, rather than erroring and losing all of them.
    const { provider } = ok({
      candidates: Array.from({ length: MAX_STOPS + 3 }, (_, i) => ({
        index: i,
        address: `Via ${i}`,
      })),
      unparsed: [],
    });

    const result = await provider.parse({ kind: 'text', text: '…' });
    if (!result.ok) throw new Error('expected success');
    expect(result.candidates).toHaveLength(MAX_STOPS);
    expect(result.unparsed).toEqual([
      `Via ${MAX_STOPS}`,
      `Via ${MAX_STOPS + 1}`,
      `Via ${MAX_STOPS + 2}`,
    ]);
  });
});

describe('failures reach a field that can act on them', () => {
  it('sends a lapsed subscriber to the paywall', async () => {
    const { provider } = harness(402, envelope('NO_ENTITLEMENT'));
    const result = await provider.suggest('via roma', 't');
    expect(result).toEqual({ ok: false, failure: { kind: 'no-entitlement' } });
  });

  it('separates an exhausted monthly quota, which has a reset date', async () => {
    const { provider } = harness(
      429,
      envelope('QUOTA_EXHAUSTED', { resetsAt: '2026-09-01T00:00:00Z' }),
    );
    const result = await provider.geocodeAddresses(['a']);
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'quota-exhausted', resetsAt: '2026-09-01T00:00:00Z' },
    });
  });

  it('does not explain our own defect to the user', async () => {
    // A missing session token is our bug. There is nothing they can do about
    // it, so it reads as an upstream failure and alerts on our side.
    const { provider } = harness(400, envelope('MISSING_SESSION_TOKEN'));
    const result = await provider.suggest('via roma', '');
    expect(result).toEqual({ ok: false, failure: { kind: 'upstream-unavailable' } });
  });

  it('treats a response that breaks the contract as a failure, not a half-result', async () => {
    const { provider } = ok({ resolved: [{ placeId: 'ChIJ-a' }], unresolved: [] });
    const result = await provider.resolveBatch(['ChIJ-a']);
    expect(result).toEqual({ ok: false, failure: { kind: 'upstream-unavailable' } });
  });
});
