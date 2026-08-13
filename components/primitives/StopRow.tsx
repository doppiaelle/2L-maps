import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { markerStyle } from '@/lib/map/style';
import type { StopText } from '@/lib/route/stop-text';
import type { StopProgressState } from '@/lib/route/progress';

/**
 * One stop in the list.
 *
 * The row is where two accessibility rules meet the product's actual data.
 *
 * **Never colour alone** (`CLAUDE.md` §10 rule 4). An unreachable stop shows a
 * glyph *and* red. A user with deuteranopia has to be able to work this list,
 * and colour-only state is the single most common way a list stops being usable
 * for them.
 *
 * **The ordinal is drawn by `markerStyle`, the same function the map pin uses.**
 * The row used to keep its own palette — a mint-tinted disc with mint digits —
 * so the same stop was a mint dot in the list and a white pin on the map, and
 * every stop looked accented in a system with exactly one accent
 * (`CLAUDE.md` §8 rule 2). One source, two renderers.
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

export type StopState = StopProgressState;

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
  /** Which palette the ordinal is drawn from. Passed rather than read here: a
   *  component that asks the system for the colour scheme answers differently in
   *  a test and in split screen. */
  readonly theme: ThemeName;
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

export function StopRow({
  position,
  text,
  state,
  theme,
  hasCoordinate,
  meta,
  onPress,
  onRemove,
  onMoveUp,
  onMoveDown,
  testID,
}: StopRowProps): React.JSX.Element {
  // `false` for selection: the row has no selected appearance, and a selected
  // pin's mint fill would put the accent on a row for a stop the user merely
  // tapped on the map.
  const presentation = markerStyle(theme, state, false);
  const { title, subtitle } = text;
  const palette = colours[theme];
  const ordinalFill = state === 'pending' ? palette.textPrimary : presentation.fill;
  const ordinalText = state === 'pending' ? palette.bg : presentation.foreground;

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
      style={{ minHeight: layout.touchMin, paddingVertical: space.space3 }}
      className="flex-row items-center gap-space-4 px-screen-padding"
      testID={testID}
    >
      {/* The ordinal is the row's anchor: it is what the user reads out loud to
          themselves while driving, so it is the one number that never moves. */}
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: radius.radiusFull,
          backgroundColor: ordinalFill,
          borderWidth: state === 'pending' ? 0 : 2,
          borderColor: presentation.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="stop-ordinal"
      >
        <Text style={{ color: ordinalText, fontSize: 18, fontWeight: '700' }}>
          {presentation.glyph ?? position}
        </Text>
      </View>

      <View className="flex-1">
        <Text
          style={{ color: palette.textPrimary, fontSize: 22, lineHeight: 28, fontWeight: '700' }}
          numberOfLines={2}
        >
          {title}
        </Text>

        {subtitle !== null && (
          <Text
            style={{ color: palette.textSecondary, fontSize: 17, lineHeight: 23, marginTop: 3 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}

        {meta !== null && (
          <Text style={{ color: palette.textSecondary, fontSize: 15, marginTop: 3 }}>{meta}</Text>
        )}

        {!hasCoordinate && (
          // Warning, not danger: an expired coordinate is expected behaviour on
          // a route saved a month ago, not an error the user caused
          // (docs/07_DESIGN_SYSTEM.md).
          <Text style={{ color: palette.warning, fontSize: 15, marginTop: 3 }}>
            Address needs refreshing
          </Text>
        )}
      </View>

      {(onMoveUp !== undefined || onMoveDown !== undefined || onRemove !== undefined) && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }} testID="stop-controls">
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
        borderRadius: radius.radiusMd,
        borderWidth: glyph === '✕' ? 1 : 0,
        borderColor: '#E4E4E1',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isEnabled ? 1 : 0.22,
      }}
      testID={testID}
    >
      <Text style={{ color: '#6B6B70', fontSize: glyph === '✕' ? 28 : 18 }}>{glyph}</Text>
    </Pressable>
  );
}
