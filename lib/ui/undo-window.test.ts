import { advance, hasExpired, openWindow, progress, remainingMs } from './undo-window';
import { UNDO_WINDOW_MS } from '@/types';

/**
 * Undo replaces confirmation for every destructive action in this product
 * (docs/06_UX_GUIDELINES.md P8). That trade only holds if the window is there
 * when the user reaches for it, so the pause behaviour is tested as a
 * correctness rule rather than as a nicety.
 */

const tick = (ms: number) => ({ kind: 'tick', deltaMs: ms }) as const;

describe('the window', () => {
  it('opens at the documented duration', () => {
    expect(remainingMs(openWindow())).toBe(UNDO_WINDOW_MS);
  });

  it('closes exactly at its duration, not before', () => {
    const almost = advance(openWindow(1000), tick(999));
    expect(hasExpired(almost)).toBe(false);

    expect(hasExpired(advance(almost, tick(1)))).toBe(true);
  });

  it('never reports a negative remainder', () => {
    const overrun = advance(openWindow(1000), tick(5000));
    expect(remainingMs(overrun)).toBe(0);
    expect(progress(overrun)).toBe(1);
  });
});

describe('backgrounding', () => {
  it('stops the window while the app is away', () => {
    // A call, a notification, a glance at another app. Letting the window run
    // there means the user returns to a deletion they can no longer reverse
    // (docs/06 §Edge cases, row 4).
    let window = openWindow(1000);
    window = advance(window, tick(400));
    window = advance(window, { kind: 'backgrounded' });
    window = advance(window, tick(10_000));

    expect(remainingMs(window)).toBe(600);
    expect(hasExpired(window)).toBe(false);
  });

  it('resumes from where it stopped, not from the start', () => {
    // Restarting would be generous in the wrong direction: the toast would
    // outlive the action, and a later undo would surprise the user.
    let window = openWindow(1000);
    window = advance(window, tick(400));
    window = advance(window, { kind: 'backgrounded' });
    window = advance(window, { kind: 'foregrounded' });
    window = advance(window, tick(300));

    expect(remainingMs(window)).toBe(300);
  });

  it('discards ticks that arrive while paused rather than queuing them', () => {
    // An interval keeps firing in some backgrounded states. Replaying those on
    // return would expire the window in a single frame — exactly what pausing
    // exists to prevent.
    let window = advance(openWindow(1000), { kind: 'backgrounded' });
    for (let i = 0; i < 100; i += 1) window = advance(window, tick(50));
    window = advance(window, { kind: 'foregrounded' });

    expect(remainingMs(window)).toBe(1000);
  });
});

describe('a clock that misbehaves', () => {
  it('ignores a delta that runs backwards', () => {
    // A manual time change or an NTP correction must not extend an undo window.
    let window = advance(openWindow(1000), tick(500));
    window = advance(window, tick(-400));

    expect(remainingMs(window)).toBe(500);
  });

  it('treats a zero-length window as already closed', () => {
    expect(progress(openWindow(0))).toBe(1);
    expect(hasExpired(openWindow(0))).toBe(true);
  });
});
