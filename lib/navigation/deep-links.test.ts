import { isWorthLogging, parseDeepLink } from './deep-links';

/**
 * A deep link is untrusted input, so this reads like a parser test rather than
 * a navigation test: the interesting cases are the malformed ones, and every
 * one of them has to land somewhere useful rather than throwing
 * (docs/10_NAVIGATION_FLOW.md §10).
 */

const ROUTE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('the links the product defines', () => {
  it('opens a route on Plan, the working surface', () => {
    // Not a read-only detail screen: opening a route is something the user does
    // in order to work on it (docs/05_INFORMATION_ARCHITECTURE.md).
    expect(parseDeepLink(`twolmaps://route/${ROUTE_ID}`)).toEqual({
      ok: true,
      target: { kind: 'route', routeId: ROUTE_ID },
    });
  });

  it('opens history', () => {
    expect(parseDeepLink('twolmaps://history')).toEqual({ ok: true, target: { kind: 'history' } });
  });

  it('opens a settings subsection', () => {
    expect(parseDeepLink('twolmaps://settings/subscription')).toEqual({
      ok: true,
      target: { kind: 'settings', section: 'subscription' },
    });
  });

  it('opens settings itself when the subsection is unrecognised', () => {
    // The user asked for Settings and we can honour that much.
    expect(parseDeepLink('twolmaps://settings/nonsense')).toEqual({
      ok: true,
      target: { kind: 'settings', section: null },
    });
  });

  it('still honours the scheme written in the documentation', () => {
    // `2lmaps://` has been published and may already have been shared.
    expect(parseDeepLink(`2lmaps://route/${ROUTE_ID}`).ok).toBe(true);
  });
});

describe('links that are not ours, or not right', () => {
  it('rejects another app’s scheme', () => {
    expect(parseDeepLink('comgooglemaps://?daddr=Milano')).toEqual({
      ok: false,
      reason: 'not-ours',
    });
  });

  it('rejects a string that is not a URL at all', () => {
    expect(parseDeepLink('just some text').ok).toBe(false);
    expect(parseDeepLink('').ok).toBe(false);
  });

  it('refuses a route id that is not a UUID', () => {
    // The id reaches a query. A crafted one must not.
    for (const id of ['1', "' or 1=1 --", '../../admin', `${ROUTE_ID}extra`]) {
      expect(parseDeepLink(`twolmaps://route/${id}`)).toEqual({
        ok: false,
        reason: 'malformed-id',
      });
    }
  });

  it('refuses a route link with no id', () => {
    expect(parseDeepLink('twolmaps://route')).toEqual({ ok: false, reason: 'malformed-id' });
    expect(parseDeepLink('twolmaps://route/')).toEqual({ ok: false, reason: 'malformed-id' });
  });

  it('treats an unknown path as nothing to do, not as an error', () => {
    expect(parseDeepLink('twolmaps://checkout')).toEqual({ ok: false, reason: 'unknown-path' });
    expect(parseDeepLink('twolmaps://')).toEqual({ ok: false, reason: 'unknown-path' });
  });

  it('ignores query and fragment rather than accepting parameters', () => {
    // Nothing in this product takes a deep-link parameter, and accepting one
    // would be an input surface added for no feature.
    expect(parseDeepLink(`twolmaps://route/${ROUTE_ID}?admin=true#x`)).toEqual({
      ok: true,
      target: { kind: 'route', routeId: ROUTE_ID },
    });
  });

  it('is case-insensitive about the scheme and the id, as URLs are', () => {
    const result = parseDeepLink(`TWOLMAPS://route/${ROUTE_ID.toUpperCase()}`);
    expect(result).toEqual({ ok: true, target: { kind: 'route', routeId: ROUTE_ID } });
  });
});

describe('what is worth recording', () => {
  it('logs one of ours that did not parse', () => {
    // A truncated or tampered link is a defect or an attempt; either is worth
    // knowing about.
    expect(isWorthLogging('malformed-id')).toBe(true);
  });

  it('stays quiet about somebody else’s link', () => {
    expect(isWorthLogging('not-ours')).toBe(false);
    expect(isWorthLogging('unknown-path')).toBe(false);
  });
});
