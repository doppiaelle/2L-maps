import { router } from 'expo-router';
import { Text, View } from 'react-native';

/**
 * History — saved and past routes
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * A deliberate destination, so it is pushed rather than swapped: the user asked
 * to leave Plan and expects to come back to it.
 */
export default function HistoryScreen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg px-screen-padding pt-space-6">
      <Text className="text-title-md text-text-primary" accessibilityRole="header">
        History
      </Text>
      <Text
        className="text-body text-text-secondary mt-space-2"
        onPress={() => {
          router.back();
        }}
      >
        Saved and past routes.
      </Text>
    </View>
  );
}
