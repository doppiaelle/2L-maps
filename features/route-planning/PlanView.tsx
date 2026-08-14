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
    readonly title: string;
    readonly detail: string;
    readonly progress: number;
  } | null;
  readonly canShowMap?: boolean;
  onShowMap?: () => void;
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
  canShowMap = false,
  onShowMap,
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
          <View
            style={{
              marginTop: space.space4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.space3,
            }}
          >
            <Text style={titleStyle(palette.textPrimary)}>Your route</Text>
            {onShowMap !== undefined && (
              <Pressable
                onPress={canShowMap ? onShowMap : undefined}
                disabled={!canShowMap}
                accessibilityRole="button"
                accessibilityLabel={
                  canShowMap ? 'Show optimized map' : 'Optimized map is not available yet'
                }
                accessibilityState={{ disabled: !canShowMap }}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.radiusMd,
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                  opacity: canShowMap ? 1 : 0.42,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="route-show-map"
              >
                <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: '700' }}>
                  ⌖
                </Text>
              </Pressable>
            )}
          </View>
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
              minHeight: 52,
              marginTop: space.space4,
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
            <Text style={{ color: palette.textTertiary, fontSize: 15 }} numberOfLines={1}>
              Search an address or place…
            </Text>
            <View
              style={{
                width: 42,
                height: 42,
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
                  width: 44,
                  height: 44,
                  borderRadius: radius.radiusMd,
                  backgroundColor: palette.textPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="plan-dismiss-map"
              >
                <Text style={{ color: palette.bg, fontSize: 28, fontWeight: '700' }}>‹</Text>
              </Pressable>
            )}
            {isMap && selectedLeg !== null && (
              <View
                style={{
                  position: 'absolute',
                  left: layout.screenPadding,
                  right: layout.screenPadding,
                  bottom: bottomInset + space.space6,
                  padding: space.space3,
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
                    fontSize: 20,
                    lineHeight: 25,
                    fontWeight: '700',
                    marginTop: space.space2,
                  }}
                >
                  {selectedLeg.title}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    color: palette.bg,
                    opacity: 0.72,
                    fontSize: 14,
                    lineHeight: 19,
                    marginTop: space.space2,
                  }}
                >
                  {selectedLeg.detail}
                </Text>
                <Text
                  style={{
                    color: palette.accent,
                    fontSize: 17,
                    fontWeight: '700',
                    marginTop: space.space3,
                  }}
                  accessibilityLabel={selectedLeg.spoken}
                  testID="plan-selected-leg"
                >
                  {selectedLeg.value}
                </Text>
                <View
                  style={{
                    height: 6,
                    marginTop: space.space3,
                    borderRadius: radius.radiusFull,
                    overflow: 'hidden',
                    backgroundColor: palette.surfaceRaised,
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round(selectedLeg.progress * 100)}%`,
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
                marginBottom: space.space4,
                paddingHorizontal: space.space3,
                paddingVertical: space.space3,
                borderRadius: radius.radiusLg,
                backgroundColor: palette.accentSubtle,
              }}
              testID="plan-ready-card"
            >
              <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '700' }}>
                {`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} ready`}
              </Text>
              <Text style={{ color: palette.accent, fontSize: 14, marginTop: space.space1 }}>
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
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700' as const,
    flex: 1,
  };
}

function subtitleStyle(color: string) {
  return { color, fontSize: 15, lineHeight: 21, marginTop: space.space1 };
}
