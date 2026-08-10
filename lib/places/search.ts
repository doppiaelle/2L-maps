import { AUTOCOMPLETE_MIN_CHARACTERS } from '@/types';

/**
 * The address search, decided as a state machine.
 *
 * Autocomplete is **the largest single cost line in the product**
 * ([`docs/31_COST_MODEL.md`](../../docs/31_COST_MODEL.md)), so the rules about
 * when *not* to ask are worth more than the rules about when to. All of them
 * live here, where they are tested without a network:
 *
 * **Nothing is sent until the user asks for it**
 * ([ADR-0019](../../docs/adr/0019-explicit-address-search.md)). Typing costs
 * nothing; pressing Search costs one request. The debounced type-ahead this
 * replaces sent a request per pause in typing, so a single address — "Via
 * Giuseppe Garibaldi 14" — spent four or five of a free user's ten monthly
 * allowance before they had chosen anything. That is not a tuning problem; it
 * is the wrong trigger.
 *
 * **Reuse before search.** Recents and favourites are shown first and are always
 * visible, because a reused `place_id` is free and a search is not
 * (`CLAUDE.md` §6 rule 2). The cheapest interaction is also the fastest one.
 *
 * **Nothing is sent below the minimum.** Below `AUTOCOMPLETE_MIN_CHARACTERS` the
 * server answers with noise anyway, and we would have paid a round trip to be
 * told what we already knew.
 *
 * **A session token spans the whole search, ending at the selection.** Google
 * bills a session as one unit; a caller that starts a new token per keystroke
 * pays per keystroke and nothing visibly breaks — which is why the lifecycle is
 * a decision here rather than an implementation detail of the caller.
 */

export interface PlaceOption {
  readonly placeId: string;
  readonly primaryText: string;
  readonly secondaryText: string;
}

/** Where an option came from. A user should be able to tell a free reuse from a
 *  fresh search result, and the two are ordered differently for a reason. */
export type OptionSource = 'recent' | 'favourite' | 'search';

export interface SourcedOption extends PlaceOption {
  readonly source: OptionSource;
}

export type SearchState =
  /** Nothing typed, or not enough. Recents and favourites are the whole screen,
   *  and no request has been made. */
  | { readonly kind: 'browsing'; readonly options: readonly SourcedOption[] }
  /** A request is in flight. The existing list stays visible beneath the
   *  skeletons — a list that empties while it loads loses the user's place. */
  | { readonly kind: 'searching'; readonly options: readonly SourcedOption[] }
  | { readonly kind: 'results'; readonly options: readonly SourcedOption[] }
  /** Nothing matched. The typed text is offered as a manual label rather than
   *  leaving the user at a dead end (`CLAUDE.md` §0 rule 5). */
  | { readonly kind: 'no-match'; readonly query: string }
  /** Search needs the network; reuse does not. Recents and favourites remain
   *  searchable locally, so the modal is still useful with no signal. */
  | { readonly kind: 'offline'; readonly options: readonly SourcedOption[] }
  /**
   * The search was attempted and failed.
   *
   * **Distinct from `no-match`, and the distinction is the whole point.** Until
   * this existed a failed request produced an empty result list, which reached
   * the screen as "no match for what you typed" — the app blaming the address
   * for a fault on our side. A user cannot act on that: they retype a perfectly
   * good address, get the same answer, and conclude the product does not work.
   *
   * Every cause worth separating is separated, because each one has a different
   * next action (`CLAUDE.md` §0 rule 5): reconnect, wait, subscribe, or retry.
   */
  | {
      readonly kind: 'failed';
      readonly reason: SearchFailure;
      /** Reuse still works when the network does not, so what we already hold
       *  stays on screen underneath the message. */
      readonly options: readonly SourcedOption[];
    }
  /** Refused before the attempt, with the limit explained (docs/08 §8). */
  | { readonly kind: 'at-capacity'; readonly limit: number };

/**
 * Why a search failed, in the user's terms rather than the transport's.
 *
 * Mirrors `GeocodingFailure` from `lib/providers/types`, deliberately without
 * importing it: `lib/places` decides presentation and must not depend on the API
 * layer's taxonomy changing underneath it.
 */
export type SearchFailure = 'offline' | 'quota-exhausted' | 'no-entitlement' | 'unavailable';

export interface SearchInputs {
  readonly query: string;
  /**
   * The text the last request was actually sent for. Empty before the first.
   *
   * The field and the network are no longer the same thing (ADR-0019), so the
   * state machine needs both: `query` is what the user is looking at, and this
   * is what the results on screen are answers to. Without the distinction a
   * half-typed address sits above results for the previous one and the screen
   * cannot tell whether the difference is a pending search or a genuine miss.
   */
  readonly submittedQuery: string;
  readonly recents: readonly PlaceOption[];
  readonly favourites: readonly PlaceOption[];
  readonly results: readonly PlaceOption[];
  readonly isSearching: boolean;
  readonly isOffline: boolean;
  /** The last attempt's failure, or null. Null is "no attempt has failed", not
   *  "the attempt succeeded" — a fresh query clears it before asking again. */
  readonly failure?: SearchFailure | null;
  readonly stopCount: number;
  readonly maxStops: number;
}

/** Whether a query is worth a billed request. */
export function shouldSearch(query: string, isOffline: boolean): boolean {
  if (isOffline) return false;
  return query.trim().length >= AUTOCOMPLETE_MIN_CHARACTERS;
}

