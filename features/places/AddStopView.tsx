import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Skeleton } from '@/components/primitives/Skeleton';
import { StatusChip } from '@/components/primitives/StatusChip';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { SearchFailure, SearchState, SourcedOption } from '@/lib/places/search';
import { AUTOCOMPLETE_MIN_CHARACTERS } from '@/types';

/**
 * Add a stop.
 *
 * The first of the three taps, and the screen where the product's largest cost
 * line is either controlled or not
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §8).
 *
 * **Recents and favourites sit above search results, always.** A reused
 * `place_id` is free and a search is not, so the cheapest interaction is also
 * the one nearest the thumb (`CLAUDE.md` §6 rule 2). The ordering is decided in
 * `lib/places/search.ts`; this renders it.
 *
 * **The field is focused on open.** The user came here to type, and a modal that
 * needs a tap to start has spent one of the three taps on itself.
 *
 * Every state is designed rather than left to fall out of the data
 * (`CLAUDE.md` §7 rule 5): browsing, searching, results, no match, offline, and
 * a route that is already full.
 */

export interface AddStopViewProps {
  readonly state: SearchState;
  readonly query: string;
  onQueryChange: (query: string) => void;
  onSelect: (option: SourcedOption) => void;
  /** Adds the typed text as a manual label when nothing matched. Not a
   *  fallback — a driver who knows where they are going should not be blocked
   *  because Google has not heard of the address. */
  onAddManually: (text: string) => void;
  /** Re-runs the current query after a failure. Every failed state offers this
   *  except the ones retrying cannot fix. */
  onRetry: () => void;
  onDismiss: () => void;
  readonly theme: ThemeName;
  readonly prefersReducedMotion?: boolean;
  readonly testID?: string;
}

const SOURCE_LABEL: Readonly<Record<SourcedOption['source'], string | null>> = {
  recent: 'Recent',
  favourite: 'Saved',
  // A search result needs no badge: it is the default, and labelling it would
  // put a word next to every row for no information.
  search: null,
};

export function AddStopView({
  state,
  query,
  onQueryChange,
  onSelect,
  onAddManually,
  onRetry,
  onDismiss,
  theme,
  prefersReducedMotion = false,
  testID,
}: AddStopViewProps): React.JSX.Element {
  const palette = colours[theme];

  if (state.kind === 'at-capacity') {
    return (
      <View
        style={{ flex: 1, backgroundColor: palette.bg, padding: layout.screenPadding }}
        testID={testID}
      >
        <Text
          accessibilityRole="header"
          className="text-title-md text-text-primary"
          testID="add-stop-title"
        >
          This route is full
        </Text>
        <Text className="text-body text-text-secondary mt-space-2">
          {`Your plan covers up to ${state.limit} stops. Remove one to add another.`}
        </Text>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Go back to the route"
          style={{
            minHeight: layout.actionMinHeight,
            marginTop: space.space5,
            borderRadius: radius.radiusLg,
            backgroundColor: palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          testID="add-stop-back"
        >
          <Text className="text-body-strong text-accent-on">Back to my route</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg, paddingTop: space.space4 }}
      testID={testID}
    >
      <View style={{ paddingHorizontal: layout.screenPadding }}>
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          // The user came here to type. A modal that needs a tap to start has
          // spent one of the three taps on itself.
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          placeholder="Search an address"
          placeholderTextColor={palette.textSecondary}
          accessibilityLabel="Search for an address"
          accessibilityHint={`Results appear after ${AUTOCOMPLETE_MIN_CHARACTERS} characters`}
          style={{
            minHeight: layout.touchMin,
            paddingHorizontal: space.space3,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.surfaceRaised,
            color: palette.textPrimary,
            fontSize: 16,
          }}
          testID="add-stop-input"
        />

        {state.kind === 'offline' && (
          <View style={{ marginTop: space.space2 }}>
            {/* Search needs the network; reuse does not, so the reason is stated
                rather than the field being silently useless. */}
            <StatusChip kind="offline" label="Search needs a connection" />
          </View>
        )}
      </View>

      {state.kind === 'failed' && (
        <SearchFailed reason={state.reason} onRetry={onRetry} theme={theme} />
      )}

      {state.kind === 'no-match' ? (
        <NoMatch query={state.query} onAddManually={onAddManually} theme={theme} />
      ) : (
        <FlatList
          data={state.options}
          keyExtractor={(item) => `${item.source}:${item.placeId}`}
          style={{ marginTop: space.space3 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <OptionRow option={item} onSelect={onSelect} theme={theme} />}
          ListFooterComponent={
            state.kind === 'searching' ? (
              <View style={{ paddingHorizontal: layout.screenPadding }} testID="search-skeletons">
                {/* Beneath the existing list, which stays visible: a list that
                    empties while it loads loses the user's place. */}
                {[0, 1, 2].map((row) => (
                  <View key={row} style={{ marginBottom: space.space2 }}>
                    <Skeleton height={56} prefersReducedMotion={prefersReducedMotion} />
                  </View>
                ))}
              </View>
            ) : null
          }
          accessibilityLabel={`${state.options.length} suggestions`}
          testID="add-stop-list"
        />
      )}
    </View>
  );
}

function OptionRow({
  option,
  onSelect,
  theme,
}: {
  option: SourcedOption;
  onSelect: (option: SourcedOption) => void;
  theme: ThemeName;
}): React.JSX.Element {
  const palette = colours[theme];
  const badge = SOURCE_LABEL[option.source];

  return (
    <Pressable
      onPress={() => {
        onSelect(option);
      }}
      accessibilityRole="button"
      // One utterance: what it is, where it is, and whether it is a reuse.
      accessibilityLabel={
        badge === null
          ? `${option.primaryText}, ${option.secondaryText}`
          : `${option.primaryText}, ${option.secondaryText}, ${badge.toLowerCase()}`
      }
      accessibilityHint="Adds this stop to your route"
      style={{
        minHeight: layout.touchMin,
        paddingHorizontal: layout.screenPadding,
        paddingVertical: space.space2,
        justifyContent: 'center',
      }}
      testID="add-stop-option"
    >
      <View className="flex-row items-center gap-space-2">
        <Text className="text-body-strong text-text-primary flex-1" numberOfLines={1}>
          {option.primaryText}
        </Text>
        {badge !== null && (
          <Text
            className="text-label-xs text-text-secondary uppercase"
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ color: palette.textSecondary }}
            testID="option-badge"
          >
            {badge}
          </Text>
        )}
      </View>
      <Text className="text-caption text-text-secondary" numberOfLines={1}>
        {option.secondaryText}
      </Text>
    </Pressable>
  );
}

