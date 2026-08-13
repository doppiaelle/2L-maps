import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StopList } from '@/components/lists/StopList';
import type { StopListItem } from '@/components/lists/StopList';
import { AppHeader } from '@/components/navigation/AppHeader';
import { PrimaryAction } from '@/components/primitives/PrimaryAction';
import type { PrimaryActionState } from '@/components/primitives/PrimaryAction';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { ActionIntent, PlanState } from '@/lib/route/plan-state';
import type { RouteView } from '@/lib/route/route-view';

/** The Route reference surface: route list or the optimized map, with no
 * secondary flows embedded in it. */
export interface PlanViewProps {
  readonly state: PlanState;
  readonly intent: ActionIntent;
  readonly stops: readonly StopListItem[];
  readonly view?: RouteView;
  readonly mapSlot?: React.ReactNode;
  onDismissMap?: () => void;
  readonly selectedLeg?: {
    readonly value: string;
    readonly spoken: string;
    readonly stopLabel?: string;
    readonly stopNumber?: number;
  } | null;
  readonly bottomInset?: number;
  readonly controlsSlot?: React.ReactNode;
  readonly noticeSlot?: React.ReactNode;
  onOpenSearch: () => void;
  onSearchLayout?: (y: number) => void;
  onSelectStop: (stopId: string) => void;
  onRemoveStop: (stopId: string) => void;
  onPrimaryAction: () => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function PlanView({
  state,
  intent,
  stops,
  view = 'list',
  mapSlot,
  onDismissMap,
  selectedLeg = null,
  bottomInset = 0,
  controlsSlot,
  noticeSlot,
  onOpenSearch,
  onSearchLayout,
  onSelectStop,
  onRemoveStop,
  onPrimaryAction,
  theme,
  testID,
}: PlanViewProps): React.JSX.Element {
  const actionState = useMemo(() => actionFor(intent), [intent]);
  const palette = colours[theme];
  const isMap = view === 'map';

  return (
    <View style={{ flex: 1 }} testID={testID}>
      {view === 'list' && (
        <View style={{ paddingHorizontal: layout.screenPadding }}>
          <AppHeader showBrand theme={theme} testID="route-app-header" />
          <Text style={titleStyle(palette.textPrimary)}>Your route</Text>
          <Text style={subtitleStyle(palette.textSecondary)}>
            Add the places you need to visit.
          </Text>
          <Pressable
            onPress={onOpenSearch}
            onLayout={(event) => onSearchLayout?.(event.nativeEvent.layout.y)}
            accessibilityRole="search"
            accessibilityLabel="Search an address or place"
            accessibilityHint="Opens address suggestions over this route"
            style={{
              minHeight: 60,
              marginTop: space.space5,
              paddingLeft: space.space4,
              paddingRight: space.space2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: radius.radiusLg,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
            }}
            testID="route-search-field"
          >
            <Text style={{ color: palette.textTertiary, fontSize: 17 }} numberOfLines={1}>
              Search an address or place…
            </Text>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.radiusMd,
                backgroundColor: palette.textPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: palette.bg, fontSize: 22, fontWeight: '700' }}>⌕</Text>
            </View>
          </Pressable>
          {controlsSlot}
          {noticeSlot}
        </View>
      )}

