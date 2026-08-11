import type { SaveFailure } from '@/lib/supabase/routes-adapter';

/**
 * What the user is told when the server's copy of a route falls behind.
 *
 * **Nothing was told to anyone.** `useRouteSync` has always returned a
 * `failure`, documented as existing *"so a screen can say so rather than letting
 * the route silently exist on one device only"* — and the screen called
 * `useRouteSync()` and discarded the return value. A route that failed to save
 * looked exactly like a route that saved: it was on screen, it was in the local
 * store, and it was simply not in History
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
 *
 * **Nothing is lost while this is showing, and the wording has to say so.** The
 * draft is persisted locally and never evicted (`docs/24_PERFORMANCE.md`), so
 * what has failed is the second device and the History row — not the day's work.
 * A message that reads like data loss would send a driver back to re-type twelve
 * addresses they still have.
 */

export interface SaveNotice {
  readonly kind: 'warning';
  readonly title: string;
  readonly detail: string;
  /** Whether trying again can plausibly work. A permission failure cannot, and
   *  offering a button that will fail again is worse than offering none. */
  readonly canRetry: boolean;
}

export function saveNoticeOf(failure: SaveFailure | null): SaveNotice | null {
  if (failure === null) return null;

  switch (failure.kind) {
    case 'offline':
      return {
        kind: 'warning',
        title: 'Not saved yet',
        detail: 'Your route is safe on this phone. It will reach your history when you reconnect.',
        canRetry: true,
      };

    case 'unknown-place':
      // The stop's `place_id` has no row in the shared cache, which resolving it
      // fixes — and resolving happens on the next render anyway.
      return {
        kind: 'warning',
        title: 'Not saved yet',
        detail:
          'Your route is safe on this phone. One of its stops is still being looked up, and it will save itself once that lands.',
        canRetry: true,
      };

    case 'not-permitted':
      // Retrying cannot fix an authorisation decision, and a button that fails
      // again teaches the user that buttons in this app do not work.
      return {
        kind: 'warning',
        title: 'Could not save this route',
        detail: 'Your route is safe on this phone. Sign in again to keep it in your history.',
        canRetry: false,
      };

    case 'illegal-transition':
      // Ours, not theirs. The lifecycle refused a move the client asked for,
      // which means a defect upstream of here — so the user is told the truth
      // about their data and nothing about our state machine.
      return {
        kind: 'warning',
        title: 'Could not save this route',
        detail: 'Your route is safe on this phone. Something went wrong on our side.',
        canRetry: false,
      };

    case 'failed':
    default:
      return {
        kind: 'warning',
        title: 'Not saved yet',
        detail: 'Your route is safe on this phone. We could not reach your history just now.',
        canRetry: true,
      };
  }
}
