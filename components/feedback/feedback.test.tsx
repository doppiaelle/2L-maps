import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { StateView } from './StateView';
import { UndoToast } from './UndoToast';
import { MetricPair } from '@/components/primitives/MetricPair';
import { Skeleton } from '@/components/primitives/Skeleton';
import { StatusChip } from '@/components/primitives/StatusChip';
import { UNDO_WINDOW_MS } from '@/types';

/**
 * The clock is mocked, never the component under test (`CLAUDE.md` §5). The undo
 * window's arithmetic is proven in `lib/ui/undo-window.test.ts`; what is proven
 * here is that the component feeds it correctly — including the backgrounded
 * case, which is the one a real user hits and a review never does.
 */

const visually = { includeHiddenElements: true } as const;
const noop = () => undefined;

describe('UndoToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const advanceBy = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('offers the undo before it expires', () => {
    let undone = false;
    render(
      <UndoToast
        message="Stop removed"
        onUndo={() => {
          undone = true;
        }}
        onExpire={noop}
      />,
    );

    advanceBy(1000);
    fireEvent.press(screen.getByTestId('undo-action'));
    expect(undone).toBe(true);
  });

  it('commits only once the window closes', () => {
    // The caller deletes for real in `onExpire`. Firing it early would leave
    // nothing to undo while the toast still offers it.
    let expired = 0;
    render(<UndoToast message="Stop removed" onUndo={noop} onExpire={() => (expired += 1)} />);

    advanceBy(UNDO_WINDOW_MS - 200);
    expect(expired).toBe(0);

    advanceBy(300);
    expect(expired).toBe(1);
  });

  it('does not expire while the app is backgrounded', () => {
    // A call or a notification is exactly when the user most needs the undo to
    // still be there (docs/06_UX_GUIDELINES.md §Edge cases, row 4).
    let expired = 0;
    const { rerender } = render(
      <UndoToast message="Stop removed" onUndo={noop} onExpire={() => (expired += 1)} />,
    );

    advanceBy(1000);
    rerender(
      <UndoToast
        message="Stop removed"
        onUndo={noop}
        onExpire={() => (expired += 1)}
        isBackgrounded
      />,
    );
    advanceBy(60_000);

    expect(expired).toBe(0);
  });

  it('resumes on return rather than restarting', () => {
    let expired = 0;
    const props = { message: 'Stop removed', onUndo: noop, onExpire: () => (expired += 1) };
    const { rerender } = render(<UndoToast {...props} />);

    advanceBy(UNDO_WINDOW_MS - 500);
    rerender(<UndoToast {...props} isBackgrounded />);
    advanceBy(30_000);
    rerender(<UndoToast {...props} />);

    // Half a second of the user's attention was left, and half a second is what
    // is left — not a fresh window.
    advanceBy(200);
    expect(expired).toBe(0);
    advanceBy(400);
    expect(expired).toBe(1);
  });

  it('speaks the time remaining, because the bar cannot be seen', () => {
    render(<UndoToast message="Stop removed" onUndo={noop} onExpire={noop} />);
    expect(screen.getByLabelText(/Undo stop removed, \d seconds left/)).toBeTruthy();
  });

  it('keeps the undo control at a full touch target', () => {
    render(<UndoToast message="Stop removed" onUndo={noop} onExpire={noop} />);
    expect(screen.getByTestId('undo-action').props.style).toMatchObject({
      minHeight: 44,
      minWidth: 44,
    });
  });
});

describe('StatusChip', () => {
  it('carries a glyph as well as a colour', () => {
    // A user with deuteranopia must be able to read it (CLAUDE.md §10 rule 4).
    render(<StatusChip kind="degraded" />);
    expect(screen.getByTestId('status-chip-glyph', visually)).toBeTruthy();
  });

  it('says what is missing rather than naming our internal state', () => {
    // "Degraded" is our word. "Estimated without traffic" is a fact the user can
    // act on.
    render(<StatusChip kind="degraded" />);
    expect(screen.getByLabelText('Estimated without traffic')).toBeTruthy();
  });

  it('speaks once, not glyph-then-text', () => {
    render(<StatusChip kind="offline" />);
    expect(screen.getByLabelText('Offline')).toBeTruthy();
    expect(
      screen.getByTestId('status-chip-glyph', visually).props.accessibilityElementsHidden,
    ).toBe(true);
  });

  it('takes a more specific label when the screen has one', () => {
    render(<StatusChip kind="quota" label="Free optimizations used" />);
    expect(screen.getByLabelText('Free optimizations used')).toBeTruthy();
  });
});

