import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StopList } from '@/components/lists/StopList';
import type { StopListItem } from '@/components/lists/StopList';
import { PrimaryAction } from '@/components/primitives/PrimaryAction';
import type { PrimaryActionState } from '@/components/primitives/PrimaryAction';
import { RouteSummaryHeader } from '@/components/route/RouteSummaryHeader';
import { StatusChip } from '@/components/primitives/StatusChip';
import type { AddressNotice } from '@/lib/places/notice';
import { layout, radius, RULE_WIDTH, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
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
  /** The menu control on the map. Leaves the result behind and returns to the
   *  list — with the stops intact, which is what "back to the list" has to
   *  mean. */
  onDismissMap?: () => void;
  /**
   * What the hop the driver just tapped measures, or nothing tapped.
   *
   * Two numbers, both of them Google's own answer for that segment and both
   * already bought by the existing field mask
   * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)). No share
   * of the total and no comparison — those would be arithmetic presented as
   * measurement.
   */
  readonly selectedLeg?: { readonly value: string; readonly spoken: string } | null;
  /**
   * Points to keep clear at the bottom, in map mode.
   *
   * The drawn route runs the whole height with the dock floating over it, so the
   * primary control has to be lifted above the dock by hand — otherwise Confirm
   * sits underneath the navigation and cannot be pressed. Zero in list mode,
   * where the panel already stops above the dock.
   */
  readonly bottomInset?: number;
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

  /**
   * Why the addresses are missing, when they are, and what to do about it.
   *
   * Decided by `addressNoticeOf`, so the four causes stay four sentences rather
   * than collapsing back into the single "Address needs refreshing" that every
   * row used to show for all of them, with no way to refresh anything.
   */
  readonly addressNotice?: AddressNotice | null;
  onRetryAddresses?: () => void;

  /** Read once by the screen and passed down, so the list ordinal and the map
   *  pin are drawn from the same palette by the same function. */
  readonly theme: ThemeName;
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
  addressNotice = null,
  onRetryAddresses,
  view = 'list',
  mapSlot,
  onDismissMap,
  selectedLeg = null,
  bottomInset = 0,
  theme,
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
          // The straight-line estimate is not shown while the real numbers are
          // being fetched: watching 34 km become 41 km is watching the product
          // correct itself, which is not what happened.
          isPending={view === 'preparing'}
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
        {view !== 'list' ? (
          // No horizontal padding: the drawing is the ground, not a card on it.
          // The waiting face occupies exactly this space too, so the result
          // arriving changes what is drawn and never where anything sits.
          <View style={{ flex: 1 }}>
            {mapSlot}

            {view === 'map' && onDismissMap !== undefined && (
              // Top right, which is the corner ADR-0018 spent a whole decision
              // moving controls *out* of — and it is right here, because this is
              // not navigation. It dismisses what is on the canvas, it sits on
              // the canvas, and the thumb-zone rule is served by Confirm being
              // where every primary action has always been.
              //
              // **Three lines rather than a cross.** A cross says "close this
              // and lose it"; what actually happens is that the stop list comes
              // back with every stop still on it, ready to be optimized again.
              // The same glyph marks Route in the dock, and that is the point —
              // both mean *the list*.
              <Pressable
                onPress={onDismissMap}
                accessibilityRole="button"
                accessibilityLabel="Back to the stop list"
                hitSlop={space.space2}
                style={{
                  position: 'absolute',
                  top: space.space3,
                  right: space.space3,
                  width: layout.touchMin,
                  height: layout.touchMin,
                  borderRadius: radius.radiusFull,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="plan-dismiss-map"
              >
                <MenuGlyph />
              </Pressable>
            )}

            {view === 'map' && selectedLeg !== null && (
              // Over the canvas rather than in the header: it describes a hop
              // the finger is still on, and the eye should not have to travel
              // to the top of the screen to read the answer to its own tap.
              <View
                style={{
                  position: 'absolute',
                  left: layout.screenPadding,
                  right: layout.screenPadding,
                  top: space.space3,
                  alignItems: 'center',
                }}
                pointerEvents="none"
                testID="plan-selected-leg"
              >
                <View
                  className="bg-surface border border-border"
                  style={{
                    paddingHorizontal: space.space4,
                    paddingVertical: space.space2,
                    borderRadius: radius.radiusFull,
                  }}
                >
                  <Text
                    className="text-metric-md text-text-primary"
                    style={{ fontVariant: ['tabular-nums'] }}
                    accessibilityLabel={selectedLeg.spoken}
                    accessibilityLiveRegion="polite"
                  >
                    {selectedLeg.value}
                  </Text>
                </View>
              </View>
            )}

            {view === 'preparing' && (
              // The one line of copy on the waiting face, over a canvas already
              // showing their own stops. Announced when it appears, because the
              // user pressed Optimize and then looked away
              // (`CLAUDE.md` §10 rule 7).
              <View
                style={{
                  position: 'absolute',
                  left: layout.screenPadding,
                  right: layout.screenPadding,
                  bottom: space.space5,
                  alignItems: 'center',
                }}
                testID="plan-preparing-note"
              >
                <Text
                  className="text-label-sm text-text-secondary"
                  accessibilityLiveRegion="polite"
                >
                  WORKING OUT THE FASTEST ORDER
                </Text>
              </View>
            )}
          </View>
        ) : (
          <StopList
            state={listStateFor(state, stops)}
            onSelectStop={onSelectStop}
            onRemoveStop={onRemoveStop}
            onMoveStop={onMoveStop}
            theme={theme}
            testID="plan-stop-list"
          />
        )}
      </View>

      <View
        style={{
          paddingHorizontal: layout.screenPadding,
          // Clear of the dock the canvas runs underneath, and clear of it by
          // more than a hairline: Confirm is pressed one-handed in a van, and a
          // pill that shares an edge with the navigation is a mis-tap into
          // Settings.
          paddingBottom: (view === 'map' ? space.space4 : space.space3) + bottomInset,
        }}
      >
        {actionState !== null && (
          <PrimaryAction
            state={actionState}
            onPress={onPrimaryAction}
            // Over the canvas it floats rather than closing a column, so it
            // takes the width of its own label and is lifted off the drawing.
            shape={view === 'map' ? 'pill' : 'block'}
            testID="plan-action"
          />
        )}

        {/* Always reachable, in every state that has a list — adding a stop is
                the first of the three taps. **Import sits beside it**, because
                the two are the same choice: one address or a whole day's worth.
                It used to be reachable only from inside add-stop, which meant a
                user with a pasted list had to open a search, fail to find what
                they wanted, and notice a secondary link.

                They are hidden on the map, where the only question is whether
                to set off. */}
        {view !== 'map' && (
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
 * Three parallel lines, drawn rather than typed.
 *
 * A `≡` character would inherit the font's own weight and spacing, which differ
 * between the two type voices and again between platforms — and at 200% Dynamic
 * Type it grows into the corner it sits in. Three views of a fixed height are
 * the same mark everywhere, and the 44 pt target around them is what the finger
 * actually hits (`CLAUDE.md` §10 rule 2).
 */
function MenuGlyph(): React.JSX.Element {
  return (
    <View
      style={{ width: space.space5, gap: space.space1 }}
      accessibilityElementsHidden
      importantForAccessibility="no"
      testID="plan-menu-glyph"
    >
      {[0, 1, 2].map((line) => (
        <View key={line} className="rounded-full bg-text-primary" style={{ height: RULE_WIDTH }} />
      ))}
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
