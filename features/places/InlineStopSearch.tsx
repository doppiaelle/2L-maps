import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { useLocation } from '@/features/location/location-provider';
import { useConnectivity } from '@/features/network/connectivity-provider';
import { useAddressBook } from '@/features/places/use-address-book';
import { usePlaceSearch } from '@/features/places/use-place-search';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { useDraftRouteStore, usePreferencesStore } from '@/features/stores';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { isOffline } from '@/lib/network/connectivity';
import {
  canSubmitSearch,
  offersCurrentLocation,
  searchStateOf,
  type SourcedOption,
} from '@/lib/places/search';
import { newStopId } from '@/lib/route/route-id';
import { placeTextFrom } from '@/lib/route/stop-text';

export interface InlineStopSearchProps {
  readonly theme: ThemeName;
  readonly topOffset: number;
  onClose: () => void;
}

/** Address search over the still-visible route. The route is blurred by its
 * owner; this layer remains sharp and owns every tap until it closes. */
export function InlineStopSearch({
  theme,
  topOffset,
  onClose,
}: InlineStopSearchProps): React.JSX.Element {
  const palette = colours[theme];
  const draft = useDraftRouteStore((store) => store.draft);
  const addStop = useDraftRouteStore((store) => store.addStopToDraft);
  const setOrigin = useDraftRouteStore((store) => store.setOrigin);
  const chooseRouteStart = usePreferencesStore((store) => store.chooseRouteStart);
  const location = useLocation();
  const bias = location.state.kind === 'ready' ? location.state.location.coordinate : null;
  const search = usePlaceSearch({ bias });
  const book = useAddressBook();
  const { allowances } = useUsageQuota();
  const connectivity = useConnectivity();
  const [locationFailure, setLocationFailure] = useState(false);
  const [isChoosingLocation, setIsChoosingLocation] = useState(false);
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
    state.kind === 'browsing' ||
    state.kind === 'searching' ||
    state.kind === 'results' ||
    state.kind === 'offline' ||
    state.kind === 'failed'
      ? state.options
      : [];

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

  const chooseCurrentLocation = async () => {
    setLocationFailure(false);
    setIsChoosingLocation(true);
    const enabled = await location.enable();
    setIsChoosingLocation(false);
    if (!enabled) {
      setLocationFailure(true);
      return;
    }

    chooseRouteStart('current-location');
    setOrigin(null, true);
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
    <View
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30 }}
      testID="route-search-open"
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close address search"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.38)' : 'rgba(17,17,18,0.20)',
        }}
        testID="route-search-dim"
      />

      <View
        style={{
          position: 'absolute',
          top: topOffset,
          left: layout.screenPadding,
          right: layout.screenPadding,
          maxHeight: 390,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surfaceRaised,
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
          overflow: 'hidden',
        }}
        testID="route-search-dropdown"
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
              minHeight: 48,
              paddingHorizontal: space.space3,
              borderRadius: radius.radiusMd,
              backgroundColor: palette.bg,
              color: palette.textPrimary,
              fontSize: 16,
            }}
            accessibilityLabel="Address or place"
            testID="inline-stop-input"
          />
          <Pressable
            onPress={search.submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Search"
            accessibilityState={{ disabled: !canSubmit }}
            style={{
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.radiusMd,
              backgroundColor: canSubmit ? palette.textPrimary : palette.border,
            }}
            testID="inline-stop-submit"
          >
            <Text
              style={{
                color: canSubmit ? palette.bg : palette.textTertiary,
                fontSize: 21,
                fontWeight: '700',
              }}
            >
              ⌕
            </Text>
          </Pressable>
        </View>

        {offersCurrentLocation(search.query) && state.kind !== 'at-capacity' && (
          <ResultRow
            title="My location"
            detail={
              location.state.kind === 'ready'
                ? 'Use the device position as the starting point'
                : isChoosingLocation
                  ? 'Locating…'
                  : 'Use as route starting point'
            }
            icon="◎"
            onPress={() => {
              void chooseCurrentLocation();
            }}
            disabled={isChoosingLocation}
            theme={theme}
            testID="inline-stop-current-location"
          />
        )}

        {locationFailure && (
          <Message
            title="Location is unavailable"
            detail="Allow location access, or keep the first stop as your starting point."
            theme={theme}
          />
        )}
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
            detail={failureDetail(state.reason)}
            actionLabel="Try again"
            onAction={search.retry}
            theme={theme}
          />
        )}
        {state.kind === 'offline' && (
          <Message
            title="Search needs a connection"
            detail="My location and saved addresses are still available."
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
              paddingVertical: space.space2,
              color: palette.accent,
              fontSize: 13,
              fontWeight: '700',
            }}
          >
            Searching…
          </Text>
        )}

        <FlatList
          data={options}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => `${item.source}:${item.placeId}`}
          renderItem={({ item }) => (
            <ResultRow
              title={item.primaryText}
              detail={item.secondaryText}
              icon={item.source === 'search' ? '⌖' : '↺'}
              onPress={() => choose(item)}
              theme={theme}
              testID="inline-stop-option"
            />
          )}
          testID="inline-stop-results"
        />
      </View>
    </View>
  );
}

function ResultRow({
  title,
  detail,
  icon,
  onPress,
  disabled = false,
  theme,
  testID,
}: {
  title: string;
  detail: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ disabled }}
      style={{
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.space3,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        opacity: disabled ? 0.6 : 1,
      }}
      testID={testID}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: palette.accentSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: space.space3,
        }}
      >
        <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '700' }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: palette.textPrimary, fontSize: 15, fontWeight: '700' }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}
        >
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

function Message({
  title,
  detail,
  actionLabel,
  onAction,
  theme,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  theme: ThemeName;
}): React.JSX.Element {
  const palette = colours[theme];
  return (
    <View
      style={{
        paddingHorizontal: space.space4,
        paddingVertical: space.space3,
        borderTopWidth: 1,
        borderTopColor: palette.border,
      }}
    >
      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: space.space1 }}>
        {detail}
      </Text>
      {actionLabel !== undefined && onAction !== undefined && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={{ marginTop: space.space2 }}
        >
          <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '700' }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function failureDetail(reason: 'offline' | 'quota-exhausted' | 'no-entitlement' | 'unavailable') {
  switch (reason) {
    case 'quota-exhausted':
      return 'Your search allowance is finished for this period.';
    case 'no-entitlement':
      return 'This plan cannot start another place search.';
    case 'offline':
      return 'Reconnect and try again. Saved addresses remain available.';
    default:
      return 'Try again in a moment. Saved addresses remain available.';
  }
}
