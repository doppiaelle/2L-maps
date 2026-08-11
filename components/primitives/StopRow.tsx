import { Pressable, Text, View } from 'react-native';

import { layout } from '@/lib/design/tokens';
import type { StopText } from '@/lib/route/stop-text';

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
  /**
   * The two lines to draw, decided upstream by `stopTextOf`.
   *
   * **The row used to reconcile the sources itself** — `label ?? address ??
   * 'Address needs refreshing'` — which put a domain rule in a component with
   * no notion of the thirty-day clock, and made the placeholder mean two very
   * different things at once (`CLAUDE.md` §1).
   */
  readonly text: StopText;
  readonly state: StopState;
  /** Null once the 30-day cache has expired. */
  readonly hasCoordinate: boolean;
  /** `2.4 km · 8 min`, once a route has been optimized. */
  readonly meta: string | null;
  onPress: () => void;
  /**
   * Editing controls, when the route may still be changed.
   *
   * Buttons rather than a swipe. A swipe-only action is invisible and
   * inaccessible (`CLAUDE.md` §7 rule 4), and this row is read one-handed in a
   * van — the affordance has to be something a thumb can find without knowing it
   * is there.
   *
   * Absent while a route is in progress: reordering under a driver who is
   * following the list is not an edit, it is a hazard.
   */
  onRemove?: (() => void) | undefined;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
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
  text,
  state,
  hasCoordinate,
  meta,
  onPress,
  onRemove,
  onMoveUp,
  onMoveDown,
  testID,
}: StopRowProps): React.JSX.Element {
  const presentation = PRESENTATION[state];
  const { title, subtitle } = text;

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

      {(onMoveUp !== undefined || onMoveDown !== undefined || onRemove !== undefined) && (
        <View className="flex-row items-center" testID="stop-controls">
          {/* Each control states the stop it acts on. "Move up" alone is
              ambiguous the moment a screen reader user is moving through a list
              of twenty-five of them. */}
          <RowControl
            glyph="↑"
            label={`Move ${title} up`}
            onPress={onMoveUp}
            testID="stop-move-up"
          />
          <RowControl
            glyph="↓"
            label={`Move ${title} down`}
            onPress={onMoveDown}
            testID="stop-move-down"
          />
          <RowControl glyph="✕" label={`Remove ${title}`} onPress={onRemove} testID="stop-remove" />
        </View>
      )}
    </Pressable>
  );
}

/**
 * One editing control.
 *
 * Rendered disabled rather than hidden when it does not apply — the first stop
 * cannot move up — because a control that disappears makes the row beside it
 * change width and the whole list shift as the user scrolls.
 *
 * The visual glyph is small; the touch target is not. 44×44 is the floor and it
 * is the hit area, not the ink (`CLAUDE.md` §10 rule 2).
 */
function RowControl({
  glyph,
  label,
  onPress,
  testID,
}: {
  glyph: string;
  label: string;
  onPress: (() => void) | undefined;
  testID: string;
}): React.JSX.Element {
  const isEnabled = onPress !== undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isEnabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !isEnabled }}
      style={{
        minWidth: layout.touchMin,
        minHeight: layout.touchMin,
        opacity: isEnabled ? 1 : 0.3,
      }}
      className="items-center justify-center"
      testID={testID}
    >
      <Text className="text-body text-text-secondary">{glyph}</Text>
    </Pressable>
  );
}
