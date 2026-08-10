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
      onSubmit={noop}
      canSubmit={false}
      offersCurrentLocation={false}
      onUseCurrentLocation={noop}
      onSelect={noop}
      onAddManually={noop}
      onRetry={noop}
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

  it('says what it needs before the user wonders', () => {
    renderView({ kind: 'browsing', options: [] });
    expect(screen.getByLabelText('Address to search for').props.accessibilityHint).toMatch(
      /3 characters/,
    );
  });
});

describe('searching is a press, not a side effect of typing (ADR-0019)', () => {
  it('offers a Search control beside the field', () => {
    renderView({ kind: 'browsing', options: [] });
    expect(screen.getByTestId('add-stop-search')).toBeTruthy();
  });

  it('disables it rather than hiding it when the query is too short', () => {
    // A control that disappears as the user backspaces is one they stop
    // believing in.
    renderView({ kind: 'browsing', options: [] }, { query: 'Vi', canSubmit: false });
    expect(screen.getByTestId('add-stop-search').props.accessibilityState.disabled).toBe(true);
  });

  it('sends the query when the control is pressed', () => {
    const onSubmit = jest.fn();
    renderView({ kind: 'browsing', options: [] }, { query: 'Via Roma', canSubmit: true, onSubmit });

    fireEvent.press(screen.getByTestId('add-stop-search'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sends it from the keyboard too, so the thumb need not travel', () => {
    const onSubmit = jest.fn();
    renderView({ kind: 'browsing', options: [] }, { query: 'Via Roma', canSubmit: true, onSubmit });

    fireEvent(screen.getByTestId('add-stop-input'), 'submitEditing');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not send anything when the text merely changes', () => {
    // The whole point: typing is free, and it stays free.
    const onSubmit = jest.fn();
    renderView({ kind: 'browsing', options: [] }, { canSubmit: true, onSubmit });

    fireEvent.changeText(screen.getByTestId('add-stop-input'), 'Via Giuseppe Garibaldi');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says a search will be spent before it is spent', () => {
    renderView({ kind: 'browsing', options: [] }, { query: 'Via Roma', canSubmit: true });
    expect(screen.getByTestId('add-stop-hint')).toBeTruthy();
  });
});

describe('my location, at the top of an empty field', () => {
  it('is the first row while nothing has been typed', () => {
    renderView({ kind: 'browsing', options: [] }, { offersCurrentLocation: true });
    expect(screen.getByTestId('add-stop-current-location')).toBeTruthy();
  });

  it('is gone the moment the user types something else', () => {
    renderView({ kind: 'browsing', options: [] }, { offersCurrentLocation: false });
    expect(screen.queryByTestId('add-stop-current-location')).toBeNull();
  });

  it('says it sets the starting point, not that it adds a stop', () => {
    renderView({ kind: 'browsing', options: [] }, { offersCurrentLocation: true });
    expect(screen.getByLabelText('Use my location as the starting point')).toBeTruthy();
  });

  it('stays and explains itself once the permission has been refused', () => {
    // Silently removing it leaves the user no way to discover why a feature
    // they were offered has gone (CLAUDE.md §0 rule 5).
    renderView(
      { kind: 'browsing', options: [] },
      { offersCurrentLocation: true, isLocationDenied: true },
    );
    expect(screen.getByTestId('add-stop-current-location')).toBeTruthy();
    expect(screen.getByText(/Location access is off/)).toBeTruthy();
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

describe('a search that failed', () => {
  it('says the fault is ours, not the address', () => {
    // "No match" told the user their address was wrong when the truth was that
    // our server did not answer. They retype a correct address, it fails again,
    // and the product looks broken (CLAUDE.md §0 rule 5).
    renderView({ kind: 'failed', reason: 'unavailable', options: [] });

    expect(screen.getByLabelText('Search is not responding')).toBeTruthy();
    expect(screen.queryByTestId('add-stop-no-match')).toBeNull();
  });

  it('offers a retry where retrying can work', () => {
    const onRetry = jest.fn();
    renderView({ kind: 'failed', reason: 'unavailable', options: [] }, { onRetry });

    fireEvent.press(screen.getByTestId('add-stop-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry against an exhausted allowance', () => {
    // Pressing it would spend nothing and change nothing. A button that cannot
    // help is worse than no button.
    renderView({ kind: 'failed', reason: 'quota-exhausted', options: [] });

    expect(screen.queryByTestId('add-stop-retry')).toBeNull();
    expect(screen.getByLabelText('Search limit reached')).toBeTruthy();
  });

  it('keeps the free options visible underneath', () => {
    // Reuse costs nothing and does not depend on the thing that just broke.
    renderView({
      kind: 'failed',
      reason: 'unavailable',
      options: [option('r1', 'Via Roma 1', 'recent')],
    });

    expect(screen.getAllByTestId('add-stop-option')).toHaveLength(1);
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
