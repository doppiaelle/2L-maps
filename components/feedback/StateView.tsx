import { Pressable, Text, View } from 'react-native';

import { StatusChip } from '@/components/primitives/StatusChip';
import type { StatusChipKind } from '@/components/primitives/StatusChip';
import { layout, radius, space } from '@/lib/design/tokens';

/**
 * One component for every non-content state: empty, error, offline,
 * quota-blocked, entitlement-blocked.
 *
 * **The action is a required prop, and that is the point.** `CLAUDE.md` §0 rule
 * 5 says every error path has a user-visible outcome *and a next action*, and
 * [`docs/06_UX_GUIDELINES.md`](../../docs/06_UX_GUIDELINES.md) turns that into a
 * prop-level check. Making it required means a state with no way forward does
 * not compile — mechanically enforced instead of caught in review, or not caught
 * at all.
 *
 * Where a state genuinely has no fix the user can apply, the action is still
 * real: it is the way *out*. "Back to my route" is an action. Silence is not.
 */

export interface StateAction {
  readonly label: string;
  /** Says what happens, not what the control is (`CLAUDE.md` §10 rule 1). */
  readonly accessibilityLabel: string;
  onPress: () => void;
}

export interface StateViewProps {
  readonly title: string;
  readonly body: string;
  /** Required. A state with no way forward is the bug this prop prevents. */
  readonly action: StateAction;
  /** A second, quieter way out — "Not now" beside "Upgrade". */
  readonly secondaryAction?: StateAction;
  readonly chip?: StatusChipKind;
  readonly testID?: string;
}

export function StateView({
  title,
  body,
  action,
  secondaryAction,
  chip,
  testID,
}: StateViewProps): React.JSX.Element {
  return (
    <View
      className="items-center justify-center px-screen-padding py-space-6"
      testID={testID}
      // Announced as a group, so the reason and the way out arrive together
      // rather than as two separate discoveries.
      accessibilityRole="alert"
    >
      {chip !== undefined && (
        <View className="mb-space-3">
          <StatusChip kind={chip} />
        </View>
      )}

      <Text
        className="text-title-md text-text-primary text-center"
        accessibilityRole="header"
        testID="state-title"
      >
        {title}
      </Text>

      <Text className="text-body text-text-secondary text-center mt-space-2" testID="state-body">
        {body}
      </Text>

      <Pressable
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.accessibilityLabel}
        className="bg-accent items-center justify-center mt-space-5 px-space-6 rounded-md"
        style={{ minHeight: layout.touchMin }}
        testID="state-action"
      >
        <Text className="text-body-strong text-accent-on">{action.label}</Text>
      </Pressable>

      {secondaryAction !== undefined && (
        <Pressable
          onPress={secondaryAction.onPress}
          accessibilityRole="button"
          accessibilityLabel={secondaryAction.accessibilityLabel}
          className="items-center justify-center px-space-6"
          style={{
            minHeight: layout.touchMin,
            marginTop: space.space2,
            borderRadius: radius.radiusMd,
          }}
          testID="state-secondary-action"
        >
          <Text className="text-body text-text-secondary">{secondaryAction.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
