import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * Something that just happened, said once and dismissed.
 *
 * Sibling of `<UndoToast>` and deliberately not the same component: that one is
 * a *window* — it counts down, it pauses when the app is backgrounded, and its
 * action reverses something. This one reports. Sharing them would mean a toast
 * saying "Sent in 3 parts" with a button labelled Undo, which is a sentence
 * nobody can act on.
 *
 * **It stays until it is read.** No timer. The two things it says most often —
 * a route split into chunks, and a navigation app that is not installed — are
 * both things the driver has to act on before setting off, and a message that
 * removes itself after six seconds is one they can miss entirely by looking at
 * the road.
 */

export interface NoticeToastProps {
  readonly title: string;
  readonly detail: string | null;
  /** `success` is mint, `warning` is the warning token. Never red: red means
   *  error and nothing else ([ADR-0009](../../docs/adr/0009-visual-direction.md)),
   *  and none of these are errors — they are outcomes. */
  readonly kind: 'success' | 'warning';
  onDismiss: () => void;
  /** Points above the bottom edge, so it clears the dock. Passed rather than
   *  measured, like every other layout number here. */
  readonly bottomOffset?: number;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function NoticeToast({
  title,
  detail,
  kind,
  onDismiss,
  bottomOffset = 0,
  theme,
  testID,
}: NoticeToastProps): React.JSX.Element {
  const palette = colours[theme];
  const accent = kind === 'success' ? palette.accent : palette.warning;

  return (
    <View
      style={{
        position: 'absolute',
        left: layout.screenPadding,
        right: layout.screenPadding,
        bottom: bottomOffset,
        padding: space.space3,
        borderRadius: radius.radiusLg,
        backgroundColor: palette.surfaceRaised,
        borderWidth: 1,
        borderColor: palette.border,
        // The only colour on it, and on one edge rather than the whole surface:
        // a fully tinted panel competes with the route it is reporting on.
        borderLeftWidth: 3,
        borderLeftColor: accent,
        gap: space.space1,
      }}
      // Announced when it appears: the thing it reports has already happened,
      // and the user may have been looking at the road (`CLAUDE.md` §10 rule 7).
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID={testID}
    >
      <Text className="text-body-strong text-text-primary">{title}</Text>
      {detail !== null && <Text className="text-caption text-text-secondary">{detail}</Text>}

      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss: ${title}`}
        style={{
          minHeight: layout.touchMin,
          justifyContent: 'center',
          alignSelf: 'flex-start',
        }}
        testID="notice-dismiss"
      >
        <Text className="text-body-strong text-accent">Got it</Text>
      </Pressable>
    </View>
  );
}
