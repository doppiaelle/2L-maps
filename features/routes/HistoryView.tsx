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
  onOpen: (routeId: string) => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function HistoryView({
  routes,
  isLoading,
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
          color: palette.textSecondary,
          fontSize: 16,
          lineHeight: 23,
          marginTop: space.space1,
        }}
      >
        Your confirmed itineraries, ready to restart.
      </Text>

      {!isLoading && (
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
        minHeight: 96,
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
            style={{ color: palette.textPrimary, fontSize: 18, lineHeight: 23, fontWeight: '700' }}
            numberOfLines={1}
          >
            {row.title}
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 14, marginTop: space.space1 }}>
            {row.meta}
          </Text>
          {row.metrics !== null && (
            <Text
              style={{
                color: palette.accent,
                fontSize: 14,
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
            width: 44,
            height: 44,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.textPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.bg, fontSize: 28, fontWeight: '700' }}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}
