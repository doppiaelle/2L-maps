import type { GeocodingFailure } from '@/lib/providers/types';

/**
 * What to say when a stop has no address to show.
 *
 * **"Address needs refreshing" was the only thing the product ever said**, on
 * every row, for every cause — and it offered no way to refresh anything. A
 * lookup that had not landed yet, one that failed once, an exhausted monthly
 * allowance and a dead radio all produced the same six words and the same dead
 * end. The only escape a user had was deleting the stop and adding it back,
 * which worked by accident: it changed the query key.
 *
 * Each cause here gets its own sentence and its own next action
 * (`CLAUDE.md` §0 rule 5). Retry appears only where retrying can work — offering
 * it against a spent allowance invites the user to keep pressing a button that
 * cannot help them, which is the same mistake in a friendlier font.
 */

export interface AddressNotice {
  readonly kind: 'offline' | 'quota' | 'unavailable' | 'not-found';
  readonly title: string;
  readonly detail: string;
  readonly canRetry: boolean;
}

export interface AddressNoticeInputs {
  /** Why the batch failed, or null when it did not. */
  readonly failure: GeocodingFailure | null;
  /** Ids the server answered about and could not place — a different thing from
   *  a failure, and it happens one id at a time. */
  readonly unresolvedCount: number;
  /** Nothing is said while the answer is still coming. A warning that resolves
   *  itself a moment later teaches the user to ignore warnings. */
  readonly isLoading: boolean;
}

export function addressNoticeOf(inputs: AddressNoticeInputs): AddressNotice | null {
  if (inputs.isLoading) return null;

  if (inputs.failure !== null) {
    // `UNKNOWN_FAILURE` rather than an index into the record, because the
    // transport's taxonomy can grow and a kind with no entry must still produce
    // a sentence. Falling through to nothing would reintroduce the silence this
    // module exists to end.
    return FAILURE_NOTICE[inputs.failure.kind] ?? UNKNOWN_FAILURE;
  }

  if (inputs.unresolvedCount > 0) {
    return {
      kind: 'not-found',
      title:
        inputs.unresolvedCount === 1
          ? 'One address could not be found'
          : `${inputs.unresolvedCount} addresses could not be found`,
      // Deliberately does not blame the user's typing: they picked these from a
      // list we gave them. An id that Places will not return is most often one
      // the import flow got from the Geocoding API for an interpolated street
      // number, which is our plumbing and not their address.
      detail: 'They are still in your route. Remove and re-add one to look it up again.',
      // Retrying resolves the same ids against the same answer and spends
      // allowance to be told the same thing.
      canRetry: false,
    };
  }

  return null;
}

/** What is said for a failure kind that has no entry above — including one the
 *  transport learns after this file was written. */
const UNKNOWN_FAILURE: AddressNotice = {
  kind: 'unavailable',
  title: 'Addresses could not be refreshed',
  // Ours, and named as ours. Telling the user to check the address would send
  // them to fix something that is not broken.
  detail: 'Something on our side is not answering. Your stops and their order are unaffected.',
  canRetry: true,
};

/** Keyed by `GeocodingFailure['kind']`. */
const FAILURE_NOTICE: Readonly<Record<string, AddressNotice>> = {
  offline: {
    kind: 'offline',
    title: 'Addresses need a connection',
    detail: 'Your stops and their order are here. The addresses fill in when you are back online.',
    canRetry: true,
  },
  'quota-exhausted': {
    kind: 'quota',
    title: 'Address lookups used up',
    detail: 'Your allowance resets next month. Your route is unaffected and still works.',
    canRetry: false,
  },
  'no-entitlement': {
    kind: 'quota',
    title: 'Address lookups are unavailable on your plan',
    detail: 'Your route is unaffected and still works.',
    canRetry: false,
  },
  'upstream-unavailable': UNKNOWN_FAILURE,
};
