import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { RouteEnd, RouteEnds } from '@/lib/route/route-ends';

/**
 * Where the round starts, and where it finishes.
 *
 * **Both were invisible.** The origin has been on the draft since the first
 * commit and no screen ever drew it, so picking "My location" in the search
 * closed the modal and produced no visible change at all. And the end was
 * decided by accident: every route was one-way, which pins the **last typed
 * stop** as the destination and withholds it from the optimizer
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
 *
 * **A control, not a dialog.** It sits under the metrics, always visible, and
 * the driver reads it before pressing Optimize rather than answering a question
 * in front of it (`CLAUDE.md` §7 rule 8). It costs no tap on the three-tap path:
 * the defaults are already there and Optimize is still the next thing pressed.
 *
 * It decides nothing — `routeEndsOf` produces every word on it.
 */

export interface RouteEndsControlProps {
  readonly ends: RouteEnds;
  /** Opens the search in origin mode. The start is a place like any other, and
   *  the only way to change it is to pick one. */
  onEditStart: () => void;
  onSelectEnd: (end: RouteEnd) => void;
  /**
   * How many stops the optimizer may actually move, and out of how many.
   *
   * Shown because the difference is the whole of the reported problem: with
   * neither end chosen a four-stop round offers Google two of them, and nothing
   * on screen said so. Null hides the line — on a route too small for the
   * distinction to mean anything.
   */
  readonly reorderable?: { readonly movable: number; readonly total: number } | null;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function RouteEndsControl({
  ends,
  onEditStart,
  onSelectEnd,
  reorderable = null,
  theme,
  testID,
}: RouteEndsControlProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View style={{ marginTop: space.space3 }} testID={testID}>
      <Pressable
        onPress={onEditStart}
        accessibilityRole="button"
        accessibilityLabel={`${ends.startSpoken}. Change where the route starts`}
        style={{
          minHeight: layout.touchMin,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.space2,
        }}
        testID="route-start"
      >
        <Text className="text-label-xs text-text-tertiary">FROM</Text>
        <Text className="text-body-strong text-text-primary flex-1" numberOfLines={1}>
          {ends.startLabel}
        </Text>
      </Pressable>

      <View
        // One row, two halves, fixed width. The selected half is filled rather
        // than merely tinted: this is a choice that changes the answer, and a
        // faint outline is not enough to read at arm's length in a cab.
        style={{ flexDirection: 'row', gap: space.space2 }}
        accessibilityRole="radiogroup"
        testID="route-ends-options"
      >
        {ends.options.map((option) => (
          <Pressable
            key={option.end}
            onPress={() => {
              onSelectEnd(option.end);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: option.isSelected }}
            accessibilityLabel={option.accessibilityLabel}
            style={{
              flex: 1,
              minHeight: layout.touchMin,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.space2,
              borderRadius: radius.radiusFull,
              borderWidth: 1,
              borderColor: option.isSelected ? palette.accent : palette.border,
              backgroundColor: option.isSelected ? palette.accent : 'transparent',
            }}
            testID={`route-end-${option.end}`}
          >
            <Text
              className="text-caption-strong"
              style={{ color: option.isSelected ? palette.accentOn : palette.textSecondary }}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {reorderable !== null && (
        // Said plainly, because the number is the thing nobody could see. A
        // driver who knows two of their four stops are pinned can act on it;
        // one who does not just distrusts the answer.
        <Text
          className="text-caption text-text-secondary"
          style={{ marginTop: space.space1 }}
          testID="route-reorderable"
        >
          {reorderable.movable === reorderable.total
            ? 'All stops can be reordered'
            : `${reorderable.movable} of ${reorderable.total} stops can be reordered`}
        </Text>
      )}
    </View>
  );
}
