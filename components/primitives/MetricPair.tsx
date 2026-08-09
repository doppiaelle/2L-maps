import { Text, View } from 'react-native';

/**
 * An oversized numeral with an uppercase label beneath it.
 *
 * The number is the point — ETA, distance, stop count — so it is set in the
 * metric voice and the label is set small ([ADR-0009](../../docs/adr/0009-visual-direction.md)).
 *
 * **Figures are tabular.** A proportional `1` is narrower than a `7`, so an ETA
 * counting down re-lays out its own row, and the control beneath it moves under
 * a thumb already travelling towards it. Tabular figures are the whole reason
 * this is a component rather than two `Text`s.
 *
 * The spoken form is separate from the drawn one. "34 KM" is read letter by
 * letter by some screen readers; `accessibilityLabel` takes the words.
 */

export type MetricSize = 'xl' | 'lg' | 'md';

const SIZE_CLASS: Readonly<Record<MetricSize, string>> = {
  xl: 'text-metric-xl',
  lg: 'text-metric-lg',
  md: 'text-metric-md',
};

export interface MetricPairProps {
  /** Already formatted by `lib/format/units.ts` — this component never decides
   *  units, precision or locale. */
  readonly value: string;
  readonly label: string;
  /** What a screen reader says instead: "34 kilometres", not "34 KM". */
  readonly spoken: string;
  readonly size?: MetricSize;
  readonly testID?: string;
}

export function MetricPair({
  value,
  label,
  spoken,
  size = 'lg',
  testID,
}: MetricPairProps): React.JSX.Element {
  return (
    <View accessibilityRole="text" accessibilityLabel={spoken} testID={testID}>
      <Text
        className={`${SIZE_CLASS[size]} text-text-primary`}
        // Tabular figures. Without this the layout shifts on every ETA update.
        style={{ fontVariant: ['tabular-nums'] }}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="metric-value"
        // Allowed to shrink rather than wrap: a hero number on two lines stops
        // being a hero number, and Dynamic Type at 200% would otherwise wrap it.
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text
        className="text-label-sm text-text-secondary"
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="metric-label"
      >
        {label}
      </Text>
    </View>
  );
}
