import { FlatList, Pressable, Text, View } from 'react-native';

import { StateView } from '@/components/feedback/StateView';
import { Skeleton } from '@/components/primitives/Skeleton';
import { StatusChip } from '@/components/primitives/StatusChip';
import { layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { formatDistance, formatDuration } from '@/lib/format/units';
import { displayName, type SavedRouteSummary } from '@/lib/route/persistence';
import { LIST_VIRTUALISATION_THRESHOLD } from '@/types';

/**
 * History — saved and past routes
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * Presentational. Every state it can be in is a prop, so all five —
 * loading, empty, error, populated, and populated-with-locked-rows — are
 * reachable in a test rather than only on a device with the right history.
 *
 * **A locked row is shown, not hidden.** Free keeps the last three
 * ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)) and the rest are
 * still the user's own work. Hiding them would be quieter and would also be the
 * product deleting a driver's records in order to sell them back.
 *
 * **A degraded route stays labelled for ever.** `is_degraded` is stored rather
 * than derived precisely so that a T0 result never comes back from History
 * looking like a T1 one (`CLAUDE.md` §7 rule 6).
 */

export interface HistoryViewProps {
  readonly routes: readonly SavedRouteSummary[];
  readonly locked: readonly SavedRouteSummary[];
  readonly isLoading: boolean;
  /** The read failed, which is not the same as an empty history and does not get
   *  the same screen. */
  readonly isUnavailable: boolean;
  onOpen: (routeId: string) => void;
  onRetry: () => void;
  onUpgrade: () => void;
  onDismiss: () => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function HistoryView({
  routes,
  locked,
  isLoading,
  isUnavailable,
  onOpen,
  onRetry,
  onUpgrade,
  onDismiss,
  theme,
  testID,
}: HistoryViewProps): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg px-screen-padding pt-space-6" testID={testID}>
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        History
      </Text>

      {isLoading && <LoadingRows />}

      {!isLoading && isUnavailable && (
        <StateView
          title="Could not load your routes"
          body="They are still saved. This is a connection problem, not a lost day."
          action={{
            label: 'Try again',
            accessibilityLabel: 'Try loading your routes again',
            onPress: onRetry,
          }}
          secondaryAction={{
            label: 'Back to my route',
            accessibilityLabel: 'Go back to the route you are planning',
            onPress: onDismiss,
          }}
          chip="offline"
          testID="history-unavailable"
        />
      )}

      {!isLoading && !isUnavailable && routes.length === 0 && locked.length === 0 && (
        <StateView
          title="No saved routes yet"
          body="A route is saved as soon as you optimize it. Nothing to file, nothing to remember."
          action={{
            label: 'Back to my route',
            accessibilityLabel: 'Go back to the route you are planning',
            onPress: onDismiss,
          }}
          testID="history-empty"
        />
      )}

      {!isLoading && !isUnavailable && (routes.length > 0 || locked.length > 0) && (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.routeId}
          // Virtualised above twenty rows, which is where a plain map starts
          // costing frames on the hardware this is built for
          // (`CLAUDE.md` §6 rule 3).
          initialNumToRender={LIST_VIRTUALISATION_THRESHOLD}
          contentContainerStyle={{ paddingTop: space.space4, paddingBottom: space.space8 }}
          renderItem={({ item }) => <RouteRow summary={item} onOpen={onOpen} theme={theme} />}
          ListFooterComponent={
            locked.length === 0 ? null : (
              <LockedSection count={locked.length} onUpgrade={onUpgrade} />
            )
          }
          testID="history-list"
        />
      )}
    </View>
  );
}

function RouteRow({
  summary,
  onOpen,
  theme: _theme,
}: {
  summary: SavedRouteSummary;
  onOpen: (routeId: string) => void;
  theme: ThemeName;
}): React.JSX.Element {
  const name = displayName(summary);
  const distance =
    summary.distanceMeters === null ? null : formatDistance(summary.distanceMeters, 'metric');
  const duration =
    summary.durationSeconds === null ? null : formatDuration(summary.durationSeconds);

  // The row is one accessibility element. A screen reader walking a name, a
  // distance and a duration as three separate stops learns the same thing three
  // times and cannot tell where one route ends and the next begins.
  const spoken = [name, summary.isDegraded ? 'estimated without traffic' : null, distance, duration]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    <Pressable
      onPress={() => {
        onOpen(summary.routeId);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${spoken}`}
      style={{ minHeight: layout.touchMin, marginBottom: layout.listRowGap }}
      testID="history-row"
    >
      <Text className="text-body-strong text-text-primary">{name}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.space1 }}>
        {(distance !== null || duration !== null) && (
          <Text className="text-caption text-text-secondary">
            {[distance, duration].filter((part) => part !== null).join(' · ')}
          </Text>
        )}

        {summary.isDegraded && (
          <View style={{ marginLeft: space.space2 }}>
            {/* Stored on the route, so the label survives every reload. A T0
                result that stops looking degraded once it is saved is the one
                way this product could mislead about what it promised. */}
            <StatusChip kind="degraded" />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/**
 * The routes over the allowance.
 *
 * Presented as a count and an offer rather than as rows the user can tap and be
 * refused. Naming them individually would be a list of locked doors; naming the
 * number is the honest version of the same fact.
 */
function LockedSection({
  count,
  onUpgrade,
}: {
  count: number;
  onUpgrade: () => void;
}): React.JSX.Element {
  return (
    <View style={{ marginTop: space.space5 }} testID="history-locked">
      <Text className="text-body text-text-secondary">
        {count === 1 ? '1 older route is saved' : `${count} older routes are saved`} and kept. Pro
        opens your full history.
      </Text>

      <Pressable
        onPress={onUpgrade}
        accessibilityRole="button"
        accessibilityLabel="See what Pro includes"
        style={{
          minHeight: layout.touchMin,
          marginTop: space.space3,
          borderRadius: radius.radiusMd,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="history-upgrade"
      >
        <Text className="text-body-strong text-accent">See Pro</Text>
      </Pressable>
    </View>
  );
}

/** A skeleton that matches the row it replaces, so nothing shifts when the data
 *  lands (`docs/09_COMPONENT_LIBRARY.md` §8). */
function LoadingRows(): React.JSX.Element {
  return (
    <View
      style={{ marginTop: space.space4 }}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your routes"
      testID="history-loading"
    >
      {[0, 1, 2].map((index) => (
        <View key={index} style={{ marginBottom: layout.listRowGap }}>
          <Skeleton height={20} width="60%" />
          <View style={{ height: space.space1 }} />
          <Skeleton height={14} width="35%" />
        </View>
      ))}
    </View>
  );
}
