import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RouteSheet } from './RouteSheet';
import { lastPanGesture, resetGestures } from '../../__mocks__/react-native-gesture-handler';
import { FLICK_VELOCITY } from '@/lib/ui/sheet';
import type { SheetDetent } from '@/lib/ui/sheet';

/**
 * The snapping arithmetic is proven in `lib/ui/sheet.test.ts`. What is proven
 * here is what a gesture test cannot say and a device test would only reveal
 * late: that the primary action is in the same place at all three detents, and
 * that the drag has a real alternative for someone who cannot drag.
 */

const SCREEN = 800;

const renderSheet = (
  detent: SheetDetent,
  onDetentChange: (next: SheetDetent) => void = () => undefined,
) =>
  render(
    <RouteSheet
      detent={detent}
      onDetentChange={onDetentChange}
      screenHeight={SCREEN}
      theme="light"
      header={<Text>34 KM · 1H 12M</Text>}
      action={<Text>Optimize</Text>}
      testID="sheet"
    >
      <Text>the stop list</Text>
    </RouteSheet>,
  );

describe('the pinned action', () => {
  it('is present at every detent', () => {
    // Its position is learned once and stays true. A control that relocates
    // under the thumb during a gesture is one the user misses while driving.
    for (const detent of ['collapsed', 'half', 'expanded'] as const) {
      renderSheet(detent);
      expect(screen.getByText('Optimize')).toBeTruthy();
      screen.unmount();
    }
  });

  it('is the last child of the sheet, after the list, at every detent', () => {
    // Structural rather than visual, because that is what makes it true: it is
    // outside the scrolling area, so nothing the list does can move it.
    for (const detent of ['collapsed', 'half', 'expanded'] as const) {
      renderSheet(detent);
      const children = screen.getByTestId('sheet').props.children;
      const rendered = (Array.isArray(children) ? children : [children]).filter(Boolean);
      const last = rendered[rendered.length - 1];

      expect(last?.props?.testID).toBe('sheet-action');
      screen.unmount();
    }
  });
});

describe('what each detent mounts', () => {
  it('keeps the metrics visible at peek', () => {
    renderSheet('collapsed');
    expect(screen.getByText('34 KM · 1H 12M')).toBeTruthy();
  });

  it('does not mount the list at peek', () => {
    // A virtualised list behind content nobody can see still measures, still
    // renders, and still costs the transition (docs/24_PERFORMANCE.md).
    renderSheet('collapsed');
    expect(screen.queryByText('the stop list')).toBeNull();
  });

  it('mounts it from half upwards', () => {
    renderSheet('half');
    expect(screen.getByText('the stop list')).toBeTruthy();
  });
});

describe('releasing a drag', () => {
  beforeEach(() => {
    resetGestures();
  });

  /** Deliver a synthetic release. `velocityY` is the gesture's own sign
   *  convention: positive means the finger is moving *down* the screen. */
  const release = (translationY: number, velocityY: number) => {
    const pan = lastPanGesture();
    if (pan === null) throw new Error('expected a pan gesture');

    act(() => {
      pan.start({});
      pan.update({ translationY });
      pan.end({ velocityY });
    });
  };

  it('opens when flicked upwards, not closes', () => {
    // The pan reports velocity positive when the finger moves *down*, while the
    // snapping function takes it positive when the sheet *grows*. Getting that
    // inversion wrong produces a sheet that closes when you flick it open — and
    // without this test the only way to find it is a thumb on a device.
    let detent: SheetDetent | null = null;
    renderSheet('collapsed', (next) => {
      detent = next;
    });

    release(-40, -(FLICK_VELOCITY + 100));
    expect(detent).toBe('half');
  });

  it('closes when flicked downwards', () => {
    let detent: SheetDetent | null = null;
    renderSheet('expanded', (next) => {
      detent = next;
    });

    release(40, FLICK_VELOCITY + 100);
    expect(detent).toBe('half');
  });

  it('snaps to where a slow drag was released', () => {
    // From peek, dragged most of the way up and let go without a flick.
    let detent: SheetDetent | null = null;
    renderSheet('collapsed', (next) => {
      detent = next;
    });

    release(-500, 0);
    expect(detent).toBe('expanded');
  });
});

describe('the drag has an alternative', () => {
  it('opens one detent on a tap', () => {
    // A swipe-only action is inaccessible (CLAUDE.md §7 rule 4).
    let detent: SheetDetent | null = null;
    renderSheet('collapsed', (next) => {
      detent = next;
    });

    fireEvent.press(screen.getByTestId('sheet-handle'));
    expect(detent).toBe('half');
  });

  it('closes from the top rather than wrapping around', () => {
    let detent: SheetDetent | null = null;
    renderSheet('expanded', (next) => {
      detent = next;
    });

    fireEvent.press(screen.getByTestId('sheet-handle'));
    expect(detent).toBe('half');
  });

  it('is adjustable by a screen reader in both directions', () => {
    const seen: SheetDetent[] = [];
    renderSheet('half', (next) => seen.push(next));

    const handle = screen.getByTestId('sheet-handle');
    fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });

    expect(seen).toEqual(['expanded', 'collapsed']);
  });

  it('says what it is showing in the product’s words', () => {
    // Not "collapsed" and "expanded", which describe the widget rather than the
    // content the user is asking about.
    renderSheet('collapsed');
    expect(screen.getByTestId('sheet-handle').props.accessibilityValue).toEqual({
      text: 'summary only',
    });
  });

  it('reports nothing when a step would leave it where it is', () => {
    let changes = 0;
    renderSheet('expanded', () => {
      changes += 1;
    });

    fireEvent(screen.getByTestId('sheet-handle'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(changes).toBe(0);
  });
});
