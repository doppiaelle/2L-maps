import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colours, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import {
  endLabel,
  startLabel,
  type RouteEndPreference,
  type RouteStartPreference,
} from '@/lib/route/route-ends';

export interface RouteEndpointControlsProps {
  readonly start: RouteStartPreference;
  readonly end: RouteEndPreference;
  readonly locationState: 'available' | 'denied' | 'locating' | 'ready';
  readonly disabled?: boolean;
  onChooseStart: (start: RouteStartPreference) => void;
  onChooseEnd: (end: RouteEndPreference) => void;
  onReset: () => void;
  readonly theme: ThemeName;
}

/** Small, in-flow controls: visible enough to prevent invisible routing rules,
 * compact enough not to compete with the stop list. */
export function RouteEndpointControls({
  start,
  end,
  locationState,
  disabled = false,
  onChooseStart,
  onChooseEnd,
  onReset,
  theme,
}: RouteEndpointControlsProps): React.JSX.Element {
  const palette = colours[theme];
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const locationPending = start === 'current-location' && locationState !== 'ready';

  return (
    <View style={{ marginTop: space.space3 }} testID="route-endpoint-controls">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.space2 }}>
        <ChoiceButton
          label="Start"
          value={locationPending ? 'Locating…' : startLabel(start)}
          selected={open === 'start'}
          disabled={disabled}
          onPress={() => setOpen((current) => (current === 'start' ? null : 'start'))}
          theme={theme}
          testID="route-start-choice"
        />
        <ChoiceButton
          label="End"
          value={endLabel(end)}
          selected={open === 'end'}
          disabled={disabled}
          onPress={() => setOpen((current) => (current === 'end' ? null : 'end'))}
          theme={theme}
          testID="route-end-choice"
        />
        <Pressable
          onPress={onReset}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Reset current route"
          accessibilityHint="Removes all stops and starts a new route"
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.radiusMd,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
            opacity: disabled ? 0.5 : 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          testID="route-reset"
        >
          <Text style={{ color: palette.textSecondary, fontSize: 18, fontWeight: '700' }}>↻</Text>
        </Pressable>
      </View>

      {open !== null && (
        <View
          style={{
            marginTop: space.space2,
            padding: space.space2,
            borderRadius: radius.radiusMd,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surfaceRaised,
            gap: space.space1,
          }}
          testID={`route-${open}-menu`}
        >
          {(open === 'start' ? START_OPTIONS : END_OPTIONS).map((option) => {
            const isSelected = open === 'start' ? start === option.value : end === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  if (open === 'start') onChooseStart(option.value as RouteStartPreference);
                  else onChooseEnd(option.value as RouteEndPreference);
                  setOpen(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={option.accessibilityLabel}
                style={{
                  minHeight: 38,
                  paddingHorizontal: space.space3,
                  borderRadius: radius.radiusSm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isSelected ? palette.accentSubtle : 'transparent',
                }}
                testID={`route-${open}-${option.value}`}
              >
                <Text
                  style={{
                    color: isSelected ? palette.accent : palette.textPrimary,
                    fontSize: 13,
                    fontWeight: isSelected ? '700' : '600',
                  }}
                >
                  {option.label}
                </Text>
                {isSelected && <Text style={{ color: palette.accent, fontWeight: '700' }}>●</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {locationPending && (
        <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: space.space2 }}>
          A precise location is required before optimization.
        </Text>
      )}
    </View>
  );
}

function ChoiceButton({
  label,
  value,
  selected,
  disabled,
  onPress,
  theme,
  testID,
}: {
  label: string;
  value: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ expanded: selected }}
      style={{
        flex: 1,
        minHeight: 38,
        paddingHorizontal: space.space2,
        borderRadius: radius.radiusMd,
        borderWidth: 1,
        borderColor: selected ? palette.accent : palette.border,
        backgroundColor: palette.surface,
        opacity: disabled ? 0.5 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      testID={testID}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.textTertiary, fontSize: 9, fontWeight: '700' }}>
          {label.toUpperCase()}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: palette.textPrimary, fontSize: 12, fontWeight: '700', marginTop: 1 }}
        >
          {value}
        </Text>
      </View>
      <Text style={{ color: palette.textSecondary, fontSize: 12, marginLeft: space.space1 }}>
        ⌄
      </Text>
    </Pressable>
  );
}

const START_OPTIONS = [
  {
    value: 'first-stop',
    label: 'First stop',
    accessibilityLabel: 'Start from the first stop entered',
  },
  {
    value: 'current-location',
    label: 'My location',
    accessibilityLabel: 'Start from my current location',
  },
] as const;

const END_OPTIONS = [
  {
    value: 'last-stop',
    label: 'Last stop',
    accessibilityLabel: 'Finish at the last stop entered',
  },
  {
    value: 'return-to-start',
    label: 'Return to starting point',
    accessibilityLabel: 'Finish by returning to the starting point',
  },
  {
    value: 'current-location',
    label: 'Return to my location',
    accessibilityLabel: 'Start and finish at my current location',
  },
] as const;
