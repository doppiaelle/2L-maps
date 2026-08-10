import {
  canSubmitSearch,
  isAwaitingSubmit,
  localMatches,
  offersCurrentLocation,
  searchStateOf,
  shouldRotateSessionToken,
  shouldSearch,
} from './search';
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
  // Defaults to the query, so a test that says nothing about submission is
  // testing a query that has been searched for. The tests about *not* having
  // searched yet set it explicitly (ADR-0019).
  submittedQuery: overrides.query ?? '',
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

describe('a search that failed', () => {
  it('is not reported as a no-match', () => {
    // The defect this exists to prevent. A failed request returns no results,
    // so an emptiness check reaches "no match for what you typed" first and the
    // app blames the address for a fault on our side. The user's only move is
    // to retype a correct address and watch it fail again.
    const state = searchStateOf(inputs({ query: 'Via Roma 10', failure: 'unavailable' }));

    expect(state.kind).toBe('failed');
    if (state.kind === 'failed') expect(state.reason).toBe('unavailable');
  });

  it('keeps every cause separate, because each has a different next action', () => {
    for (const reason of ['offline', 'quota-exhausted', 'no-entitlement', 'unavailable'] as const) {
      const state = searchStateOf(inputs({ query: 'Via Roma 10', failure: reason }));
      if (state.kind !== 'failed') throw new Error(`expected failed for ${reason}`);
      expect(state.reason).toBe(reason);
    }
  });

  it('still shows what is stored locally, which cost nothing and still works', () => {
    const state = searchStateOf(
      inputs({
        query: 'Via Roma',
        failure: 'unavailable',
        recents: [option('r1', 'Via Roma')],
      }),
    );

    if (state.kind !== 'failed') throw new Error('expected failed');
    expect(state.options).toHaveLength(1);
  });

  it('yields to a request still in flight', () => {
    // A stale failure under a running retry would show an error and a spinner
    // at once, and the error is the one that is out of date.
    const state = searchStateOf(
      inputs({ query: 'Via Roma 10', failure: 'unavailable', isSearching: true }),
    );

    expect(state.kind).toBe('searching');
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

/**
 * Searching is a press, not a side effect of typing (ADR-0019).
 *
 * The rule these tests protect is the one that cost real money: a debounced
 * field sent a request per pause in typing, so a single address spent four or
 * five of a free user's ten monthly calls before they had chosen anything.
 */
describe('a query that has been typed but not searched for', () => {
  it('is awaiting submission', () => {
    expect(isAwaitingSubmit('Via Roma', '')).toBe(true);
  });

  it('is not, once the same text has been sent', () => {
    expect(isAwaitingSubmit('Via Roma', 'Via Roma')).toBe(false);
  });

  it('ignores surrounding whitespace, which is not an edit', () => {
    expect(isAwaitingSubmit('  Via Roma ', 'Via Roma')).toBe(false);
  });

  it('shows the free options rather than claiming no match', () => {
    // The trap this ordering exists for. `no-match` and `failed` both describe
    // an *answer*, and nobody has asked a question yet — reporting "no match for
    // what you typed" against a query that was never sent is the same lie the
    // failure states were written to stop telling.
    const state = searchStateOf(
      inputs({
        query: 'Via Roma',
        submittedQuery: '',
        results: [],
        recents: [option('r', 'Depot')],
      }),
    );

    expect(state.kind).toBe('browsing');
  });

  it('still reports no match once that query really was sent', () => {
    const state = searchStateOf(inputs({ query: 'Via Roma', submittedQuery: 'Via Roma' }));
    expect(state.kind).toBe('no-match');
  });

  it('does not resurrect a failure that belonged to older text', () => {
    const state = searchStateOf(
      inputs({ query: 'Via Roma 2', submittedQuery: 'Via Roma', failure: 'unavailable' }),
    );

    expect(state.kind).toBe('browsing');
  });
});

describe('when the Search control may be pressed', () => {
  const submittable = {
    query: 'Via Roma',
    submittedQuery: '',
    isOffline: false,
    isSearching: false,
  };

  it('is pressable for a long-enough, unsent query', () => {
    expect(canSubmitSearch(submittable)).toBe(true);
  });

  it('is not below the character minimum', () => {
    expect(canSubmitSearch({ ...submittable, query: 'Vi' })).toBe(false);
  });

  it('is not while a request is in flight', () => {
    expect(canSubmitSearch({ ...submittable, isSearching: true })).toBe(false);
  });

  it('is not offline, where the request cannot leave', () => {
    expect(canSubmitSearch({ ...submittable, isOffline: true })).toBe(false);
  });

  it('is not for a query already sent, which would buy the same answer twice', () => {
    expect(canSubmitSearch({ ...submittable, submittedQuery: 'Via Roma' })).toBe(false);
  });

  it('is pressable again as soon as the text changes', () => {
    expect(
      canSubmitSearch({ ...submittable, query: 'Via Roma 2', submittedQuery: 'Via Roma' }),
    ).toBe(true);
  });
});

describe('my location, offered before anything is typed', () => {
  it('is offered on an empty field', () => {
    expect(offersCurrentLocation('')).toBe(true);
    expect(offersCurrentLocation('   ')).toBe(true);
  });

  it('is withdrawn the moment the user says where they want to go', () => {
    expect(offersCurrentLocation('V')).toBe(false);
  });
});
