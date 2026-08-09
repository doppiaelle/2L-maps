import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { layout } from '@/lib/design/tokens';

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
  /** Overrides the label for screen readers where the visible text is too terse
   *  to stand alone. The label says what happens, never what the element is
   *  (`CLAUDE.md` §10 rule 1). */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function PrimaryAction({
  state,
  onPress,
  accessibilityLabel,
  testID,
}: PrimaryActionProps): React.JSX.Element {
  const isPressable = state.kind !== 'working' && state.kind !== 'blocked';
  const note = 'note' in state ? state.note : null;
  const reason = state.kind === 'blocked' ? state.reason : null;

  return (
    <View className="px-screen-padding" testID={testID}>
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
        style={{ minHeight: layout.actionMinHeight }}
        className={
          isPressable
            ? 'bg-accent active:bg-accent-pressed rounded-lg items-center justify-center px-space-4'
            : 'bg-accent-subtle rounded-lg items-center justify-center px-space-4'
        }
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
