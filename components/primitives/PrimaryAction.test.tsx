import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';

import { PrimaryAction } from './PrimaryAction';
import type { PrimaryActionState } from './PrimaryAction';
import { layout } from '@/lib/design/tokens';

/**
 * Every state, because each one is a different sentence the product is saying
 * and getting one wrong means telling a driver the wrong thing (CLAUDE.md §5).
 */

const noop = () => undefined;

const renderWith = (state: PrimaryActionState, onPress = noop) =>
  render(<PrimaryAction state={state} onPress={onPress} />);

describe('ready', () => {
  it('shows its label and responds to a tap', () => {
    let taps = 0;
    renderWith({ kind: 'ready', label: 'Optimize' }, () => {
      taps += 1;
    });

    fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(1);
  });

  it('is taller than the touch-target floor, as its specification requires', () => {
    // 44 pt is the minimum a control may be; 56 is what this one *is*
    // (docs/09_COMPONENT_LIBRARY.md §7). It is pressed one-handed, in a van,
    // often without looking straight at it — so it gets the larger number, and
    // the floor is asserted alongside it so a future edit cannot drop below both.
    renderWith({ kind: 'ready', label: 'Optimize' });

    const { minHeight } = screen.getByRole('button').props.style;
    expect(minHeight).toBe(layout.actionMinHeight);
    expect(minHeight).toBeGreaterThanOrEqual(layout.touchMin);
  });
});

describe('working', () => {
  it('does not fire again while the request is in flight', () => {
    // A second optimize is a second billed call for a result the user is
    // already waiting for.
    let taps = 0;
    renderWith({ kind: 'working', label: 'Optimizing…' }, () => {
      taps += 1;
    });

    fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(0);
  });

  it('announces that it is busy rather than only drawing a spinner', () => {
    // A screen reader user otherwise taps again, having no way to know.
    renderWith({ kind: 'working', label: 'Optimizing…' });
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true });
  });

  it('hides the spinner from assistive technology', () => {
    // It carries no information the label does not already give.
    renderWith({ kind: 'working', label: 'Optimizing…' });
    expect(screen.UNSAFE_getByType(ActivityIndicator).props).toMatchObject({
      accessibilityElementsHidden: true,
    });
  });
});

describe('blocked', () => {
  it('says why, visibly and not only to a screen reader', () => {
    // A disabled control whose reason lives only in the accessibility tree is
    // unexplained for everyone who can see it.
    renderWith({ kind: 'blocked', label: 'Optimize', reason: 'Add one more stop' });

    expect(screen.getByText('Add one more stop')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Add one more stop');
  });

  it('does not fire', () => {
    let taps = 0;
    renderWith({ kind: 'blocked', label: 'Optimize', reason: 'Add one more stop' }, () => {
      taps += 1;
    });

    fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(0);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('degraded', () => {
  it('labels the result before the user asks for it', () => {
    // A T0 result must never look like a T1 result (CLAUDE.md §7 rule 6), and
    // the label has to be readable before the tap, not after.
    renderWith({
      kind: 'degraded',
      label: 'Optimize offline',
      note: 'Approximate order',
    });

    expect(screen.getByText('Approximate order')).toBeTruthy();
  });

  it('is still pressable — degraded is a result, not a refusal', () => {
    let taps = 0;
    renderWith({ kind: 'degraded', label: 'Optimize offline', note: 'Approximate order' }, () => {
      taps += 1;
    });

    fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(1);
  });
});

describe('the accessible label says what happens', () => {
  it('defaults to the visible label', () => {
    renderWith({ kind: 'ready', label: 'Optimize' });
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Optimize');
  });

  it('can be overridden where the visible text is too terse to stand alone', () => {
    render(
      <PrimaryAction
        state={{ kind: 'ready', label: 'Go' }}
        onPress={noop}
        accessibilityLabel="Optimize this route"
      />,
    );
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Optimize this route');
  });
});
