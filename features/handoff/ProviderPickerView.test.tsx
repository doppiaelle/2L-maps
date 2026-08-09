import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProviderPickerView } from './ProviderPickerView';
import type { NavigationProviderId } from '@/types';

/**
 * The providers are not equivalent, and the whole point of this screen is that
 * the user learns how *before* they commit a twelve-stop day to an app that
 * takes them one at a time (ADR-0004).
 */

const noop = () => undefined;

const renderPicker = (overrides: Partial<Parameters<typeof ProviderPickerView>[0]> = {}) =>
  render(
    <ProviderPickerView
      available={['google-maps', 'waze']}
      selected={null}
      stopCount={12}
      remember={false}
      onRememberChange={noop}
      onChoose={noop}
      theme="light"
      {...overrides}
    />,
  );

describe('what each provider costs', () => {
  it('says Google Maps takes the whole route', () => {
    renderPicker({ available: ['google-maps'], stopCount: 8 });
    expect(screen.getByText('Takes the whole route at once')).toBeTruthy();
  });

  it('says how many interruptions Waze means, in numbers', () => {
    // Twelve stops is eleven intermediates plus the destination: twelve
    // handoffs. Learning that here beats learning it on the road.
    renderPicker({ available: ['waze'], stopCount: 12 });
    expect(screen.getByText(/12 handoffs/)).toBeTruthy();
  });

  it('counts the destination as a destination, not a waypoint', () => {
    // Passing the total stop count to a function that wants intermediates would
    // overstate every provider by one interruption.
    renderPicker({ available: ['waze'], stopCount: 2 });
    expect(screen.getByText(/2 handoffs/)).toBeTruthy();
  });

  it('warns that Waze needs a resolvable location for every stop', () => {
    // It takes `ll=lat,lng` and no address, so an expired coordinate blocks the
    // handoff outright rather than degrading it (ADR-0007).
    renderPicker({ available: ['waze'] });
    expect(screen.getByTestId('provider-caveat')).toBeTruthy();
  });

  it('does not warn about the one that accepts an address', () => {
    renderPicker({ available: ['google-maps'] });
    expect(screen.queryByTestId('provider-caveat')).toBeNull();
  });
});

describe('what is offered', () => {
  it('lists only what is installed', () => {
    // A row that opens nothing is worse than a row that is absent.
    renderPicker({ available: ['google-maps'] });
    expect(screen.getAllByTestId('provider-option')).toHaveLength(1);
  });

  it('says so when nothing is installed, rather than showing a blank', () => {
    renderPicker({ available: [] });
    expect(screen.getByTestId('provider-none')).toBeTruthy();
  });

  it('marks the current choice as selected for a screen reader', () => {
    renderPicker({ selected: 'waze' });

    const rows = screen.getAllByTestId('provider-option');
    const states = rows.map((row) => row.props.accessibilityState.selected);
    expect(states).toEqual([false, true]);
  });
});

describe('choosing', () => {
  it('reports which one', () => {
    let chosen: NavigationProviderId | null = null;
    renderPicker({
      onChoose: (provider) => {
        chosen = provider;
      },
    });

    const rows = screen.getAllByTestId('provider-option');
    const waze = rows[1];
    if (waze === undefined) throw new Error('expected a second provider');

    fireEvent.press(waze);
    expect(chosen).toBe('waze');
  });

  it('offers to remember it, and defaults to asking again', () => {
    // Remembering is the user's decision, not ours: a first choice made in a
    // hurry should not become permanent without them saying so.
    let remembered: boolean | null = null;
    renderPicker({
      onRememberChange: (value) => {
        remembered = value;
      },
    });

    const toggle = screen.getByTestId('provider-remember');
    expect(toggle.props.accessibilityState.checked).toBe(false);

    fireEvent.press(toggle);
    expect(remembered).toBe(true);
  });
});
