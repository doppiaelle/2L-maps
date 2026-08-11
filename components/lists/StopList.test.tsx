import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DEFAULT_ROW_HEIGHT, StopList } from './StopList';
import type { StopListItem } from './StopList';
import { LIST_VIRTUALISATION_THRESHOLD } from '@/types';

/**
 * Every state the list can be in (CLAUDE.md §5), plus the two performance
 * decisions that would otherwise be invisible until a low-end Android device
 * drops frames — which is the one place nobody looks during review.
 */

const stop = (i: number): StopListItem => ({
  id: `stop-${i}`,
  position: i + 1,
  text: { title: `Via ${i}, Bergamo`, subtitle: null, needsRefreshing: false },
  state: 'pending',
  hasCoordinate: true,
  meta: null,
});

const stops = (count: number) => Array.from({ length: count }, (_, i) => stop(i));
const noop = () => undefined;

describe('loading', () => {
  it('shows a skeleton that matches the eventual layout, not a spinner', () => {
    // A spinner is not a loading state (CLAUDE.md §7 rule 5). A skeleton means
    // the list does not jump when the data lands, and the user can already see
    // how much is coming.
    render(
      <StopList theme="light" state={{ kind: 'loading', expectedCount: 5 }} onSelectStop={noop} />,
    );

    expect(screen.getAllByTestId('stop-skeleton')).toHaveLength(5);
  });

  it('gives each skeleton the row height, so nothing reflows on arrival', () => {
    render(
      <StopList theme="light" state={{ kind: 'loading', expectedCount: 3 }} onSelectStop={noop} />,
    );

    for (const skeleton of screen.getAllByTestId('stop-skeleton')) {
      expect(skeleton.props.style).toMatchObject({ height: DEFAULT_ROW_HEIGHT });
    }
  });

  it('announces that it is loading', () => {
    render(
      <StopList theme="light" state={{ kind: 'loading', expectedCount: 3 }} onSelectStop={noop} />,
    );
    expect(screen.getByLabelText('Loading stops')).toBeTruthy();
  });
});

describe('empty', () => {
  it('offers the three ways in rather than only saying there is nothing', () => {
    // An empty state that only reports emptiness leaves the user to find the
    // affordance themselves.
    render(<StopList theme="light" state={{ kind: 'empty' }} onSelectStop={noop} />);

    expect(screen.getByText('No stops yet')).toBeTruthy();
    expect(screen.getByText(/paste a list, or photograph one/)).toBeTruthy();
  });
});

describe('ready', () => {
  it('renders the stops it is given', () => {
    render(
      <StopList theme="light" state={{ kind: 'ready', stops: stops(3) }} onSelectStop={noop} />,
    );
    expect(screen.getByText('Via 0, Bergamo')).toBeTruthy();
    expect(screen.getByText('Via 2, Bergamo')).toBeTruthy();
  });

  it('reports which stop was selected, by id and not by index', () => {
    // The caller reorders this list constantly; an index would name whichever
    // stop happened to be in that slot.
    let selected: string | null = null;
    render(
      <StopList
        theme="light"
        state={{ kind: 'ready', stops: stops(3) }}
        onSelectStop={(id) => {
          selected = id;
        }}
      />,
    );

    fireEvent.press(screen.getByLabelText(/Via 1, Bergamo/));
    expect(selected).toBe('stop-1');
  });

  it('announces how many stops there are', () => {
    render(
      <StopList theme="light" state={{ kind: 'ready', stops: stops(7) }} onSelectStop={noop} />,
    );
    expect(screen.getByLabelText('7 stops')).toBeTruthy();
  });
});

describe('virtualisation crosses the threshold, not before it', () => {
  it('does not clip subviews at the threshold', () => {
    // Below it the windowing machinery costs more than it saves, and the whole
    // list fits on screen anyway.
    render(
      <StopList
        theme="light"
        state={{ kind: 'ready', stops: stops(LIST_VIRTUALISATION_THRESHOLD) }}
        onSelectStop={noop}
        testID="list"
      />,
    );
    expect(screen.getByTestId('list').props.removeClippedSubviews).toBe(false);
  });

  it('clips one above it', () => {
    render(
      <StopList
        theme="light"
        state={{ kind: 'ready', stops: stops(LIST_VIRTUALISATION_THRESHOLD + 1) }}
        onSelectStop={noop}
        testID="list"
      />,
    );
    expect(screen.getByTestId('list').props.removeClippedSubviews).toBe(true);
  });

  it('never measures a row', () => {
    // Measuring is what makes a virtualised list stutter on the first fling.
    // The height is a known function of the Dynamic Type size, not of content.
    render(
      <StopList
        theme="light"
        state={{ kind: 'ready', stops: stops(25) }}
        onSelectStop={noop}
        testID="list"
      />,
    );

    const getItemLayout = screen.getByTestId('list').props.getItemLayout;
    expect(getItemLayout).toBeDefined();
    expect(getItemLayout(null, 3)).toEqual({
      length: DEFAULT_ROW_HEIGHT,
      offset: DEFAULT_ROW_HEIGHT * 3,
      index: 3,
    });
  });

  it('takes a caller-supplied row height, for 200% Dynamic Type', () => {
    // Layouts reflow rather than truncate, so the row grows — and the list has
    // to be told, because it refuses to measure.
    render(
      <StopList
        theme="light"
        state={{ kind: 'ready', stops: stops(25) }}
        onSelectStop={noop}
        rowHeight={140}
        testID="list"
      />,
    );
    expect(screen.getByTestId('list').props.getItemLayout(null, 2)).toEqual({
      length: 140,
      offset: 280,
      index: 2,
    });
  });

  it('keys by stop id so a reorder is not a content change', () => {
    render(
      <StopList
        theme="light"
        state={{ kind: 'ready', stops: stops(3) }}
        onSelectStop={noop}
        testID="list"
      />,
    );
    expect(screen.getByTestId('list').props.keyExtractor(stop(2))).toBe('stop-2');
  });
});

describe('the header slot', () => {
  it('renders in every state, so the ad slot does not appear and vanish', () => {
    // The list does not know what advertising is; it knows there is a header.
    const header = <Text>slot</Text>;

    render(
      <StopList
        theme="light"
        state={{ kind: 'loading', expectedCount: 2 }}
        onSelectStop={noop}
        header={header}
      />,
    );
    expect(screen.getByText('slot')).toBeTruthy();

    screen.rerender(
      <StopList theme="light" state={{ kind: 'empty' }} onSelectStop={noop} header={header} />,
    );
    expect(screen.getByText('slot')).toBeTruthy();
  });
});
