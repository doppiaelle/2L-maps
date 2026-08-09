import { UNDO_WINDOW_MS } from '@/types';

/**
 * The undo window, as a state machine rather than a `setTimeout`.
 *
 * Destructive actions execute immediately and offer undo rather than asking for
 * confirmation ([`docs/06_UX_GUIDELINES.md`](../../docs/06_UX_GUIDELINES.md) P8):
 * a dialog taxes every user to protect against a mistake that is both rare and
 * recoverable. That trade only holds if the undo is actually there when the user
 * reaches for it.
 *
 * **The window pauses while the app is backgrounded**, which is the whole reason
 * this is not a timeout. A call, a notification, a glance at another app —
 * exactly the moments a driver gets interrupted — would otherwise consume the
 * undo window silently, and the user would come back to a deletion they can no
 * longer reverse (docs/06 §Edge cases, row 4).
 *
 * Pure and clock-free: the caller supplies elapsed milliseconds, so the boundary
 * is tested without waiting for it.
 */

export interface UndoWindow {
  readonly durationMs: number;
  /** Only advances while running. This is the number the progress indicator
   *  reads, and the one a backgrounded app must not move. */
  readonly elapsedMs: number;
  readonly isPaused: boolean;
}

export type UndoEvent =
  | { readonly kind: 'tick'; readonly deltaMs: number }
  | { readonly kind: 'backgrounded' }
  | { readonly kind: 'foregrounded' };

export function openWindow(durationMs: number = UNDO_WINDOW_MS): UndoWindow {
  return { durationMs, elapsedMs: 0, isPaused: false };
}

export function advance(window: UndoWindow, event: UndoEvent): UndoWindow {
  switch (event.kind) {
    case 'backgrounded':
      return { ...window, isPaused: true };

    case 'foregrounded':
      return { ...window, isPaused: false };

    case 'tick': {
      // A tick that arrives while paused is discarded rather than queued. An
      // interval keeps firing in some backgrounded states, and replaying those
      // ticks on return would expire the window in one frame — the precise
      // failure the pause exists to prevent.
      if (window.isPaused) return window;

      // Negative deltas are ignored. A clock that steps backwards — a manual
      // time change, an NTP correction — must not extend an undo window, which
      // would make the toast outlive the action it belongs to.
      const delta = Math.max(0, event.deltaMs);
      return { ...window, elapsedMs: Math.min(window.durationMs, window.elapsedMs + delta) };
    }
  }
}

export function remainingMs(window: UndoWindow): number {
  return Math.max(0, window.durationMs - window.elapsedMs);
}

export function hasExpired(window: UndoWindow): boolean {
  return remainingMs(window) === 0;
}

/** 0 at the start, 1 when the window closes. What a progress indicator draws —
 *  derived rather than stored, so it cannot disagree with the elapsed time. */
export function progress(window: UndoWindow): number {
  if (window.durationMs <= 0) return 1;
  return Math.min(1, window.elapsedMs / window.durationMs);
}