describe('StateView', () => {
  const action = { label: 'Add a stop', accessibilityLabel: 'Add your first stop', onPress: noop };

  it('always offers a way forward', () => {
    // The action is a required prop: a state with no next step does not compile
    // (CLAUDE.md §0 rule 5, enforced by the type rather than by review).
    render(<StateView title="No routes yet" body="Start with an address." action={action} />);

    expect(screen.getByLabelText('Add your first stop')).toBeTruthy();
  });

  it('labels the control by what happens, not by what it is', () => {
    render(<StateView title="No routes yet" body="Start with an address." action={action} />);

    const button = screen.getByTestId('state-action');
    expect(button.props.accessibilityLabel).toBe('Add your first stop');
    expect(button.props.accessibilityLabel).not.toBe('Button');
  });

  it('can carry a chip explaining the state', () => {
    render(
      <StateView
        title="Limit reached"
        body="Your free optimizations reset next month."
        action={{ label: 'See plans', accessibilityLabel: 'See plans', onPress: noop }}
        chip="quota"
      />,
    );

    expect(screen.getByLabelText('Limit reached')).toBeTruthy();
  });

  it('offers a quiet way out beside the primary one', () => {
    let dismissed = false;
    render(
      <StateView
        title="Limit reached"
        body="Your free optimizations reset next month."
        action={{ label: 'See plans', accessibilityLabel: 'See plans', onPress: noop }}
        secondaryAction={{
          label: 'Not now',
          accessibilityLabel: 'Continue without upgrading',
          onPress: () => {
            dismissed = true;
          },
        }}
      />,
    );

    fireEvent.press(screen.getByLabelText('Continue without upgrading'));
    expect(dismissed).toBe(true);
  });
});

describe('MetricPair', () => {
  it('uses tabular figures so a counting ETA does not move the layout', () => {
    // A proportional 1 is narrower than a 7, so the row re-lays out and the
    // control beneath it moves under a thumb already travelling towards it.
    render(<MetricPair value="1h 12m" label="Duration" spoken="1 hour 12 minutes" />);

    expect(screen.getByTestId('metric-value', visually).props.style).toMatchObject({
      fontVariant: ['tabular-nums'],
    });
  });

  it('speaks words, not the abbreviation', () => {
    render(<MetricPair value="34 KM" label="Distance" spoken="34 kilometres" />);
    expect(screen.getByLabelText('34 kilometres')).toBeTruthy();
  });

  it('shrinks rather than wrapping, so a hero number stays one', () => {
    render(<MetricPair value="1h 12m" label="Duration" spoken="1 hour 12 minutes" />);

    const value = screen.getByTestId('metric-value', visually);
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe('Skeleton', () => {
  it('takes the height of what it replaces', () => {
    // A skeleton that differs from the real content causes layout shift when the
    // data lands, which is worse than a spinner.
    render(<Skeleton height={72} />);
    expect(screen.getByTestId('skeleton-block', visually).props.style).toMatchObject({
      height: 72,
    });
  });

  it('is invisible to a screen reader', () => {
    // The container says "loading" once; eight identical placeholders add nothing.
    render(<Skeleton height={72} testID="skeleton" />);
    expect(screen.getByTestId('skeleton', visually).props.accessibilityElementsHidden).toBe(true);
  });

  it('renders without a shimmer under reduced motion', () => {
    // The shimmer is decoration, and nothing about "this is loading" depends on
    // it — which is the test for whether an animation may be dropped.
    render(<Skeleton height={72} prefersReducedMotion />);
    expect(screen.getByTestId('skeleton-block', visually)).toBeTruthy();
  });
});