/**
 * Whether what is on screen still answers what is in the field.
 *
 * True means the user has typed something the network has not been asked about
 * — which is the normal resting state now that asking is a deliberate act
 * (ADR-0019), not an error and not a loading state. The screen shows the free
 * options and an enabled Search control; it does not show "no match", because
 * nothing has been matched against.
 */
export function isAwaitingSubmit(query: string, submittedQuery: string): boolean {
  return query.trim() !== submittedQuery.trim();
}

/**
 * Whether the current text is one the Search control may be pressed for.
 *
 * The control is disabled rather than absent below the minimum: a button that
 * vanishes as the user backspaces is a button they stop believing in. Disabled
 * with the reason stated beside it says what to do next (`CLAUDE.md` §0 rule 5).
 */
export function canSubmitSearch(inputs: {
  readonly query: string;
  readonly submittedQuery: string;
  readonly isOffline: boolean;
  readonly isSearching: boolean;
}): boolean {
  if (inputs.isSearching) return false;
  if (!shouldSearch(inputs.query, inputs.isOffline)) return false;
  // Pressing Search again on an unchanged query would buy the same answer
  // twice. Retry exists for the case where the first attempt failed, and it is
  // a different control with a different meaning.
  return isAwaitingSubmit(inputs.query, inputs.submittedQuery);
}

/**
 * Whether "My location" is offered at the top of the list.
 *
 * It is the first row while the field is empty and disappears the moment the
 * user types, because at that point they have told us where they want to go and
 * a suggestion about where they already are is in the way. Free in every sense:
 * the device answers, nothing is billed, and it works with no signal.
 *
 * It sets the route's **origin**, not a stop. The draft has carried
 * `originIsCurrentLocation` since the beginning and nothing ever set it; the
 * permission timeline in [`docs/18_PERMISSIONS.md`](../../docs/18_PERMISSIONS.md)
 * §4 names this exact moment — "first stop added → location, when in use → to
 * set your starting point".
 */
export function offersCurrentLocation(query: string): boolean {
  return query.trim().length === 0;
}

/**
 * Recents and favourites matching what has been typed so far.
 *
 * Filtered locally and case-insensitively, so the free options narrow as the
 * user types instead of sitting there irrelevant while a paid search runs
 * alongside them.
 */
export function localMatches(
  query: string,
  recents: readonly PlaceOption[],
  favourites: readonly PlaceOption[],
): readonly SourcedOption[] {
  const needle = query.trim().toLowerCase();

  const matches = (option: PlaceOption): boolean =>
    needle === '' || `${option.primaryText} ${option.secondaryText}`.toLowerCase().includes(needle);

  // Recents first, then favourites. Recency beats intent: the address a driver
  // used this morning is more likely than one they starred in March.
  const seen = new Set<string>();
  const ordered: SourcedOption[] = [];

  for (const [options, source] of [
    [recents, 'recent'],
    [favourites, 'favourite'],
  ] as const) {
    for (const option of options) {
      if (!matches(option) || seen.has(option.placeId)) continue;
      seen.add(option.placeId);
      ordered.push({ ...option, source });
    }
  }

  return ordered;
}

export function searchStateOf(inputs: SearchInputs): SearchState {
  // Refused before the attempt, not after it. Letting a user search, choose,
  // and only then be told the route is full wastes a billed request and their
  // time (docs/08 §8).
  if (inputs.stopCount >= inputs.maxStops) {
    return { kind: 'at-capacity', limit: inputs.maxStops };
  }

  const local = localMatches(inputs.query, inputs.recents, inputs.favourites);

  if (inputs.isOffline) return { kind: 'offline', options: local };

  if (!shouldSearch(inputs.query, inputs.isOffline)) {
    return { kind: 'browsing', options: local };
  }

  // The existing list stays visible beneath the skeletons: a list that empties
  // while it loads loses the user's place and flashes the layout.
  if (inputs.isSearching) return { kind: 'searching', options: local };

  // Typed but not yet asked. **Before the failure and no-match checks, and that
  // order is the point** (ADR-0019): both of those describe an answer, and the
  // user has not asked a question yet. Reporting "no match for what you typed"
  // against a query nobody searched for is the same lie the failure states were
  // written to stop telling — the app blaming an address it never looked up.
  if (isAwaitingSubmit(inputs.query, inputs.submittedQuery)) {
    return { kind: 'browsing', options: local };
  }

  // **Before `no-match`, and that order is the fix.** A failed request returns
  // no results, so testing emptiness first reports every outage as "no match for
  // what you typed" — the app blaming the user's address for our fault.
  const failure = inputs.failure ?? null;
  if (failure !== null) {
    return { kind: 'failed', reason: failure, options: local };
  }

  if (inputs.results.length === 0 && local.length === 0) {
    return { kind: 'no-match', query: inputs.query.trim() };
  }

  return {
    kind: 'results',
    // Free options stay above paid ones even once results arrive. The ordering
    // is the cost decision made visible.
    options: [
      ...local,
      ...inputs.results.map((result) => ({ ...result, source: 'search' as const })),
    ],
  };
}

/**
 * Whether the session token must be replaced.
 *
 * A token covers one search from first keystroke to selection, and Google bills
 * that as a unit. It is rotated **after a selection**, never during — rotating
 * mid-search turns one billed session into several and nothing looks wrong.
 */
export function shouldRotateSessionToken(event: 'opened' | 'typed' | 'selected'): boolean {
  return event !== 'typed';
}
