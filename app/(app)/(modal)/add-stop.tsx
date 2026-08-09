import { Text, View } from 'react-native';

/**
 * Modal: add stop ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * Presented over Plan and dismissed back to it, never adding depth
 * ([`docs/10_NAVIGATION_FLOW.md`](../../../docs/10_NAVIGATION_FLOW.md) §6).
 * Contents land in wave 5b.
 */
export default function Screen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg px-screen-padding pt-space-6">
      <Text className="text-title-md text-text-primary" accessibilityRole="header">
        add stop
      </Text>
    </View>
  );
}
