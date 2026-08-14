import { FlatList, Pressable, Text, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { historyRowOf } from '@/lib/route/history-row';
import type { SavedRouteSummary } from '@/lib/route/persistence';
import { LIST_VIRTUALISATION_THRESHOLD } from '@/types';

/** The History reference surface: a simple, restartable list of confirmed routes. */
export interface HistoryViewProps {
  readonly routes: readonly SavedRouteSummary[];
  readonly isLoading: boolean;
  readonly isUnavailable?: boolean;
  onRetry?: () => void;
  onOpen: (routeId: string) => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function HistoryView({
  routes,
  isLoading,
  isUnavailable = false,
  onRetry,
  onOpen,
  theme,
  testID,
}: HistoryViewProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.bg,
        paddingHorizontal: layout.screenPadding,
      }}
      testID={testID}
    >
      <AppHeader showBrand theme={theme} testID="history-app-header" />
      <Text
        accessibilityRole="header"
        style={{
          color: palette.textPrimary,
          fontSize: 30,
          lineHeight: 36,
          fontWeight: '700',
          marginTop: space.space4,
        }}
      >
        History
      </Text>
      <Text
        style={{
          color: palette.textSecondary,
          fontSize: 15,
          lineHeight: 21,
          marginTop: space.space1,
        }}
      >
        Your confirmed itineraries, ready to restart.
      </Text>

      {!isLoading && isUnavailable && (
        <HistoryState
          title="Could not load your routes"
          detail="Your saved routes have not been removed. Reconnect and try again."
          actionLabel="Try again"
          {...(onRetry === undefined ? {} : { onAction: onRetry })}
          theme={theme}
          testID="history-unavailable"
        />
      )}

      {!isLoading && !isUnavailable && routes.length === 0 && (
        <HistoryState
          title="No saved routes yet"
          detail="Confirm an optimized route and it will appear here, ready to reopen without optimizing it again."
          theme={theme}
          testID="history-empty"
        />
      )}

      {!isLoading && !isUnavailable && routes.length > 0 && (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.routeId}
          initialNumToRender={LIST_VIRTUALISATION_THRESHOLD}
          contentContainerStyle={{ paddingTop: space.space5, paddingBottom: space.space7 }}
          renderItem={({ item }) => <RouteRow summary={item} onOpen={onOpen} theme={theme} />}
          testID="history-list"
        />
      )}
    </View>
  );
}

function HistoryState({
  title,
  detail,
  actionLabel,
  onAction,
  theme,
  testID,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];
  return (
    <View
      style={{
        marginTop: space.space5,
        padding: space.space4,
        borderRadius: radius.radiusLg,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
        alignItems: 'center',
      }}
      testID={testID}
    >
      <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: '700' }}>{title}</Text>
      <Text
        style={{
          color: palette.textSecondary,
          fontSize: 14,
          lineHeight: 20,
          textAlign: 'center',
          marginTop: space.space2,
        }}
      >
        {detail}
      </Text>
      {actionLabel !== undefined && onAction !== undefined && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={{
            minHeight: 44,
            marginTop: space.space4,
            paddingHorizontal: space.space5,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.accentOn, fontSize: 15, fontWeight: '700' }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

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
      onPress={() => onOpen(row.routeId)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.spoken}`}
      style={{
        minHeight: 84,
        marginBottom: space.space3,
        padding: space.space3,
        borderRadius: radius.radiusLg,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
      }}
      testID="history-row"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.space2 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: palette.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '700' }}
            numberOfLines={1}
          >
            {row.title}
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 13, marginTop: space.space1 }}>
            {row.meta}
          </Text>
          {row.metrics !== null && (
            <Text
              style={{
                color: palette.accent,
                fontSize: 13,
                fontWeight: '700',
                marginTop: space.space1,
              }}
            >
              {row.metrics}
            </Text>
          )}
        </View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.textPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.bg, fontSize: 24, fontWeight: '700' }}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}
