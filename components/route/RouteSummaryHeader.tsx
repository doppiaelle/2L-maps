import { Text, View } from 'react-native';

import { MetricPair } from '@/components/primitives/MetricPair';
import { StatusChip } from '@/components/primitives/StatusChip';
import type { StatusChipKind } from '@/components/primitives/StatusChip';

/**
 * The sheet's header: what this route is, in two numbers.
 *
 * Oversized numerals with uppercase labels
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 * The number is the point, so it is set in the metric voice
 * ([ADR-0009](../../docs/adr/0009-visual-direction.md)).
 *
 * **An estimate is labelled as one.** A straight-line figure and a traffic-aware
 * duration are different claims about the same day, and a driver plans on that
 * number. Whether it is an estimate is decided in `lib/route/plan-state.ts`; the
 * header is told, and says so.
 *
 * The values arrive already formatted. This component never decides units,
 * precision or locale — `lib/format/units.ts` does, once, for the whole product.
 */

export interface RouteSummaryHeaderProps {
  /** `ROUTE · 12 STOPS`, or the empty state's own line. */
  readonly title: string;
  readonly distance: { readonly value: string; readonly spoken: string } | null;
  readonly duration: { readonly value: string; readonly spoken: string } | null;
  readonly chip?: StatusChipKind;
  /** Overrides the chip's default wording where the screen knows better. */
  readonly chipLabel?: string;
  /** Shown instead of a chip when the answer is good news — "Already the
   *  fastest order". Stated positively, because reordering nothing is a correct
   *  result and the user paid for it (docs/08 §7). */
  readonly note?: string;
  readonly testID?: string;
}

export function RouteSummaryHeader({
  title,
  distance,
  duration,
  chip,
  chipLabel,
  note,
  testID,
}: RouteSummaryHeaderProps): React.JSX.Element {
  return (
    <View testID={testID}>
      <Text className="text-label-sm text-text-secondary" testID="route-title">
        {title}
      </Text>

      {(distance !== null || duration !== null) && (
        <View className="flex-row gap-space-6 mt-space-1">
          {distance !== null && (
            <MetricPair
              value={distance.value}
              label="Distance"
              spoken={distance.spoken}
              testID="metric-distance"
            />
          )}
          {duration !== null && (
            <MetricPair
              value={duration.value}
              label="Duration"
              spoken={duration.spoken}
              testID="metric-duration"
            />
          )}
        </View>
      )}

      {chip !== undefined && (
        <View className="mt-space-2">
          <StatusChip kind={chip} {...(chipLabel === undefined ? {} : { label: chipLabel })} />
        </View>
      )}

      {note !== undefined && (
        <Text
          className="text-caption text-text-secondary mt-space-2"
          // Announced when it appears: the user was watching the map, not this
          // line, and "already the fastest" is the answer they were waiting for.
          accessibilityLiveRegion="polite"
          testID="route-note"
        >
          {note}
        </Text>
      )}
    </View>
  );
}
