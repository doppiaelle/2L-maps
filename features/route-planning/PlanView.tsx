import { useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StopList } from '@/components/lists/StopList';
import type { StopListItem } from '@/components/lists/StopList';
import { AppMap } from '@/components/map/AppMap';
import { PrimaryAction } from '@/components/primitives/PrimaryAction';
import type { PrimaryActionState } from '@/components/primitives/PrimaryAction';
import { MapControls } from '@/components/map/MapControls';
import { RouteSummaryHeader } from '@/components/route/RouteSummaryHeader';
import { RouteSheet } from '@/components/sheet/RouteSheet';
import { layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { MarkerInput } from '@/lib/map/clustering';
import type { MapIdConfig } from '@/lib/map/style';
import type { AppMapHandle, RouteGeometry } from '@/lib/providers/types';
import { metricsAreEstimated } from '@/lib/route/plan-state';
import type { ActionIntent, PlanState } from '@/lib/route/plan-state';
import { detentFraction } from '@/lib/ui/sheet';
import type { SheetDetent } from '@/lib/ui/sheet';

/**
 * Plan, composed.
 *
 * The screen the whole product is built around: a quiet map with the stop list
 * as a sheet over it, and one control ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 *
 * **It decides nothing.** Which state this is, what the control says, whether
 * the metrics are an estimate — all of it arrives as `PlanState` and
 * `ActionIntent` from `lib/route/plan-state.ts`. What is left here is the one
 * thing that cannot live in `lib/`: translating a semantic intent into the
 * component's props, which is the job of the only layer allowed to see both.
 *
 * **No navigation transition on the critical path.** Everything else in the
 * product is a modal over this screen, which is what makes three taps to an
 * optimized route reachable at all (`CLAUDE.md` §7 rule 1).
 */

export interface PlanMetric {
  readonly value: string;
  readonly spoken: string;
}

export interface PlanViewProps {
  readonly state: PlanState;
  readonly intent: ActionIntent;
  readonly stops: readonly StopListItem[];
  readonly markers: readonly MarkerInput[];
  readonly route: RouteGeometry | null;
  readonly distance: PlanMetric | null;
  readonly duration: PlanMetric | null;

  readonly detent: SheetDetent;
  onDetentChange: (detent: SheetDetent) => void;
  readonly selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onClearSelection: () => void;

  onPrimaryAction: () => void;
  onAddStop: () => void;
  /** Import a pasted list. A modal over Plan and a sibling of add-stop
   *  ([`docs/05_INFORMATION_ARCHITECTURE.md`](../../docs/05_INFORMATION_ARCHITECTURE.md) §5) —
   *  it was previously reachable only from *inside* add-stop, which put a
   *  first-class way of building a route behind a search that had to fail. */
  onImport: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
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

  readonly theme: ThemeName;
  readonly mapIds: MapIdConfig;
  readonly mapStatus: 'ready' | 'offline' | 'failed';
  readonly screenHeight: number;
  readonly prefersReducedMotion?: boolean;
  readonly testID?: string;
}

export function PlanView({
  state,
  intent,
  stops,
  markers,
  route,
  distance,
  duration,
  detent,
  onDetentChange,
  selectedStopId,
  onSelectStop,
  onClearSelection,
  onPrimaryAction,
  onAddStop,
  onImport,
  onOpenHistory,
  onOpenSettings,
  adSlot,
  onSkipStop,
  theme,
  mapIds,
  mapStatus,
  screenHeight,
  prefersReducedMotion = false,
  testID,
}: PlanViewProps): React.JSX.Element {
  const mapRef = useRef<AppMapHandle>(null);

  // The map fits the route above the sheet, not behind it, and the fraction
  // comes from the same arithmetic the sheet is drawn with — so the padding
  // cannot drift from the thing it is padding for.
  const sheetFraction = detentFraction(detent, screenHeight);

  const actionState = useMemo(() => toActionState(intent, state), [intent, state]);

  return (
    <View style={{ flex: 1 }} testID={testID}>
      <AppMap
        ref={mapRef}
        stops={markers}
        route={route}
        selectedStopId={selectedStopId}
        theme={theme}
        mapIds={mapIds}
        status={mapStatus}
        onStopPress={onSelectStop}
        onMapPress={onClearSelection}
        sheetFraction={sheetFraction}
        prefersReducedMotion={prefersReducedMotion}
      />

      <MapControls
        onOpenHistory={onOpenHistory}
        onOpenSettings={onOpenSettings}
        // Hidden mid-route: the user is driving, and neither destination is
        // something they should be one tap from (docs/05 §194).
        isRouteInProgress={state.kind === 'in-progress'}
        theme={theme}
        testID="plan-map-controls"
      />

      <RouteSheet
        detent={detent}
        onDetentChange={onDetentChange}
        screenHeight={screenHeight}
        theme={theme}
        prefersReducedMotion={prefersReducedMotion}
        testID="plan-sheet"
        header={
          <>
            {/* Above the summary rather than between the list rows: the sheet
                header is the one part of this screen that does not move under a
                thumb (ADR-0015). `<AdSlot>` hides itself during a route. */}
            {adSlot}
            <RouteSummaryHeader
              title={titleFor(state)}
              distance={distance}
              duration={duration}
              {...chipFor(state)}
              {...noteFor(state)}
            />
          </>
        }
        action={
          <View>
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
        }
      >
        <StopList
          state={listStateFor(state, stops)}
          onSelectStop={onSelectStop}
          testID="plan-stop-list"
        />
      </RouteSheet>
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
      return { kind: 'ready', label: 'Start' };
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
  return state.kind === 'optimized' ? 'Start' : 'Optimize';
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
