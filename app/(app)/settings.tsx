import { Text, View } from 'react-native';

/**
 * Settings — account, preferences, legal
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 */
export default function SettingsScreen(): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg px-screen-padding pt-space-6">
      <Text className="text-title-md text-text-primary" accessibilityRole="header">
        Settings
      </Text>
    </View>
  );
}
