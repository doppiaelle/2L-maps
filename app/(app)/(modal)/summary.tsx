import { router } from 'expo-router';
import { Pressable, Text, View, useColorScheme } from 'react-native';

import { MetricPair } from '@/components/primitives/MetricPair';
import { useDraftRouteStore, useRouteProgressStore } from '@/features/stores';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import { formatDistance, formatDuration } from '@/lib/format/units';
import { summarise } from '@/lib/route/progress';

/**
 * Route summary — the end of the day.
 *
 * Presented full, because it is a terminal moment rather than another sheet over
 * a map the driver has finished with
 * ([`docs/10_NAVIGATION_FLOW.md`](../../../docs/10_NAVIGATION_FLOW.md) §6).
 *
 * **Time saved is a measurement or it is absent.** The figure compares the
 * optimized duration against the duration of the user's own entry order, which
 * the server records as `baseline_duration_s`
 * ([`docs/12_DATABASE.md`](../../../docs/12_DATABASE.md)). Without that baseline
 * there is nothing to compare, and an invented "you saved 40 minutes" is the
 * kind of claim that makes every other number on the screen suspect.
 */
export default function SummaryScreen(): React.JSX.Element {
  const scheme = useColorScheme();
  const palette = colours[scheme === 'dark' ? 'dark' : 'light'];

  const draft = useDraftRouteStore((store) => store.draft);
  const result = useDraftRouteStore((store) => store.result);
  const progress = useRouteProgressStore((store) => store.progress);
  const abandon = useRouteProgressStore((store) => store.abandon);

  const counts = progress === null ? null : summarise(progress, draft.stops);

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg, padding: layout.screenPadding }}
      testID="summary-screen"
    >
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        Route finished
      </Text>

      <View className="flex-row gap-space-6" style={{ marginTop: space.space5 }}>
        <MetricPair
          value={String(counts?.completed ?? 0)}
          label="Stops done"
          spoken={`${counts?.completed ?? 0} stops completed`}
          size="xl"
          testID="summary-completed"
        />
        {result !== null && !result.isDegraded && (
          <MetricPair
            value={formatDuration(result.totalDurationSeconds)}
            label="Driving"
            spoken={formatDuration(result.totalDurationSeconds)}
            size="xl"
            testID="summary-duration"
          />
        )}
      </View>

      {result !== null && (
        <Text className="text-body text-text-secondary mt-space-3">
          {formatDistance(result.totalDistanceMeters, 'metric')} across {counts?.total ?? 0} stops
        </Text>
      )}

      {counts !== null && counts.skipped > 0 && (
        // Skipped stops are reported, never rounded away: they are the ones the
        // driver may have to come back to.
        <Text className="text-body text-warning mt-space-2" testID="summary-skipped">
          {counts.skipped} skipped
        </Text>
      )}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => {
          // The route is over; clearing progress is what lets the next one
          // start. Named `abandon` in the store because it discards a driving
          // day — here it is simply the end of one.
          abandon();
          router.dismissAll();
        }}
        accessibilityRole="button"
        accessibilityLabel="Finish and return to planning"
        style={{
          minHeight: layout.actionMinHeight,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="summary-done"
      >
        <Text className="text-body-strong text-accent-on">Done</Text>
      </Pressable>
    </View>
  );
}
