import { localMatches, searchStateOf, shouldRotateSessionToken, shouldSearch } from './search';
import type { PlaceOption, SearchInputs } from './search';
import { AUTOCOMPLETE_MIN_CHARACTERS, MAX_STOPS } from '@/types';

/**
 * Autocomplete is the largest single cost line in the product
 * (docs/31_COST_MODEL.md), so most of this file is about when *not* to ask.
 * Every one of those rules is invisible in the interface and expensive in the
 * bill, which is exactly the combination that needs a test.
 */

const option = (id: string, primary: string, secondary = 'Bergamo'): PlaceOption => ({
  placeId: id,
  primaryText: primary,
  secondaryText: secondary,
});

const inputs = (overrides: Partial<SearchInputs> = {}): SearchInputs => ({
  query: '',
  recents: [],
  favourites: [],
  results: [],
  isSearching: false,
  isOffline: false,
  stopCount: 0,
  maxStops: MAX_STOPS,
  ...overrides,
});

describe('when a request is worth making', () => {
  it('refuses below the minimum length', () => {
    // The server answers with noise anyway, and we would have paid a round trip
    // to be told what we already knew.
    const justUnder = 'a'.repeat(AUTOCOMPLETE_MIN_CHARACTERS - 1);
    expect(shouldSearch(justUnder, false)).toBe(false);
  });

  it('allows it exactly at the minimum', () => {
    expect(shouldSearch('a'.repeat(AUTOCOMPLETE_MIN_CHARACTERS), false)).toBe(true);
  });

  it('ignores whitespace, which is not a character the user meant', () => {
    expect(shouldSearch('  a  ', false)).toBe(false);
  });

  it('never asks while offline', () => {
    expect(shouldSearch('Via Roma', true)).toBe(false);
  });
});

describe('what is shown before anything is typed', () => {
  it('is recents and favourites, with no request made', () => {
    // A reused place_id is free and a search is not (CLAUDE.md §6 rule 2).
    const state = searchStateOf(
      inputs({ recents: [option('r1', 'Via Roma')], favourites: [option('f1', 'Depot')] }),
    );

    expect(state.kind).toBe('browsing');
    if (state.kind === 'browsing') {
      expect(state.options.map((o) => o.placeId)).toEqual(['r1', 'f1']);
    }
  });

  it('puts recents before favourites', () => {
    // Recency beats intent: the address used this morning is likelier than one
    // starred in March.
    const options = localMatches('', [option('r1', 'Via Roma')], [option('f1', 'Via Roma')]);
    expect(options.map((o) => o.source)).toEqual(['recent', 'favourite']);
  });

  it('lists an address that is both, once', () => {
    const options = localMatches('', [option('p1', 'Via Roma')], [option('p1', 'Via Roma')]);
    expect(options).toHaveLength(1);
    expect(options[0]?.source).toBe('recent');
  });

  it('narrows the free options as the user types', () => {
    // Otherwise they sit there irrelevant while a paid search runs beside them.
    const options = localMatches(
      'roma',
      [option('r1', 'Via Roma'), option('r2', 'Via Milano')],
      [],
    );
    expect(options.map((o) => o.placeId)).toEqual(['r1']);
  });

  it('matches on the secondary line too', () => {
    const options = localMatches('bergamo', [option('r1', 'Via Roma', 'Bergamo')], []);
    expect(options).toHaveLength(1);
  });
});

describe('searching', () => {
  const typed = 'Via Roma';

  it('keeps the existing list visible while a request is in flight', () => {
    // A list that empties while it loads loses the user's place and flashes the
    // layout.
    const state = searchStateOf(
      inputs({ query: typed, isSearching: true, recents: [option('r1', 'Via Roma')] }),
    );

    expect(state.kind).toBe('searching');
    if (state.kind === 'searching') expect(state.options).toHaveLength(1);
  });

  it('keeps free options above paid ones once results arrive', () => {
    // The ordering is the cost decision made visible.
    const state = searchStateOf(
      inputs({
        query: typed,
        recents: [option('r1', 'Via Roma 1')],
        results: [option('s1', 'Via Roma 2')],
      }),
    );

    if (state.kind !== 'results') throw new Error('expected results');
    expect(state.options.map((o) => o.source)).toEqual(['recent', 'search']);
  });

  it('offers the typed text when nothing matches at all', () => {
    // A dead end is not an acceptable state (CLAUDE.md §0 rule 5).
    const state = searchStateOf(inputs({ query: 'Nowhere at all' }));

    expect(state).toEqual({ kind: 'no-match', query: 'Nowhere at all' });
  });

  it('is not a no-match while a local option still stands', () => {
    const state = searchStateOf(inputs({ query: 'Via Roma', recents: [option('r1', 'Via Roma')] }));
    expect(state.kind).toBe('results');
  });
});

describe('offline', () => {
  it('still offers what is stored locally', () => {
    // Search needs the network; reuse does not, so the modal stays useful.
    const state = searchStateOf(
      inputs({ query: 'Via Roma', isOffline: true, recents: [option('r1', 'Via Roma')] }),
    );

    expect(state.kind).toBe('offline');
    if (state.kind === 'offline') expect(state.options).toHaveLength(1);
  });
});

describe('a full route', () => {
  it('is refused before the attempt, with the limit named', () => {
    // Letting a user search, choose, and only then be told the route is full
    // wastes a billed request and their time (docs/08 §8).
    const state = searchStateOf(inputs({ stopCount: MAX_STOPS, maxStops: MAX_STOPS }));

    expect(state).toEqual({ kind: 'at-capacity', limit: MAX_STOPS });
  });

  it('outranks everything else, including a search in flight', () => {
    const state = searchStateOf(
      inputs({ stopCount: MAX_STOPS, query: 'Via Roma', isSearching: true }),
    );
    expect(state.kind).toBe('at-capacity');
  });

  it('respects a plan ceiling lower than the product one', () => {
    expect(searchStateOf(inputs({ stopCount: 15, maxStops: 15 }))).toEqual({
      kind: 'at-capacity',
      limit: 15,
    });
  });
});

describe('the session token', () => {
  it('survives typing', () => {
    // Google bills a session as one unit. Rotating mid-search turns one billed
    // session into several, and nothing looks wrong.
    expect(shouldRotateSessionToken('typed')).toBe(false);
  });

  it('is replaced when the modal opens and after a selection', () => {
    expect(shouldRotateSessionToken('opened')).toBe(true);
    expect(shouldRotateSessionToken('selected')).toBe(true);
  });
});
