import { addressNoticeOf } from './notice';

/**
 * Six words for every cause was the defect.
 *
 * "Address needs refreshing" appeared for a lookup still in flight, one that had
 * failed, an exhausted allowance and a dead radio alike — and offered no way to
 * refresh anything. Each of these cases has a different next action, and a test
 * per case is what stops them collapsing back into one sentence.
 */

const quiet = { failure: null, unresolvedCount: 0, isLoading: false } as const;

describe('while the answer is still coming', () => {
  it('says nothing at all', () => {
    // A warning that resolves itself a moment later teaches the user to ignore
    // warnings.
    expect(addressNoticeOf({ ...quiet, isLoading: true })).toBeNull();
  });

  it('stays quiet even with a failure from the previous attempt', () => {
    expect(
      addressNoticeOf({ failure: { kind: 'offline' }, unresolvedCount: 3, isLoading: true }),
    ).toBeNull();
  });
});

describe('when everything resolved', () => {
  it('says nothing', () => {
    expect(addressNoticeOf(quiet)).toBeNull();
  });
});

describe('when the batch failed', () => {
  it('offers a retry for a dead connection, which retrying can fix', () => {
    const notice = addressNoticeOf({ ...quiet, failure: { kind: 'offline' } });
    expect(notice).toMatchObject({ kind: 'offline', canRetry: true });
  });

  it('offers a retry for our own outage, and names it as ours', () => {
    const notice = addressNoticeOf({ ...quiet, failure: { kind: 'upstream-unavailable' } });
    expect(notice?.canRetry).toBe(true);
    expect(notice?.detail).toMatch(/our side/i);
  });

  it('refuses to offer a retry against a spent allowance', () => {
    // A button that cannot help is worse than no button: it invites the user to
    // keep pressing it.
    const notice = addressNoticeOf({
      ...quiet,
      failure: { kind: 'quota-exhausted', resetsAt: '2026-09-01T00:00:00.000Z' },
    });
    expect(notice).toMatchObject({ kind: 'quota', canRetry: false });
  });

  it('refuses to offer a retry against a plan that does not include it', () => {
    expect(addressNoticeOf({ ...quiet, failure: { kind: 'no-entitlement' } })).toMatchObject({
      canRetry: false,
    });
  });

  it('says the route still works, whatever the cause', () => {
    // The reassurance is the actionable part: the stops, the order and the
    // handoff do not depend on the address text.
    for (const failure of [
      { kind: 'offline' },
      { kind: 'upstream-unavailable' },
      { kind: 'no-entitlement' },
      { kind: 'quota-exhausted', resetsAt: '2026-09-01T00:00:00.000Z' },
    ] as const) {
      expect(addressNoticeOf({ ...quiet, failure })?.detail).toMatch(/route|stops/i);
    }
  });

  it('has something to say for a failure kind it has never seen', () => {
    // The transport's taxonomy can grow. Falling through to nothing on screen
    // would reintroduce the silence this module exists to end.
    const notice = addressNoticeOf({
      ...quiet,
      // A kind the union does not have today, which is the point.
      failure: { kind: 'something-new' } as never,
    });
    expect(notice).not.toBeNull();
  });
});

describe('when the server answered but could not place some ids', () => {
  it('counts them, because "some" is not actionable', () => {
    expect(addressNoticeOf({ ...quiet, unresolvedCount: 3 })?.title).toContain('3');
  });

  it('reads naturally for a single one', () => {
    expect(addressNoticeOf({ ...quiet, unresolvedCount: 1 })?.title).toMatch(/^One /);
  });

  it('does not offer a retry that would buy the same answer twice', () => {
    expect(addressNoticeOf({ ...quiet, unresolvedCount: 2 })?.canRetry).toBe(false);
  });

  it('does not blame the user for an address they picked from our list', () => {
    const notice = addressNoticeOf({ ...quiet, unresolvedCount: 1 });
    expect(notice?.detail).not.toMatch(/spelling|typo|check the address/i);
  });

  it('is outranked by a failure, which is the more actionable cause', () => {
    const notice = addressNoticeOf({
      failure: { kind: 'offline' },
      unresolvedCount: 5,
      isLoading: false,
    });
    expect(notice?.kind).toBe('offline');
  });
});
