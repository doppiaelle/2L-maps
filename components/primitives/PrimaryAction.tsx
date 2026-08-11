import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { layout, radius, space } from '@/lib/design/tokens';

/**
 * The one control the product is built around.
 *
 * It sits in the lower third, it is the largest touch target on screen, and the
 * three-tap path runs through it (`CLAUDE.md` §7 rules 1 and 2). So its states
 * are not decoration — each one is a different sentence the product is saying,
 * and getting them wrong means telling a driver the wrong thing.
 *
 * **Every state is a discriminated union member**, not a set of booleans. Three
 * booleans admit a fourth combination that means nothing, and the screen would
 * have to decide what to render for it — which is how "loading and disabled and
 * degraded" ends up showing a spinner on a button nobody can press.
 *
 * The component renders and reports taps. What the states *mean* is decided in
 * `lib/entitlement/plans.ts`; nothing here re-derives a rule (`CLAUDE.md` §1).
 */

export type PrimaryActionState =
  | { readonly kind: 'ready'; readonly label: string }
  /** The request is in flight. Progress shows after a second, never before —
   *  a spinner on a fast response is noise (docs/24_PERFORMANCE.md). */
  | { readonly kind: 'working'; readonly label: string }
  /** Something the user must fix first: too few stops, an address still
   *  resolving. The reason is shown, because a disabled control with no
   *  explanation reads as a broken one. */
  | { readonly kind: 'blocked'; readonly label: string; readonly reason: string }
  /** The allowance is spent but the route is small enough for the local solver.
   *  Labelled, because a degraded result must never look like a full one
   *  (`CLAUDE.md` §7 rule 6). */
  | { readonly kind: 'degraded'; readonly label: string; readonly note: string }
  /** The allowance is spent and a rewarded ad would buy one more
   *  ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)). */
  | { readonly kind: 'unlockable'; readonly label: string; readonly note: string };

export interface PrimaryActionProps {
  readonly state: PrimaryActionState;
  onPress: () => void;
  /**
   * How the control sits in its surroundings.
   *
   * `block` fills the width, which is right at the foot of a list where it is
   * the last thing on the page. `pill` is for the canvas: it floats over a
   * drawing rather than closing a column, so it takes only the width of its own
   * label and is lifted off the surface it sits on. Same height either way — 56
   * is what this control is, and a pill that shrank to fit a map would be a
   * smaller target in the harder place to press.
   */
  readonly shape?: 'block' | 'pill';
  /** Overrides the label for screen readers where the visible text is too terse
   *  to stand alone. The label says what happens, never what the element is
   *  (`CLAUDE.md` §10 rule 1). */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function PrimaryAction({
  state,
  onPress,
  shape = 'block',
  accessibilityLabel,
  testID,
}: PrimaryActionProps): React.JSX.Element {
  const isPressable = state.kind !== 'working' && state.kind !== 'blocked';
  const isPill = shape === 'pill';
  const note = 'note' in state ? state.note : null;
  const reason = state.kind === 'blocked' ? state.reason : null;

  return (
    <View
      className="px-screen-padding"
      style={isPill ? { alignItems: 'center' } : undefined}
      testID={testID}
    >
      {/* The note sits above the control rather than inside it: a degraded
          label crammed into a button is the first thing to be truncated at
          200% Dynamic Type, and it is the part that must survive. */}
      {note !== null && (
        <Text className="text-label-sm text-warning mb-space-2 uppercase" accessibilityRole="text">
          {note}
        </Text>
      )}

      <Pressable
        onPress={isPressable ? onPress : undefined}
        disabled={!isPressable}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? state.label}
        // Announced rather than only drawn, so a screen reader user knows the
        // control is busy instead of tapping it again (CLAUDE.md §10 rule 7).
        accessibilityState={{ disabled: !isPressable, busy: state.kind === 'working' }}
        accessibilityHint={reason ?? undefined}
        // 56, not the 44 pt floor: this control is pressed one-handed, in a van,
        // often without looking straight at it (docs/09_COMPONENT_LIBRARY.md §7).
        style={
          isPill
            ? {
                minHeight: layout.actionMinHeight,
                // Lifted off the drawing it floats over. Without it, mint on the
                // light theme's paper-coloured land is the same weak pairing the
                // route casing exists to solve (docs/07_DESIGN_SYSTEM.md).
                ...PILL_ELEVATION,
              }
            : { minHeight: layout.actionMinHeight }
        }
        className={[
          isPressable ? 'bg-accent active:bg-accent-pressed' : 'bg-accent-subtle',
          isPill ? 'rounded-full px-space-7' : 'rounded-lg px-space-4',
          'items-center justify-center',
        ].join(' ')}
      >
        {state.kind === 'working' ? (
          <View className="flex-row items-center gap-space-2">
            <ActivityIndicator accessibilityElementsHidden importantForAccessibility="no" />
            <Text className="text-body-strong text-accent-on">{state.label}</Text>
          </View>
        ) : (
          <Text
            className={
              isPressable
                ? 'text-body-strong text-accent-on'
                : 'text-body-strong text-text-tertiary'
            }
          >
            {state.label}
          </Text>
        )}
      </Pressable>

      {reason !== null && (
        // Visible as well as announced. A disabled control whose reason is only
        // in the accessibility tree is unexplained for everyone who can see.
        <Text className="text-caption text-text-secondary mt-space-2">{reason}</Text>
      )}
    </View>
  );
}

/**
 * The pill's shadow, in the one place its numbers live.
 *
 * A drop shadow rather than a border: the control has to read as being *above*
 * the canvas, and a border would read as another shape drawn on it. Android
 * takes `elevation`; iOS takes the four `shadow*` properties, and giving it only
 * `elevation` is the usual way a floating control ends up flat on one platform.
 */
const PILL_ELEVATION = {
  elevation: 6,
  shadowColor: '#000000',
  shadowOpacity: 0.18,
  shadowRadius: radius.radiusSm,
  shadowOffset: { width: 0, height: space.space1 },
} as const;
