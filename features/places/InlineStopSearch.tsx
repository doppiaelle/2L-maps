import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { useConnectivity } from '@/features/network/connectivity-provider';
import { useAddressBook } from '@/features/places/use-address-book';
import { usePlaceSearch } from '@/features/places/use-place-search';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { useDraftRouteStore } from '@/features/stores';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { isOffline } from '@/lib/network/connectivity';
import { canSubmitSearch, searchStateOf } from '@/lib/places/search';
import type { SourcedOption } from '@/lib/places/search';
import { newStopId } from '@/lib/route/route-id';
import { placeTextFrom } from '@/lib/route/stop-text';

export interface InlineStopSearchProps {
  readonly theme: ThemeName;
  onClose: () => void;
}

/** Route 02A: autocomplete remains over the visible route instead of becoming a new screen. */
export function InlineStopSearch({ theme, onClose }: InlineStopSearchProps): React.JSX.Element {
  const palette = colours[theme];
  const draft = useDraftRouteStore((store) => store.draft);
  const addStop = useDraftRouteStore((store) => store.addStopToDraft);
  const { allowances } = useUsageQuota();
  const search = usePlaceSearch();
  const book = useAddressBook();
  const connectivity = useConnectivity();
  const offline = isOffline(connectivity);
  const state = searchStateOf({
    query: search.query,
    submittedQuery: search.submittedQuery,
    recents: book.recent,
    favourites: book.saved,
    results: search.results,
    isSearching: search.isSearching,
    failure: search.failure,
    isOffline: offline,
    stopCount: draft.stops.length,
    maxStops: allowances.maxStopsPerRoute,
  });

  const options =
    state.kind === 'at-capacity' || state.kind === 'no-match' || state.kind === 'failed'
      ? []
      : state.options;

  const choose = (option: SourcedOption) => {
    addStop({
      id: newStopId(),
      placeId: option.placeId,
      label: null,
      placeText: placeTextFrom(option, new Date()),
      note: null,
      position: draft.stops.length,
      entryOrder: draft.stops.length,
      coordinate: null,
    });
    book.record(option.placeId);
    search.endSession();
    onClose();
  };

  const canSubmit = canSubmitSearch({
    query: search.query,
    submittedQuery: search.submittedQuery,
    isOffline: offline,
    isSearching: search.isSearching,
  });

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 20 }} testID="route-search-open">
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close address search"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.66)' : 'rgba(17,17,18,0.28)',
        }}
        testID="route-search-dim"
      />
      <View
        style={{
          marginHorizontal: layout.screenPadding,
          marginTop: 96,
          borderRadius: radius.radiusMd,
          backgroundColor: palette.surfaceRaised,
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 20,
          elevation: 12,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row', padding: space.space2, gap: space.space2 }}>
          <TextInput
            autoFocus
            value={search.query}
            onChangeText={search.setQuery}
            onSubmitEditing={search.submit}
            returnKeyType="search"
            placeholder="Search an address or place…"
            placeholderTextColor={palette.textTertiary}
            style={{
              flex: 1,
              minHeight: 44,
              paddingHorizontal: space.space3,
              borderRadius: radius.radiusSm,
              backgroundColor: palette.bg,
              color: palette.textPrimary,
              fontSize: 14,
            }}
            accessibilityLabel="Address or place"
            testID="inline-stop-input"
          />
          <Pressable
            onPress={search.submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Search"
            style={{
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.radiusSm,
              backgroundColor: canSubmit ? palette.textPrimary : palette.border,
            }}
            testID="inline-stop-submit"
          >
            <Text
              style={{ color: canSubmit ? palette.bg : palette.textTertiary, fontWeight: '700' }}
            >
              →
            </Text>
          </Pressable>
        </View>

        {state.kind === 'at-capacity' && (
          <Message
            title="This route is full"
            detail={`Your plan covers up to ${state.limit} stops.`}
            theme={theme}
          />
        )}
        {state.kind === 'failed' && (
          <Message
            title="Search is unavailable"
            detail="Your saved addresses still work. Try again when the connection is available."
            theme={theme}
          />
        )}
        {state.kind === 'no-match' && (
          <Message
            title="No match found"
            detail={`No place matched “${state.query}”.`}
            theme={theme}
          />
        )}
        {state.kind === 'searching' && (
          <Text
            style={{
              paddingHorizontal: space.space4,
              paddingBottom: space.space2,
              color: palette.accent,
              fontSize: 12,
            }}
          >
            Searching…
          </Text>
        )}

        <FlatList
          data={options}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => `${item.source}:${item.placeId}`}
          style={{ maxHeight: 260 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => choose(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.primaryText}, ${item.secondaryText}`}
              style={{
                minHeight: 60,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space.space3,
                borderTopWidth: 1,
                borderTopColor: palette.border,
              }}
              testID="inline-stop-option"
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: palette.accentSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: space.space3,
                }}
              >
                <Text style={{ color: palette.accent, fontSize: 13 }}>●</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '700' }}
                >
                  {item.primaryText}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}
                >
                  {item.secondaryText}
                </Text>
              </View>
            </Pressable>
          )}
          testID="inline-stop-results"
        />
      </View>
    </View>
  );
}

function Message({
  title,
  detail,
  theme,
}: {
  title: string;
  detail: string;
  theme: ThemeName;
}): React.JSX.Element {
  const palette = colours[theme];
  return (
    <View style={{ padding: space.space4, borderTopWidth: 1, borderTopColor: palette.border }}>
      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: space.space1 }}>
        {detail}
      </Text>
    </View>
  );
}
