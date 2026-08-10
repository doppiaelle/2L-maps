import { handoffNoticeOf } from './outcome-notice';

/**
 * Six outcomes, and five of them used to say nothing.
 *
 * The call site read `needs-provider` and dropped the rest, so pressing Confirm
 * and nothing happening was the product's response to a blocked Waze handoff, a
 * route past the URL ceiling, and a navigation app that is not installed. Each
 * of these tests is one of those silences.
 */

describe('the outcomes that used to be silent', () => {
  it('says a navigation app could not be opened, and why it probably could not', () => {
    const notice = handoffNoticeOf({ kind: 'failed' });
    expect(notice).toMatchObject({ kind: 'warning' });
    expect(notice?.detail).toMatch(/installed/i);
  });

  it('says a route is too long, and what to do about it', () => {
    const notice = handoffNoticeOf({ kind: 'route-too-long' });
    expect(notice?.detail).toMatch(/remove|split/i);
  });

  it('names how many stops are blocking a Waze handoff', () => {
    // Waze takes coordinates and has no address form, so an expired cache blocks
    // it outright rather than degrading (ADR-0007).
    expect(handoffNoticeOf({ kind: 'needs-coordinates', stopCount: 3 })?.title).toContain('3');
  });

  it('reads naturally for a single blocked stop', () => {
    expect(handoffNoticeOf({ kind: 'needs-coordinates', stopCount: 1 })?.title).toMatch(/^One /);
  });

  it('offers the way out rather than only the obstacle', () => {
    // Another app will take the same route today, and saying so is the
    // difference between a warning and a wall.
    expect(handoffNoticeOf({ kind: 'needs-coordinates', stopCount: 2 })?.detail).toMatch(
      /google maps/i,
    );
  });

  it('says when there is nothing to hand over yet', () => {
    expect(handoffNoticeOf({ kind: 'no-route' })?.detail).toMatch(/optimize/i);
  });
});

describe('a successful handoff', () => {
  it('says nothing when the whole route went at once', () => {
    // The navigation app is now in front of the user. A toast over it would be
    // announcing what they can already see.
    expect(handoffNoticeOf({ kind: 'handed-off', chunkCount: 1 })).toBeNull();
  });

  it('says nothing when the chunk count is unknown', () => {
    expect(handoffNoticeOf({ kind: 'handed-off' })).toBeNull();
  });

  it('warns before departure when the route was split', () => {
    // Otherwise the driver finds out at the end of the first chunk, parked
    // somewhere unexpected, with no idea why navigation stopped.
    const notice = handoffNoticeOf({ kind: 'handed-off', chunkCount: 3 });
    expect(notice).toMatchObject({ kind: 'success' });
    expect(notice?.title).toContain('3');
  });

  it('says the split is the destination app’s limit, not ours', () => {
    expect(handoffNoticeOf({ kind: 'handed-off', chunkCount: 2 })?.detail).toMatch(
      /navigation app/i,
    );
  });

  it('says to come back, because the next part is here', () => {
    expect(handoffNoticeOf({ kind: 'handed-off', chunkCount: 2 })?.detail).toMatch(/come back/i);
  });
});

describe('the outcome that is already handled elsewhere', () => {
  it('says nothing when the picker is about to open', () => {
    // Two things saying the same thing at once is worse than one.
    expect(handoffNoticeOf({ kind: 'needs-provider' })).toBeNull();
  });
});
