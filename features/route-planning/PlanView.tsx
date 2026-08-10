import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StopList } from '@/components/lists/StopList';
import type { StopListItem } from '@/components/lists/StopList';
import { PrimaryAction } from '@/components/primitives/PrimaryAction';
import type { PrimaryActionState } from '@/components/primitives/PrimaryAction';
import { RouteSummaryHeader } from '@/components/route/RouteSummaryHeader';
import { StatusChip } from '@/components/primitives/StatusChip';
import type { AddressNotice } from '@/lib/places/notice';
import { layout, radius, space } from '@/lib/design/tokens';
import { metricsAreEstimated } from '@/lib/route/plan-state';
import type { ActionIntent, PlanState } from '@/lib/route/plan-state';
import type { RouteView } from '@/lib/route/route-view';

/**
 * Plan, composed.
 *
 * The Route section of the dock: the stop list, its metrics, and one control
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 *
 * **The map is no longer here.** It belongs to the screen, behind every section,
 * and this renders over it ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)).
 * That is why nothing in this file knows about markers, a camera or a map id: a
 * section that had to be handed the map's props in order to render a list was
 * carrying them for a component it no longer contains.
 *
 * **It decides nothing.** Which state this is, what the control says, whether
 * the metrics are an estimate — all of it arrives as `PlanState` and
 * `ActionIntent` from `lib/route/plan-state.ts`. What is left here is the one
 * thing that cannot live in `lib/`: translating a semantic intent into the
 * component's props, which is the job of the only layer allowed to see both.
 *
 * **No navigation transition on the critical path.** Add-stop and import are
 * modals over the section rather than pushed screens, so adding a stop never
 * leaves the route being built (`CLAUDE.md` §7 rule 1).
 */

export interface PlanMetric {
  readonly value: string;
  readonly spoken: string;
}

export interface PlanViewProps {
  readonly state: PlanState;
  readonly intent: ActionIntent;
  /**
   * Which of the section's two faces is showing
   * ([ADR-0022](../../docs/adr/0022-one-route-section.md)).
   *
   * Decided by `routeViewAfter`, never here. The map is not a place the user
   * navigates to — it is what an optimization produces, and it takes the list's
   * space for as long as the result it was drawn from is the current one.
   */
  readonly view?: RouteView;
  /** The drawn route. Passed in rather than rendered here, so this component
   *  stays presentational and knows nothing about projections or SVG. */
  readonly mapSlot?: React.ReactNode;
  /** The X. Leaves the result behind and returns to the list — with the stops
   *  intact, which is what "back to the list" has to mean. */
  onDismissMap?: () => void;
  readonly stops: readonly StopListItem[];
  readonly distance: PlanMetric | null;
  readonly duration: PlanMetric | null;

  onSelectStop: (stopId: string) => void;
  /**
   * Editing the itinerary.
   *
   * Passed straight to the list, and omitted while a route is in progress —
   * `isRouteInProgress` already governs the other controls that must not be
   * reachable from a moving vehicle.
   */
  onRemoveStop: (stopId: string) => void;
  onMoveStop: (fromIndex: number, toIndex: number) => void;
  onClearRoute: () => void;

  onPrimaryAction: () => void;
  onAddStop: () => void;
  /** Import a pasted list. A modal over Plan and a sibling of add-stop
   *  ([`docs/05_INFORMATION_ARCHITECTURE.md`](../../docs/05_INFORMATION_ARCHITECTURE.md) §5) —
   *  it was previously reachable only from *inside* add-stop, which put a
   *  first-class way of building a route behind a search that had to fail. */
  onImport: () => void;
  /**
   * The advertising slot, or nothing.
   *
   * Passed in rather than rendered here so this component stays presentational
   * and so **no space is reserved when there is no ad provider**. An empty
   * fifty-point gap above the stop list is worse than no gap: it is a hole the
   * user cannot explain, on the screen they spend the whole day in.
   */
  readonly adSlot?: React.ReactNode;
  /** Mid-route only, beside **Done**. */
  onSkipStop?: () => void;

  /**
   * Why the addresses are missing, when they are, and what to do about it.
   *
   * Decided by `addressNoticeOf`, so the four causes stay four sentences rather
   * than collapsing back into the single "Address needs refreshing" that every
   * row used to show for all of them, with no way to refresh anything.
   */
  readonly addressNotice?: AddressNotice | null;
  onRetryAddresses?: () => void;

  readonly testID?: string;
}

