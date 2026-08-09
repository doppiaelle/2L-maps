import { Pressable, Text, View } from 'react-native';

import { layout } from '@/lib/design/tokens';

/**
 * One stop in the list.
 *
 * The row is where two accessibility rules meet the product's actual data.
 *
 * **Never colour alone** (`CLAUDE.md` §10 rule 4). A completed stop shows a
 * checkmark *and* mint; an unreachable one shows a glyph *and* red. A user with
 * deuteranopia has to be able to work this list, and colour-only state is the
 * single most common way a list stops being usable for them.
 *
 * **A missing coordinate is shown, not hidden.** Coordinates expire at 30 days
 * by design ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * Hiding that would leave the user to discover it at the moment Waze refuses the
 * handoff — in the van, mid-route.
 *
 * **The address can be absent, and the row still has to say something useful.**
 * `formatted_address` is Google-derived and is purged on the same 30-day rule as
 * the coordinates ([`docs/12_DATABASE.md`](../../docs/12_DATABASE.md)), so an old
 * saved route arrives holding only a `place_id` and whatever the user called it.
 * The user's own label survives indefinitely and carries the row when it does;
 * when there is neither, the row says so rather than rendering an empty line.
 */

export type StopState = 'pending' | 'completed' | 'skipped' | 'unreachable';

export interface StopRowProps {
  readonly position: number;
  /** Null once the 30-day purge has taken it with the coordinates. */
  readonly address: string | null;
  /** User-authored, and shown above the address when present. */
  readonly label: string | null;
  readonly state: StopState;
  /** Null once the 30-day cache has expired. */
  readonly hasCoordinate: boolean;
  /** `2.4 km · 8 min`, once a route has been optimized. */
  readonly meta: string | null;
  onPress: () => void;
  readonly testID?: string;
}

/** Glyph, colour, and the word a screen reader says — together, always. Splitting
 *  them across the file is how one of them gets updated and the others do not. */
const PRESENTATION: Readonly<
  Record<StopState, { glyph: string; textClass: string; spoken: string }>
> = {
  pending: { glyph: '', textClass: 'text-text-primary', spoken: 'not yet visited' },
  completed: { glyph: '✓', textClass: 'text-accent', spoken: 'completed' },
  skipped: { glyph: '→', textClass: 'text-text-secondary', spoken: 'skipped' },
  unreachable: { glyph: '!', textClass: 'text-danger', spoken: 'unreachable' },
};

export function StopRow({
  position,
  address,
  label,
  state,
  hasCoordinate,
  meta,
  onPress,
  testID,
}: StopRowProps): React.JSX.Element {
  const presentation = PRESENTATION[state];
  // The user's own words first, then Google's, then an honest admission. A row
  // that renders an empty line for a purged address looks like a bug in the list
  // rather than a stop that needs re-resolving.
  const title = label ?? address ?? 'Address needs refreshing';
  const subtitle = label !== null ? address : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Says what happens and what the state is, in one utterance — a screen
      // reader user should not have to explore the row to learn either.
      accessibilityLabel={`Stop ${position}, ${title}, ${presentation.spoken}`}
      accessibilityHint={
        hasCoordinate ? 'Opens stop details' : 'Needs its address re-entered before navigating'
      }
      style={{ minHeight: layout.touchMin }}
      className="flex-row items-center gap-space-3 px-screen-padding py-space-2"
      testID={testID}
    >
      {/* The ordinal is the row's anchor: it is what the user reads out loud to
          themselves while driving, so it is the one number that never moves. */}
      <View
        className="w-space-6 h-space-6 rounded-full bg-accent-subtle items-center justify-center"
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="stop-ordinal"
      >
        <Text className="text-label-sm text-accent">{position}</Text>
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-space-1">
          {presentation.glyph !== '' && (
            // The glyph, not merely the colour. This is the whole rule.
            <Text
              className={`text-caption-strong ${presentation.textClass}`}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {presentation.glyph}
            </Text>
          )}
          <Text className={`text-body-strong ${presentation.textClass} flex-1`} numberOfLines={2}>
            {title}
          </Text>
        </View>

        {subtitle !== null && (
          <Text className="text-caption text-text-secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        )}

        {meta !== null && <Text className="text-caption text-text-secondary">{meta}</Text>}

        {!hasCoordinate && (
          // Warning, not danger: an expired coordinate is expected behaviour on
          // a route saved a month ago, not an error the user caused
          // (docs/07_DESIGN_SYSTEM.md).
          <Text className="text-caption text-warning">Address needs refreshing</Text>
        )}
      </View>
    </Pressable>
  );
}
