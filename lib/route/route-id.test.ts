import { isRouteId, newRouteId } from './route-id';

/**
 * A new route's identifier.
 *
 * The property under test is not "looks like a UUID" but "the server accepts
 * it". The store used the literal `'draft'` and no screen ever replaced it, so
 * the first optimization of every new install would have been refused 400 by
 * `z.string().uuid()` — a wall waiting one step past the search that was already
 * broken.
 */

// The pattern `z.string().uuid()` enforces, restated here because this test's
// whole purpose is to check against the server's rule rather than our own.
const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('a new route id', () => {
  it('is a shape the optimize endpoint will accept', () => {
    expect(newRouteId()).toMatch(SERVER_UUID);
  });

  it('sets the version and variant rather than leaving them to chance', () => {
    // A generator that randomises all sixteen bytes produces something that
    // reads as a UUID and fails validation roughly fifteen times in sixteen.
    // Pinned randomness makes that failure deterministic instead of flaky.
    const allZero = newRouteId(() => 0);
    const allMax = newRouteId(() => 0.9999999);

    expect(allZero).toMatch(SERVER_UUID);
    expect(allMax).toMatch(SERVER_UUID);
    expect(allZero[14]).toBe('4');
    expect(allMax[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(allMax[19]);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRouteId()));
    expect(ids.size).toBe(200);
  });
});

describe('recognising a stored id', () => {
  it('accepts what the generator produces', () => {
    expect(isRouteId(newRouteId())).toBe(true);
  });

  it('rejects the literal the store used to ship with', () => {
    // The migration hinges on this: a draft persisted before route ids were real
    // has to be given one rather than carried forward into a 400.
    expect(isRouteId('draft')).toBe(false);
  });

  it('rejects anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(isRouteId(value)).toBe(false);
    }
  });
});
