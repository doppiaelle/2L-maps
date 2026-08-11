import { memo, useCallback } from 'react';
import { FlatList, Text, View } from 'react-native';

import { StopRow } from '@/components/primitives/StopRow';
import type { StopText } from '@/lib/route/stop-text';
import type { StopState } from '@/components/primitives/StopRow';
import { layout } from '@/lib/design/tokens';
import { LIST_VIRTUALISATION_THRESHOLD } from '@/types';

/**
 * The stop list.
 *
 * Virtualisation is mandatory above `LIST_VIRTUALISATION_THRESHOLD` rows, and
 * the budget is 60 fps with zero dropped frames at 25 stops
 * ([`docs/24_PERFORMANCE.md`](../../docs/24_PERFORMANCE.md)). Three things here
 * exist for that budget and nothing else:
 *
 * **The row is memoised** on the fields it actually renders. Without it every
 * scroll frame re-renders twenty-five rows, and the drop is invisible in review
 * because a simulator has frames to spare.
 *
 * **`getItemLayout` is supplied**, so the list never measures. Measuring is what
 * makes a virtualised list stutter on the first fling, and the row height is a
 * known function of the Dynamic Type size rather than of the content.
 *
 * **`keyExtractor` uses the stop id, never the index.** An index key makes a
 * reorder look like a content change to React, so every row below the moved one
 * re-renders — during the one animation the product is judged on.
 *
 * Every state is designed (`CLAUDE.md` §7 rule 5): loading is a skeleton that
 * matches the eventual layout, not a spinner.
 */

export interface StopListItem {
  readonly id: string;
  readonly position: number;
  /** The two lines to draw, decided by `stopTextOf` rather than by the row —
   *  which source wins, and whether Google's words have expired, are domain
   *  rules and not presentation (`CLAUDE.md` §1). */
  readonly text: StopText;
  readonly state: StopState;
  readonly hasCoordinate: boolean;
  readonly meta: string | null;
}

export type StopListState =
  | { readonly kind: 'loading'; readonly expectedCount: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly stops: readonly StopListItem[] };

export interface StopListProps {
  readonly state: StopListState;
  onSelectStop: (stopId: string) => void;
  /**
   * Editing, when the route may still be changed.
   *
   * All three absent means a read-only list, which is what a route in progress
   * is: reordering under a driver following the list is a hazard, not an edit.
   * The store already owned `removeStopById`, `undoRemove` and `moveStopTo` —
   * this is the surface that reaches them.
   */
  onRemoveStop?: ((stopId: string) => void) | undefined;
  onMoveStop?: ((fromIndex: number, toIndex: number) => void) | undefined;
  /** Rendered between the header and the rows — the ad slot goes here, so the
   *  list does not have to know what advertising is. */
  readonly header?: React.ReactElement | null;
  readonly rowHeight?: number;
  readonly testID?: string;
}

/** Two lines of address plus padding at the default Dynamic Type size. A caller
 *  at 200% passes its own measured value rather than letting the list guess. */
export const DEFAULT_ROW_HEIGHT = 72;

const Row = memo(
  function Row({
    item,
    index,
    total,
    onSelect,
    onRemove,
    onMove,
  }: {
    item: StopListItem;
    index: number;
    total: number;
    onSelect: (stopId: string) => void;
    onRemove: ((stopId: string) => void) | undefined;
    onMove: ((fromIndex: number, toIndex: number) => void) | undefined;
  }): React.JSX.Element {
    return (
      <StopRow
        position={item.position}
        text={item.text}
        state={item.state}
        hasCoordinate={item.hasCoordinate}
        meta={item.meta}
        onPress={() => {
          onSelect(item.id);
        }}
        {...(onRemove === undefined
          ? {}
          : {
              onRemove: () => {
                onRemove(item.id);
              },
            })}
        // Undefined at the ends rather than a no-op: the control renders
        // disabled, so the row keeps its width and the list does not shift as
        // the user scrolls past the first and last stops.
        {...(onMove === undefined || index === 0
          ? {}
          : {
              onMoveUp: () => {
                onMove(index, index - 1);
              },
            })}
        {...(onMove === undefined || index === total - 1
          ? {}
          : {
              onMoveDown: () => {
                onMove(index, index + 1);
              },
            })}
      />
    );
  },
  // Compared field by field rather than by reference, because the list rebuilds
  // its item objects on every store read. A reference check would defeat the
  // memo entirely and look like it was working.
  (a, b) =>
    a.item.id === b.item.id &&
    a.item.position === b.item.position &&
    // `text` is rebuilt on every read, so it is compared by value like the rest
    // — a reference check here would defeat the memo and look like it worked.
    a.item.text.title === b.item.text.title &&
    a.item.text.subtitle === b.item.text.subtitle &&
    a.item.text.needsRefreshing === b.item.text.needsRefreshing &&
    a.item.state === b.item.state &&
    a.item.hasCoordinate === b.item.hasCoordinate &&
    a.item.meta === b.item.meta &&
    a.index === b.index &&
    a.total === b.total &&
    a.onSelect === b.onSelect &&
    a.onRemove === b.onRemove &&
    a.onMove === b.onMove,
);

export function StopList({
  state,
  onSelectStop,
  onRemoveStop,
  onMoveStop,
  header = null,
  rowHeight = DEFAULT_ROW_HEIGHT,
  testID,
}: StopListProps): React.JSX.Element {
  const total = state.kind === 'ready' ? state.stops.length : 0;

  const renderItem = useCallback(
    ({ item, index }: { item: StopListItem; index: number }) => (
      <Row
        item={item}
        index={index}
        total={total}
        onSelect={onSelectStop}
        onRemove={onRemoveStop}
        onMove={onMoveStop}
      />
    ),
    [onSelectStop, onRemoveStop, onMoveStop, total],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<StopListItem> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  if (state.kind === 'loading') {
    return (
      <View testID={testID} accessibilityLabel="Loading stops" accessibilityRole="progressbar">
        {header}
        {/* A skeleton that matches the eventual layout, not a spinner: the list
            does not jump when the data lands, and the user can already see how
            much is coming. */}
        {Array.from({ length: state.expectedCount }, (_, i) => (
          <View
            key={`skeleton-${i}`}
            style={{ height: rowHeight }}
            className="mx-screen-padding my-space-1 rounded-md bg-surface-raised"
            testID="stop-skeleton"
          />
        ))}
      </View>
    );
  }

  if (state.kind === 'empty') {
    return (
      <View testID={testID} className="px-screen-padding py-space-6 items-center">
        {header}
        <Text className="text-title-md text-text-primary">No stops yet</Text>
        <Text className="text-body text-text-secondary mt-space-2 text-center">
          Add an address, paste a list, or photograph one.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      testID={testID}
      data={state.stops}
      renderItem={renderItem}
      // The stop id, never the index: an index key makes a reorder look like a
      // content change, so every row below the moved one re-renders during the
      // one animation this product is judged on.
      keyExtractor={(item) => item.id}
      getItemLayout={getItemLayout}
      ListHeaderComponent={header}
      // Only above the threshold. Below it the windowing machinery costs more
      // than it saves, and the whole list fits on screen anyway.
      removeClippedSubviews={state.stops.length > LIST_VIRTUALISATION_THRESHOLD}
      initialNumToRender={Math.min(state.stops.length, LIST_VIRTUALISATION_THRESHOLD)}
      windowSize={5}
      contentContainerStyle={{ paddingBottom: layout.touchMin * 2 }}
      accessibilityLabel={`${state.stops.length} stops`}
    />
  );
}
