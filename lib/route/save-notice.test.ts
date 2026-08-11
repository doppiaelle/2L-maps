import { saveNoticeOf } from './save-notice';
import type { SaveFailure } from '@/lib/supabase/routes-adapter';

/**
 * The message nobody ever saw.
 *
 * `useRouteSync` has always returned a `failure`, documented as existing so a
 * screen could say so — and the screen discarded the return value. A route that
 * failed to save looked exactly like one that saved, which is the whole of "it
 * doesn't reach History and I see no errors".
 *
 * Two properties matter here and both are about wording rather than mechanism.
 * **Nothing is lost**, because the draft is persisted locally and never evicted,
 * and a message that reads like data loss would send a driver back to re-type
 * twelve addresses they still have. And **a retry is only offered where retrying
 * can work**: a button that fails again teaches the user that buttons in this
 * app do not work.
 */

const failures: readonly SaveFailure[] = [
  { kind: 'offline' },
  { kind: 'unknown-place' },
  { kind: 'not-permitted' },
  { kind: 'illegal-transition', from: 'completed', to: 'draft' },
  { kind: 'failed' },
];

describe('every failure says the work is safe', () => {
  it.each(failures.map((failure) => [failure.kind, failure] as const))(
    'reassures on %s',
    (_kind, failure) => {
      expect(saveNoticeOf(failure)?.detail).toContain('safe on this phone');
    },
  );

  it('never uses the words that mean data loss', () => {
    for (const failure of failures) {
      const detail = saveNoticeOf(failure)?.detail ?? '';
      expect(detail).not.toMatch(/lost|deleted|gone/i);
    }
  });
});

describe('a retry is offered only where it can work', () => {
  it('offers one for a connection that may come back', () => {
    expect(saveNoticeOf({ kind: 'offline' })?.canRetry).toBe(true);
    expect(saveNoticeOf({ kind: 'failed' })?.canRetry).toBe(true);
    expect(saveNoticeOf({ kind: 'unknown-place' })?.canRetry).toBe(true);
  });

  it('withholds one where retrying repeats the same refusal', () => {
    // An authorisation decision, and a lifecycle move the state machine refused.
    // Neither changes because the user pressed a button again.
    expect(saveNoticeOf({ kind: 'not-permitted' })?.canRetry).toBe(false);
    expect(
      saveNoticeOf({ kind: 'illegal-transition', from: 'completed', to: 'draft' })?.canRetry,
    ).toBe(false);
  });
});

describe('what it says about whose fault it is', () => {
  it('does not blame the user for our own state machine', () => {
    // An illegal transition is a defect upstream of the user. They are told the
    // truth about their data and nothing about our lifecycle.
    const notice = saveNoticeOf({ kind: 'illegal-transition', from: 'completed', to: 'draft' });

    expect(notice?.detail).toContain('on our side');
    expect(notice?.detail).not.toContain('transition');
  });

  it('names signing in again where that is the actual fix', () => {
    expect(saveNoticeOf({ kind: 'not-permitted' })?.detail).toContain('Sign in again');
  });
});

describe('while everything is in step', () => {
  it('says nothing at all', () => {
    // A toast on every successful save is an app narrating its own filing.
    expect(saveNoticeOf(null)).toBeNull();
  });
});
