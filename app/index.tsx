import { Text, View } from 'react-native';

import { MAX_STOPS } from '@/types';

/**
 * Plan — the primary screen (docs/08_SCREEN_SPECIFICATIONS.md).
 *
 * The map and the stop-list sheet land in waves 4 and 5. What stands here now is
 * the route entry itself: everything else in the product is a modal over it,
 * which is what makes the three-tap guarantee reachable at all.
 */
export default function PlanScreen() {
  return (
    <View className="flex-1 items-center justify-center">
      <Text>2L Maps</Text>
      <Text>Plan a route of up to {MAX_STOPS} stops</Text>
    </View>
  );
}
