import { FlatList, Pressable, Text, View } from 'react-native';

import { StateView } from '@/components/feedback/StateView';
import { AppHeader } from '@/components/navigation/AppHeader';
import { Skeleton } from '@/components/primitives/Skeleton';
import { StatusChip } from '@/components/primitives/StatusChip';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { SaveNotice } from '@/lib/route/save-notice';
import { historyRowOf } from '@/lib/route/history-row';
import type { SavedRouteSummary } from '@/lib/route/persistence';
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
  /**
   * A route that has not reached the server yet, and why.
   *
   * **It is said here rather than over the route** ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
   * What has gone wrong is that a route is missing from *this* list, so this is
   * where a driver can act on it — and Confirm, which they press to set off, is
   * never covered by a panel about filing. The previous placement was worse than
   * useless: it sat on the pill and its own dismiss button re-ran the write, so
   * a repeated failure reopened it immediately.
   */
  readonly notice?: SaveNotice | null;
  onRetryNotice?: () => void;
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
  notice = null,
  onRetryNotice,
  theme,
  testID,
}: HistoryViewProps): React.JSX.Element {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colours[theme].bg,
        paddingHorizontal: layout.screenPadding,
        paddingTop: 0,
      }}
      testID={testID}
    >
      <AppHeader showBrand theme={theme} testID="history-app-header" />
      <Text
        accessibilityRole="header"
        style={{
          color: colours[theme].textPrimary,
          fontSize: 34,
          lineHeight: 40,
          fontWeight: '700',
          marginTop: space.space5,
        }}
      >
        History
      </Text>
      <Text
        style={{
          color: colours[theme].textSecondary,
          fontSize: 16,
          lineHeight: 23,
          marginTop: space.space1,
        }}
      >
        Your confirmed itineraries, ready to restart.
      </Text>

      {notice !== null && (
        // Above the list, in the flow rather than over it: nothing here is
        // urgent enough to cover a row, and the driver's work is safe on the
        // phone either way — which is what it says.
        <View
          style={{
            marginTop: space.space4,
            padding: space.space3,
            borderRadius: radius.radiusMd,
            borderWidth: 1,
            borderColor: colours[theme].border,
            borderLeftWidth: 3,
            borderLeftColor: colours[theme].warning,
          }}
          accessibilityLiveRegion="polite"
          testID="history-save-notice"
        >
          <Text className="text-body-strong text-text-primary">{notice.title}</Text>
          <Text className="text-caption text-text-secondary mt-space-1">{notice.detail}</Text>

          {notice.canRetry && onRetryNotice !== undefined && (
            <Pressable
              onPress={onRetryNotice}
              accessibilityRole="button"
              accessibilityLabel="Try saving this route again"
              style={{ minHeight: layout.touchMin, justifyContent: 'center' }}
              testID="history-save-retry"
            >
              <Text className="text-body-strong text-accent">Try again</Text>
            </Pressable>
          )}
        </View>
      )}

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
          contentContainerStyle={{ paddingTop: space.space5, paddingBottom: space.space7 }}
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

/**
 * One saved route, at a glance.
 *
 * Four facts in the order a driver asks for them — when, how big, where from and
 * to, how far — and every one of them decided by `historyRowOf` rather than
 * here. What the row does is lay them out.
 *
 * **The journey line is the reason this was rebuilt.** A title, a distance and a
 * duration are identical across a week of rounds, so a driver looking for last
 * Tuesday had to open routes until they found it.
 */
function RouteRow({
  summary,
  onOpen,
  theme,
}: {
  summary: SavedRouteSummary;
  onOpen: (routeId: string) => void;
  theme: ThemeName;
}): React.JSX.Element {
  const row = historyRowOf(summary);
  const palette = colours[theme];

  return (
    <Pressable
      onPress={() => {
        onOpen(row.routeId);
      }}
      accessibilityRole="button"
      // The row is one accessibility element. A screen reader walking a title, a
      // journey and two metrics as four separate stops learns the same thing
      // four times and cannot tell where one route ends and the next begins.
      accessibilityLabel={`Open ${row.spoken}`}
      accessibilityHint="Loads this route, ready to optimize"
      style={{
        minHeight: 96,
        marginBottom: space.space3,
        paddingHorizontal: space.space3,
        paddingVertical: space.space3,
        borderRadius: radius.radiusLg,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
      }}
      testID="history-row"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.space2 }}>
        <Text
          style={{ color: palette.textPrimary, fontSize: 18, lineHeight: 23, fontWeight: '700' }}
          className="flex-1"
          numberOfLines={1}
        >
          {row.title}
        </Text>

        {row.status !== null && (
          <StatusChip
            kind={row.status === 'in-progress' ? 'stale' : 'quota'}
            label={row.status === 'in-progress' ? 'In progress' : 'Done'}
          />
        )}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.textPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.bg, fontSize: 28, fontWeight: '700' }}>›</Text>
        </View>
      </View>

      <Text style={{ color: palette.textSecondary, fontSize: 14, marginTop: space.space1 }}>
        {row.meta}
      </Text>

      {row.journey !== null && (
        // One line, truncated at the end rather than wrapped: two routes whose
        // rows are different heights are two routes the eye has to measure
        // before it can compare them.
        <Text
          style={{ color: palette.textSecondary, fontSize: 13, marginTop: space.space1 }}
          numberOfLines={1}
        >
          {row.journey}
        </Text>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.space1 }}>
        {row.metrics !== null && (
          <Text style={{ color: palette.accent, fontSize: 14, fontWeight: '700' }}>
            {row.metrics}
          </Text>
        )}

        {row.isDegraded && (
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