/**
 * The search was attempted and failed.
 *
 * **Never "no results".** Until this existed every failure — a dead network, an
 * exhausted allowance, an Edge Function that was never deployed — arrived here
 * as an empty list and was rendered as "No match for what you typed". The user's
 * only available response was to retype a correct address and watch it fail
 * again, which is the precise shape of a product that looks broken while every
 * test passes.
 *
 * Each reason states what happened and what to do next (`CLAUDE.md` §0 rule 5).
 * Retry appears only where retrying can work: offering it against an exhausted
 * monthly allowance would invite the user to keep pressing a button that cannot
 * help them.
 */
function SearchFailed({
  reason,
  onRetry,
  theme,
}: {
  reason: SearchFailure;
  onRetry: () => void;
  theme: ThemeName;
}): React.JSX.Element {
  const palette = colours[theme];
  const copy = FAILURE_COPY[reason];

  return (
    <View style={{ paddingHorizontal: layout.screenPadding, marginTop: space.space3 }}>
      <StatusChip kind={copy.chip} label={copy.title} />
      <Text className="text-caption text-text-secondary mt-space-2">{copy.detail}</Text>

      {copy.canRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Search again"
          style={{
            minHeight: layout.touchMin,
            marginTop: space.space3,
            borderRadius: radius.radiusMd,
            borderWidth: 1,
            borderColor: palette.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          testID="add-stop-retry"
        >
          <Text className="text-body-strong text-accent">Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

interface FailureCopy {
  readonly chip: 'offline' | 'quota';
  readonly title: string;
  readonly detail: string;
  readonly canRetry: boolean;
}

/**
 * What each failure says, and whether trying again is honest.
 *
 * The wording names our fault as ours. "Search is not responding" is true and
 * actionable; "no match" was neither.
 */
const FAILURE_COPY: Readonly<Record<SearchFailure, FailureCopy>> = {
  offline: {
    chip: 'offline',
    title: 'Search needs a connection',
    detail: 'Your saved and recent addresses are still below, and still free to reuse.',
    canRetry: true,
  },
  'quota-exhausted': {
    chip: 'quota',
    title: 'Search limit reached',
    detail:
      'Your allowance resets next month. Saved and recent addresses still work, and cost nothing.',
    // Retrying spends nothing and changes nothing. A button that cannot help is
    // worse than no button.
    canRetry: false,
  },
  'no-entitlement': {
    chip: 'quota',
    title: 'Search is unavailable on your plan',
    detail: 'Saved and recent addresses still work.',
    canRetry: false,
  },
  unavailable: {
    chip: 'quota',
    title: 'Search is not responding',
    // Deliberately ours. The address is not the problem and telling the user to
    // check their spelling would send them to fix something that is not broken.
    detail: 'Something on our side is not answering. Your saved addresses still work.',
    canRetry: true,
  },
};

function NoMatch({
  query,
  onAddManually,
  theme,
}: {
  query: string;
  onAddManually: (text: string) => void;
  theme: ThemeName;
}): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View style={{ padding: layout.screenPadding }} testID="add-stop-no-match">
      <Text className="text-body text-text-primary">No match for “{query}”</Text>
      <Text className="text-caption text-text-secondary mt-space-1">
        A driver who knows where they are going should not be stopped by an address Google has not
        heard of.
      </Text>
      <Pressable
        onPress={() => {
          onAddManually(query);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add “${query}” as a labelled stop`}
        style={{
          minHeight: layout.touchMin,
          marginTop: space.space3,
          borderRadius: radius.radiusMd,
          borderWidth: 1,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="add-stop-manual"
      >
        <Text className="text-body-strong text-accent">Add it anyway</Text>
      </Pressable>
    </View>
  );
}
