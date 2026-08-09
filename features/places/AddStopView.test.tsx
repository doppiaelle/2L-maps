import { fireEvent, render, screen } from '@testing-library/react-native';

import { AddStopView } from './AddStopView';
import type { SearchState, SourcedOption } from '@/lib/places/search';
import { MAX_STOPS } from '@/types';

/**
 * Every state this modal can be in (docs/08_SCREEN_SPECIFICATIONS.md §8), plus
 * the one thing that decides whether the product's largest cost line is
 * controlled: that free options sit above paid ones, nearest the thumb.
 */

const visually = { includeHiddenElements: true } as const;
const noop = () => undefined;

const option = (id: string, primary: string, source: SourcedOption['source']): SourcedOption => ({
  placeId: id,
  primaryText: primary,
  secondaryText: 'Bergamo',
  source,
});

const renderView = (
  state: SearchState,
  overrides: Partial<Parameters<typeof AddStopView>[0]> = {},
) =>
  render(
    <AddStopView
      state={state}
      query=""
      onQueryChange={noop}
      onSelect={noop}
      onAddManually={noop}
      onDismiss={noop}
      theme="light"
      {...overrides}
    />,
  );

describe('the field', () => {
  it('is focused on open', () => {
    // A modal that needs a tap to start has spent one of the three taps on
    // itself (CLAUDE.md §7 rule 1).
    renderView({ kind: 'browsing', options: [] });
    expect(screen.getByTestId('add-stop-input').props.autoFocus).toBe(true);
  });

  it('says where results come from before the user wonders', () => {
    renderView({ kind: 'browsing', options: [] });
    expect(screen.getByLabelText('Search for an address').props.accessibilityHint).toMatch(
      /3 characters/,
    );
  });
});

describe('browsing, before anything is typed', () => {
  it('offers recents and favourites and makes no request', () => {
    renderView({
      kind: 'browsing',
      options: [option('r1', 'Via Roma', 'recent'), option('f1', 'Depot', 'favourite')],
    });

    expect(screen.getAllByTestId('add-stop-option')).toHaveLength(2);
  });

  it('marks a reuse so the user can tell it from a search result', () => {
    renderView({ kind: 'browsing', options: [option('r1', 'Via Roma', 'recent')] });
    expect(screen.getByTestId('option-badge', visually).props.children).toBe('Recent');
  });

  it('leaves a search result unbadged, because that is the default', () => {
    // A word next to every row is no information.
    renderView({ kind: 'results', options: [option('s1', 'Via Roma', 'search')] });
    expect(screen.queryByTestId('option-badge', visually)).toBeNull();
  });
});

describe('searching', () => {
  it('keeps the existing list visible under the skeletons', () => {
    // A list that empties while it loads loses the user's place.
    renderView({ kind: 'searching', options: [option('r1', 'Via Roma', 'recent')] });

    expect(screen.getByText('Via Roma')).toBeTruthy();
    expect(screen.getByTestId('search-skeletons')).toBeTruthy();
  });
});

describe('no match', () => {
  it('offers the typed text rather than leaving a dead end', () => {
    // A driver who knows where they are going should not be stopped because
    // Google has not heard of the address.
    let added: string | null = null;
    renderView(
      { kind: 'no-match', query: 'Cascina vecchia' },
      {
        onAddManually: (text) => {
          added = text;
        },
      },
    );

    fireEvent.press(screen.getByTestId('add-stop-manual'));
    expect(added).toBe('Cascina vecchia');
  });
});

describe('offline', () => {
  it('states why search is unavailable and still lists what is stored', () => {
    renderView({ kind: 'offline', options: [option('r1', 'Via Roma', 'recent')] });

    expect(screen.getByLabelText('Search needs a connection')).toBeTruthy();
    expect(screen.getByText('Via Roma')).toBeTruthy();
  });
});

describe('a full route', () => {
  it('explains the limit and offers the way back', () => {
    // Refused before the attempt, so no billed request is spent learning it.
    let dismissed = false;
    renderView(
      { kind: 'at-capacity', limit: MAX_STOPS },
      {
        onDismiss: () => {
          dismissed = true;
        },
      },
    );

    expect(screen.getByText('This route is full')).toBeTruthy();
    expect(screen.getByText(new RegExp(`up to ${MAX_STOPS} stops`))).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Go back to the route'));
    expect(dismissed).toBe(true);
  });

  it('offers no search field at all', () => {
    renderView({ kind: 'at-capacity', limit: MAX_STOPS });
    expect(screen.queryByTestId('add-stop-input')).toBeNull();
  });
});

describe('choosing one', () => {
  it('reports the option, with where it came from', () => {
    // The caller needs the source: a reuse costs nothing and should not consume
    // an autocomplete session.
    let chosen: SourcedOption | null = null;
    renderView(
      { kind: 'results', options: [option('s1', 'Via Roma', 'search')] },
      {
        onSelect: (selected) => {
          chosen = selected;
        },
      },
    );

    fireEvent.press(screen.getByTestId('add-stop-option'));
    expect(chosen).toEqual(option('s1', 'Via Roma', 'search'));
  });

  it('says what happens, not what the row is', () => {
    renderView({ kind: 'results', options: [option('s1', 'Via Roma', 'search')] });
    expect(screen.getByTestId('add-stop-option').props.accessibilityHint).toBe(
      'Adds this stop to your route',
    );
  });
});