export function PlanView({
  state,
  intent,
  stops,
  distance,
  duration,
  onSelectStop,
  onRemoveStop,
  onMoveStop,
  onClearRoute,
  onPrimaryAction,
  onAddStop,
  onImport,
  adSlot,
  onSkipStop,
  addressNotice = null,
  onRetryAddresses,
  view = 'list',
  mapSlot,
  onDismissMap,
  testID,
}: PlanViewProps): React.JSX.Element {
  const actionState = useMemo(() => toActionState(intent, state), [intent, state]);

  return (
    <View style={{ flex: 1 }} testID={testID}>
      {/* The header, the list and the action, in that order and nothing between
          them. This used to be three slots of a draggable sheet over a map; the
          map now lives on the screen behind every section, and the sheet is
          gone (ADR-0018). */}
      <View style={{ paddingHorizontal: layout.screenPadding }}>
        {/* Above the summary rather than between the list rows: the top of the
            section is the one part of it that does not move under a thumb
            (ADR-0015). `<AdSlot>` hides itself during a route. */}
        {adSlot}
        <RouteSummaryHeader
          title={titleFor(state)}
          distance={distance}
          duration={duration}
          {...chipFor(state)}
          {...noteFor(state)}
        />
      </View>

      {addressNotice !== null && (
        <View
          style={{ paddingHorizontal: layout.screenPadding, paddingBottom: space.space2 }}
          testID="plan-address-notice"
        >
          <StatusChip
            kind={addressNotice.kind === 'offline' ? 'offline' : 'quota'}
            label={addressNotice.title}
          />
          <Text className="text-caption text-text-secondary mt-space-1">
            {addressNotice.detail}
          </Text>
          {addressNotice.canRetry && onRetryAddresses !== undefined && (
            <Pressable
              onPress={onRetryAddresses}
              accessibilityRole="button"
              accessibilityLabel="Look up the missing addresses again"
              style={{
                minHeight: layout.touchMin,
                justifyContent: 'center',
              }}
              testID="plan-retry-addresses"
            >
              <Text className="text-body-strong text-accent">Try again</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* One space, two things in it. The list takes what the header and action
          do not; the map takes exactly the same space when there is a result to
          show, so nothing around it moves as the section changes face. */}
      <View style={{ flex: 1 }}>
        {view === 'map' ? (
          <View style={{ flex: 1, paddingHorizontal: layout.screenPadding }}>
            {mapSlot}

            {onDismissMap !== undefined && (
              // Top right, which is the corner ADR-0018 spent a whole decision
              // moving controls *out* of — and it is right here, because this is
              // not navigation. It dismisses what is on the canvas, it sits on
              // the canvas, and the thumb-zone rule is served by Confirm being
              // where every primary action has always been.
              <Pressable
                onPress={onDismissMap}
                accessibilityRole="button"
                accessibilityLabel="Discard this route and go back to the list"
                style={{
                  position: 'absolute',
                  top: space.space3,
                  right: layout.screenPadding + space.space3,
                  width: layout.touchMin,
                  height: layout.touchMin,
                  borderRadius: radius.radiusFull,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="plan-dismiss-map"
              >
                <Text className="text-title-md text-text-primary">✕</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <StopList
            state={listStateFor(state, stops)}
            onSelectStop={onSelectStop}
            // Read-only while driving: reordering under someone following the
            // list is a hazard rather than an edit.
            {...(state.kind === 'in-progress' ? {} : { onRemoveStop, onMoveStop })}
            testID="plan-stop-list"
          />
        )}
      </View>

      <View style={{ paddingHorizontal: layout.screenPadding, paddingBottom: space.space3 }}>
        {actionState !== null && (
          <PrimaryAction state={actionState} onPress={onPrimaryAction} testID="plan-action" />
        )}

        {/* Mid-route the two controls sit side by side. Skip is quieter but
                the same height: the user is driving, and a smaller target is a
                mis-tap on somebody's delivery. */}
        {state.kind === 'in-progress' && onSkipStop !== undefined && (
          <Pressable
            onPress={onSkipStop}
            accessibilityRole="button"
            accessibilityLabel="Skip this stop and move to the next"
            style={{
              minHeight: layout.actionMinHeight,
              marginTop: space.space2,
              borderRadius: radius.radiusLg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            testID="plan-skip"
          >
            <Text className="text-body-strong text-text-secondary">Skip</Text>
          </Pressable>
        )}

        {/* Always reachable, at every detent and in every state that has a
                list — adding a stop is the first of the three taps.
                **Import sits beside it**, because the two are the same choice:
                one address or a whole day's worth. It used to be reachable only
                from inside add-stop, which meant a user with a pasted list had
                to open a search, fail to find what they wanted, and notice a
                secondary link. */}
        {state.kind !== 'in-progress' && (
          <View
            style={{
              flexDirection: 'row',
              marginTop: space.space2,
              justifyContent: 'center',
              gap: space.space5,
            }}
          >
            <Pressable
              onPress={onAddStop}
              accessibilityRole="button"
              accessibilityLabel="Add a stop"
              style={{
                minHeight: layout.touchMin,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              testID="plan-add-stop"
            >
              <Text className="text-body text-accent">Add a stop</Text>
            </Pressable>

            {stops.length > 0 && (
              <Pressable
                onPress={onClearRoute}
                accessibilityRole="button"
                // Says what it does, not what it is. "Reset" describes the
                // mechanism; this describes the outcome the user wants.
                accessibilityLabel="Start a new route, clearing every stop"
                style={{
                  minHeight: layout.touchMin,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="plan-clear-route"
              >
                <Text className="text-body text-text-secondary">Start over</Text>
              </Pressable>
            )}

            <Pressable
              onPress={onImport}
              accessibilityRole="button"
              accessibilityLabel="Paste a list of addresses"
              style={{
                minHeight: layout.touchMin,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              testID="plan-import"
            >
              <Text className="text-body text-accent">Paste a list</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The semantic intent, rendered.
 *
 * Null means no control at all rather than a disabled one: with nothing to
 * optimize, a greyed button invites a tap that can only fail (docs/08 §7).
 */
function toActionState(intent: ActionIntent, state: PlanState): PrimaryActionState | null {
  switch (intent.kind) {
    case 'hidden':
      return null;
    case 'optimize':
      return { kind: 'ready', label: 'Optimize' };
    case 'optimizing':
      return { kind: 'working', label: 'Optimizing' };
    case 'start':
      // "Confirm" rather than "Start": it sits under a drawn route the user is
      // being asked to accept, and what it does is hand the day to a navigation
      // app. "Start" described a thing this product has never done — it does not
      // navigate (ADR-0004).
      return { kind: 'ready', label: 'Confirm' };
    case 'advance':
      return { kind: 'ready', label: 'Done' };
    case 'retry':
      return { kind: 'ready', label: 'Try again' };
    case 'blocked':
      return { kind: 'blocked', label: labelFor(state), reason: intent.reason };
    case 'degraded-only':
      return { kind: 'degraded', label: 'Optimize', note: intent.note };
    case 'unlockable':
      return { kind: 'unlockable', label: 'Optimize', note: intent.note };
  }
}

/** What a blocked control still says. Keeping the verb means the user learns
 *  what the button is *for* even while they cannot use it. */
function labelFor(state: PlanState): string {
  return state.kind === 'optimized' ? 'Confirm' : 'Optimize';
}

function titleFor(state: PlanState): string {
  switch (state.kind) {
    case 'loading':
      return 'LOADING ROUTE';
    case 'empty':
      return 'NO STOPS YET';
    case 'in-progress':
      return `STOP ${state.completedCount + 1} OF ${state.stopCount}`;
    case 'draft':
    case 'optimizing':
    case 'optimized':
    case 'failed':
      return `ROUTE · ${state.stopCount} ${state.stopCount === 1 ? 'STOP' : 'STOPS'}`;
  }
}

function chipFor(state: PlanState): { chip?: 'degraded' | 'offline'; chipLabel?: string } {
  // The degraded label is the product's most important four words: it is the
  // difference between a number a driver can plan on and one they cannot.
  if (state.kind === 'optimized' && state.isDegraded) return { chip: 'degraded' };
  if (metricsAreEstimated(state) && state.kind === 'draft') {
    return { chip: 'degraded', chipLabel: 'Straight-line estimate' };
  }
  return {};
}

function noteFor(state: PlanState): { note?: string } {
  if (state.kind === 'optimized' && state.wasAlreadyOptimal) {
    // Positively, not as silence and not as an error. Reordering nothing is a
    // correct answer and the user paid for it.
    return { note: 'Already the fastest order' };
  }
  if (state.kind === 'failed') {
    // The order is untouched, and saying so is the point: a failed optimization
    // that also scrambled the list is two problems.
    return { note: 'Could not optimize. Your stops are unchanged.' };
  }
  return {};
}

function listStateFor(state: PlanState, stops: readonly StopListItem[]) {
  if (state.kind === 'loading') {
    // A skeleton that matches the eventual layout, so the list does not jump
    // when the data lands. Three rows is what a typical saved route opens to.
    return { kind: 'loading', expectedCount: 3 } as const;
  }
  if (stops.length === 0) return { kind: 'empty' } as const;
  return { kind: 'ready', stops } as const;
}
