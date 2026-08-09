import { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { detentHeight, resolveDetent, showsStopList } from '@/lib/ui/sheet';
import type { SheetDetent } from '@/lib/ui/sheet';

/**
 * The stop list's container.
 *
 * A bottom sheet at every size, never a sidebar
 * ([ADR-0010](../../docs/adr/0010-mobile-only-scope.md)), with three detents
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 *
 * **The primary action is pinned to the sheet's bottom at every detent.** Its
 * position is learned once and stays true. A control that relocates under the
 * thumb during a gesture is a control the user misses while driving — which is
 * why it is rendered outside the scrolling area rather than at the end of it.
 *
 * **The sheet translates; it does not resize.** Height animation runs through
 * layout on the JS thread, and this transition has a 300 ms budget with no
 * dropped frames while the user's finger is on the glass (`CLAUDE.md` §6 rule 5).
 * The container is always full height and `translateY` moves it, which the
 * native driver can carry alone.
 *
 * **The drag has a visible alternative.** A swipe-only action is inaccessible
 * (`CLAUDE.md` §7 rule 4), so the handle is also a control: it is adjustable by
 * a screen reader and cycles on tap.
 */

export interface RouteSheetProps {
  readonly detent: SheetDetent;
  onDetentChange: (detent: SheetDetent) => void;
  /** Measured by the screen. The sheet never asks the window, so a test and a
   *  split-screen device answer the same way. */
  readonly screenHeight: number;
  readonly theme: ThemeName;
  /** Metrics and status chips. Visible at every detent, including peek. */
  readonly header: React.ReactNode;
  /** Pinned to the bottom. Never scrolls, never moves between detents. */
  readonly action: React.ReactNode;
  /** The stop list. Not mounted at peek, where it would cost frames behind
   *  content nobody can see. */
  readonly children: React.ReactNode;
  readonly prefersReducedMotion?: boolean;
  readonly testID?: string;
}

const ORDER: readonly SheetDetent[] = ['collapsed', 'half', 'expanded'];

export function RouteSheet({
  detent,
  onDetentChange,
  screenHeight,
  theme,
  header,
  action,
  children,
  prefersReducedMotion = false,
  testID,
}: RouteSheetProps): React.JSX.Element {
  const palette = colours[theme];

  const fullHeight = detentHeight('expanded', screenHeight);
  const restingOffset = fullHeight - detentHeight(detent, screenHeight);

  // The offset from fully open, in points. Zero is expanded; larger hides more.
  const offset = useSharedValue(restingOffset);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    // A detent set from elsewhere — selecting a stop raises the sheet — animates
    // the same way a released drag does, so the two are indistinguishable.
    offset.value = prefersReducedMotion
      ? restingOffset
      : withSpring(restingOffset, { damping: 20, stiffness: 180 });
  }, [restingOffset, prefersReducedMotion, offset]);

  const settle = useCallback(
    (height: number, velocity: number) => {
      onDetentChange(resolveDetent(height, velocity, screenHeight, detent));
    },
    [onDetentChange, screenHeight, detent],
  );

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStart.value = offset.value;
    })
    .onUpdate((event) => {
      // Clamped to the travel the sheet actually has. Rubber-banding past the
      // ends would imply a fourth detent that does not exist.
      const next = dragStart.value + event.translationY;
      offset.value = Math.min(fullHeight, Math.max(0, next));
    })
    .onEnd((event) => {
      const height = fullHeight - offset.value;
      // The pure function takes velocity positive when the sheet is *growing*;
      // the gesture reports positive when the finger moves *down*. Inverting it
      // here, once, is what stops a sheet that closes when flicked open.
      runOnJS(settle)(height, -event.velocityY);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  const step = (direction: 1 | -1) => {
    const index = ORDER.indexOf(detent);
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, index + direction))];
    if (next !== undefined && next !== detent) onDetentChange(next);
  };

  return (
    <Animated.View
      testID={testID}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: fullHeight,
          backgroundColor: palette.surface,
          borderTopLeftRadius: radius.radiusLg,
          borderTopRightRadius: radius.radiusLg,
        },
        animatedStyle,
      ]}
    >
      <GestureDetector gesture={pan}>
        {/* The handle is the drag target *and* the non-gesture control. A screen
            reader adjusts it; a tap cycles it. Both reach every detent. */}
        <Pressable
          onPress={() => {
            step(detent === 'expanded' ? -1 : 1);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Stop list"
          accessibilityValue={{ text: SPOKEN_DETENT[detent] }}
          accessibilityHint="Adjust to show more or fewer stops"
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            step(event.nativeEvent.actionName === 'increment' ? 1 : -1);
          }}
          style={{ minHeight: layout.touchMin, alignItems: 'center', justifyContent: 'center' }}
          testID="sheet-handle"
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: radius.radiusFull,
              backgroundColor: palette.border,
            }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </GestureDetector>

      <View style={{ paddingHorizontal: layout.screenPadding }} testID="sheet-header">
        {header}
      </View>

      {/* Not mounted at peek. A virtualised list behind content nobody can see
          still measures, still renders, and still costs the transition. */}
      {showsStopList(detent) && (
        <View style={{ flex: 1, marginTop: space.space3 }} testID="sheet-content">
          {children}
        </View>
      )}

      {/* Pinned. Outside the scrolling area, after everything else, so its
          position is identical at all three detents. */}
      <View
        style={{
          paddingHorizontal: layout.screenPadding,
          paddingTop: space.space3,
          paddingBottom: space.space5,
        }}
        testID="sheet-action"
      >
        {action}
      </View>
    </Animated.View>
  );
}

/** What a screen reader says the sheet is showing. Product words, not
 *  `collapsed`/`expanded`, which describe the widget rather than the content. */
const SPOKEN_DETENT: Readonly<Record<SheetDetent, string>> = {
  collapsed: 'summary only',
  half: 'showing the stop list',
  expanded: 'showing the stop list and its actions',
};
