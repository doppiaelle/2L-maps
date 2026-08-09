import { AUTOCOMPLETE_MIN_CHARACTERS } from '@/types';

/**
 * The address search, decided as a state machine.
 *
 * Autocomplete is **the largest single cost line in the product**
 * ([`docs/31_COST_MODEL.md`](../../docs/31_COST_MODEL.md)), so the rules about
 * when *not* to ask are worth more than the rules about when to. All of them
 * live here, where they are tested without a network:
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
  /** Refused before the attempt, with the limit explained (docs/08 §8). */
  | { readonly kind: 'at-capacity'; readonly limit: number };

export interface SearchInputs {
  readonly query: string;
  readonly recents: readonly PlaceOption[];
  readonly favourites: readonly PlaceOption[];
  readonly results: readonly PlaceOption[];
  readonly isSearching: boolean;
  readonly isOffline: boolean;
  readonly stopCount: number;
  readonly maxStops: number;
}

/** Whether a query is worth a billed request. */
export function shouldSearch(query: string, isOffline: boolean): boolean {
  if (isOffline) return false;
  return query.trim().length >= AUTOCOMPLETE_MIN_CHARACTERS;
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
