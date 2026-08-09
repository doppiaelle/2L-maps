import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { useLaunchDestination } from '@/features/navigation/use-launch-destination';
import { useRouteProgressStore } from '@/features/stores';
import { MAX_STOPS } from '@/types';

/**
 * Plan — the primary screen ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 *
 * **It is never navigated to.** It is the root of the signed-in group, and every
 * other surface in the product is a modal over it — which is what makes the
 * three-tap guarantee reachable at all (`CLAUDE.md` §7 rule 1). A transition on
 * the critical path would spend one of those three taps on movement.
 *
 * The map and the sheet land in wave 5b; what is wired here is the launch
 * decision, which is what everything above it depends on.
 */
export default function PlanScreen(): React.JSX.Element {
  const pending = usePendingDeepLinkContext();
  const hasRouteInProgress = useRouteProgressStore((state) => state.progress !== null);

  const destination = useLaunchDestination({
    isStoreHydrated: true,
    hasRouteInProgress,
    pendingDeepLink: pending.target,
  });

  useEffect(() => {
    // Cleared once honoured. Leaving it set would re-open the same route every
    // time this screen re-renders, including after the user navigated away from
    // it deliberately.
    if (destination.kind === 'plan' && destination.mode === 'opened-route') pending.clear();
  }, [destination, pending]);

  return (
    <View className="flex-1 bg-bg items-center justify-center px-screen-padding">
      <Text className="text-title-lg text-text-primary">2L Maps</Text>
      <Text className="text-body text-text-secondary mt-space-2 text-center">
        Plan a route of up to {MAX_STOPS} stops
      </Text>
    </View>
  );
}
