import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { layout, radius, space } from '@/lib/design/tokens';
import { advance, hasExpired, openWindow, progress, remainingMs } from '@/lib/ui/undo-window';
import { UNDO_WINDOW_MS } from '@/types';

/**
 * The toast that follows a destructive action.
 *
 * Destructive actions are undoable, not confirmed (`CLAUDE.md` §7 rule 7): a
 * dialog taxes every user to protect against a rare, recoverable mistake, while
 * an undo costs only the user who made it.
 *
 * Three things this component must get right, all of them from
 * [`docs/09_COMPONENT_LIBRARY.md`](../../docs/09_COMPONENT_LIBRARY.md) §8:
 *
 * **Non-blocking.** It never sits over the map during a route (`CLAUDE.md` §7
 * rule 8) and never captures the whole screen. The user can ignore it entirely.
 *
 * **Thumb-zone positioned.** The undo control is in the lower third, reachable
 * one-handed (`CLAUDE.md` §7 rule 2). A toast whose action is out of reach is a
 * toast that expires while the user shifts their grip.
 *
 * **The timer pauses while backgrounded.** That rule lives in
 * `lib/ui/undo-window.ts` and is tested there without a clock. This component
 * only feeds it ticks and the app's foreground state — which arrives as a prop,
 * so the whole tree answers that question the same way and the toast stays
 * testable.
 */

/** How often the window is advanced. Fine enough for a progress bar to look
 *  continuous, coarse enough that it costs nothing on the JS thread. */
const TICK_MS = 100;

export interface UndoToastProps {
  /** What was undone, in the user's terms: "Stop removed". */
  readonly message: string;
  onUndo: () => void;
  /** Fired when the window closes or the toast is dismissed. The caller commits
   *  the deletion here — never before, or there is nothing left to undo. */
  onExpire: () => void;
  readonly isBackgrounded?: boolean;
  readonly durationMs?: number;
  /**
   * How far above the bottom edge to float, in points.
   *
   * **The toast had no positioning at all.** It was a plain flex child, so it
   * pushed the map up by its own height every time it appeared — a layout jump
   * on a screen the user is looking at — and then landed in the strip the dock
   * occupies, painting over the navigation it was supposed to sit above.
   *
   * Passed rather than read from the dock's own constant, for the same reason
   * every other measurement in this codebase is passed: a component that asks
   * the device answers differently in a test, in split screen and on a foldable.
   * The screen owns the measurement.
   */
  readonly bottomOffset?: number;
  readonly testID?: string;
}

export function UndoToast({
  message,
  onUndo,
  onExpire,
  isBackgrounded = false,
  durationMs = UNDO_WINDOW_MS,
  bottomOffset = 0,
  testID,
}: UndoToastProps): React.JSX.Element {
  const [window, setWindow] = useState(() => openWindow(durationMs));

  // Held in a ref so the interval below never re-subscribes when the caller
  // passes a new inline closure — which it will, on every render. Restarting the
  // interval each time would reset the tick phase and stretch the window.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    setWindow((current) =>
      advance(current, { kind: isBackgrounded ? 'backgrounded' : 'foregrounded' }),
    );
  }, [isBackgrounded]);

  useEffect(() => {
    const interval = setInterval(() => {
      setWindow((current) => advance(current, { kind: 'tick', deltaMs: TICK_MS }));
    }, TICK_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const expired = hasExpired(window);
  useEffect(() => {
    if (expired) onExpireRef.current();
  }, [expired]);

  const secondsLeft = Math.ceil(remainingMs(window) / 1000);

  return (
    <View
      className="flex-row items-center bg-surface-raised border border-border"
      style={{
        // Above everything, over the bottom edge, out of the dock's way.
        position: 'absolute',
        left: layout.screenPadding,
        bottom: bottomOffset,
        paddingLeft: space.space4,
        paddingRight: space.space2,
        paddingVertical: space.space2,
        // Fully rounded and only as wide as its contents, so it reads as a
        // passing remark rather than a bar the screen has grown. It is the
        // quietest thing on screen that can still be acted on — a removal is
        // already done, and this is only the window in which it can be taken
        // back (docs/06 P8).
        borderRadius: radius.radiusFull,
        minHeight: layout.touchMin,
        gap: space.space3,
      }}
      // Announced when it appears, because the action it reports already
      // happened and the user may not have been looking at that part of the
      // screen (`CLAUDE.md` §10 rule 7).
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID={testID}
    >
      {/* No `flex-1`: the toast is as wide as what it says, not as wide as the
          screen. */}
      <Text className="text-body text-text-primary" numberOfLines={1}>
        {message}
      </Text>

      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        // The seconds are spoken, because a screen reader user cannot see the
        // bar draining and has the same few seconds to decide.
        accessibilityLabel={`Undo ${message.toLowerCase()}, ${secondsLeft} seconds left`}
        className="items-center justify-center px-space-4"
        style={{ minHeight: layout.touchMin, minWidth: layout.touchMin }}
        testID="undo-action"
      >
        <Text className="text-label-sm text-accent">Undo</Text>
      </Pressable>

      {/* The remaining time, drawn rather than only counted. Position is derived
          from the window so it cannot disagree with the deadline it represents —
          and it stops moving when the window pauses, which is the visible proof
          the undo is still there. */}
      <View
        className="absolute left-0 bottom-0 h-space-1 bg-accent"
        style={{
          width: `${(1 - progress(window)) * 100}%`,
          // Follows the pill's own corner rather than cutting square across it.
          borderBottomLeftRadius: radius.radiusFull,
          borderBottomRightRadius: radius.radiusFull,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="undo-progress"
      />
    </View>
  );
}