      <View style={{ flex: 1 }}>
        {view === 'list' ? (
          <StopList
            state={stops.length === 0 ? { kind: 'empty' } : { kind: 'ready', stops }}
            onSelectStop={onSelectStop}
            onRemoveStop={onRemoveStop}
            theme={theme}
            testID="plan-stop-list"
          />
        ) : (
          <View style={{ flex: 1 }}>
            {mapSlot}
            {isMap && onDismissMap !== undefined && (
              <Pressable
                onPress={onDismissMap}
                accessibilityRole="button"
                accessibilityLabel="Back to the stop list"
                style={{
                  position: 'absolute',
                  top: space.space3,
                  left: space.space3,
                  width: 52,
                  height: 52,
                  borderRadius: radius.radiusMd,
                  backgroundColor: palette.textPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="plan-dismiss-map"
              >
                <Text style={{ color: palette.bg, fontSize: 32, fontWeight: '700' }}>‹</Text>
              </Pressable>
            )}
            {isMap && selectedLeg !== null && (
              <View
                style={{
                  position: 'absolute',
                  left: layout.screenPadding,
                  right: layout.screenPadding,
                  bottom: bottomInset + space.space6,
                  padding: space.space4,
                  borderRadius: radius.radiusLg,
                  backgroundColor: palette.textPrimary,
                }}
                testID="map-itinerary-card"
              >
                <Text style={{ color: palette.bg, opacity: 0.68, fontSize: 13, fontWeight: '700' }}>
                  OPTIMIZED ROUTE
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    color: palette.bg,
                    fontSize: 22,
                    lineHeight: 28,
                    fontWeight: '700',
                    marginTop: space.space2,
                  }}
                >
                  {selectedLeg.stopNumber === undefined || selectedLeg.stopLabel === undefined
                    ? 'Selected route segment'
                    : `Stop ${selectedLeg.stopNumber} · ${selectedLeg.stopLabel}`}
                </Text>
                <Text
                  style={{
                    color: palette.bg,
                    opacity: 0.72,
                    fontSize: 15,
                    lineHeight: 21,
                    marginTop: space.space2,
                  }}
                >
                  Route follows the real road network between stops.
                </Text>
                <Text
                  style={{
                    color: palette.accent,
                    fontSize: 18,
                    fontWeight: '700',
                    marginTop: space.space4,
                  }}
                  accessibilityLabel={selectedLeg.spoken}
                  testID="plan-selected-leg"
                >
                  {selectedLeg.value}
                </Text>
                <View
                  style={{
                    height: 7,
                    marginTop: space.space3,
                    borderRadius: radius.radiusFull,
                    overflow: 'hidden',
                    backgroundColor: palette.surfaceRaised,
                  }}
                >
                  <View
                    style={{
                      width: '66%',
                      height: '100%',
                      borderRadius: radius.radiusFull,
                      backgroundColor: palette.accent,
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {actionState !== null && (
        <View style={{ paddingBottom: (isMap ? space.space4 : space.space3) + bottomInset }}>
          {view === 'list' && stops.length > 0 && state.kind !== 'optimized' && (
            <View
              style={{
                marginHorizontal: layout.screenPadding,
                marginBottom: space.space5,
                paddingHorizontal: space.space4,
                paddingVertical: space.space3,
                borderRadius: radius.radiusLg,
                backgroundColor: palette.accentSubtle,
              }}
              testID="plan-ready-card"
            >
              <Text style={{ color: palette.accent, fontSize: 18, fontWeight: '700' }}>
                {`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} ready`}
              </Text>
              <Text style={{ color: palette.accent, fontSize: 15, marginTop: space.space1 }}>
                Optimize to automatically reorder them.
              </Text>
            </View>
          )}
          <PrimaryAction
            state={actionState}
            onPress={onPrimaryAction}
            shape="block"
            testID="plan-action"
          />
        </View>
      )}
    </View>
  );
}

function actionFor(intent: ActionIntent): PrimaryActionState | null {
  switch (intent.kind) {
    case 'optimize':
      return { kind: 'ready', label: 'Optimize route' };
    case 'optimizing':
      return { kind: 'working', label: 'Optimize route' };
    case 'start':
      return { kind: 'ready', label: 'Confirm & open navigator' };
    case 'retry':
      return { kind: 'ready', label: 'Optimize route' };
    default:
      return null;
  }
}

function titleStyle(color: string) {
  return {
    color,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700' as const,
    marginTop: space.space5,
  };
}

function subtitleStyle(color: string) {
  return { color, fontSize: 16, lineHeight: 23, marginTop: space.space1 };
}
