import { Text, View } from 'react-native';

/**
 * A short, labelled statement about the state of a result.
 *
 * Every chip carries a glyph as well as a colour (`CLAUDE.md` §10 rule 4), and
 * the two are declared together below so one cannot be changed without the
 * other.
 *
 * The kinds are fixed rather than open. A free-text chip would eventually be
 * used to say something red that is not an error, and the one thing red is
 * allowed to mean in this product is error or warning
 * ([ADR-0009](../../docs/adr/0009-visual-direction.md)). A degraded result is
 * `warning`, never `danger`: it is a lower-confidence answer, not a failure
 * ([`docs/07_DESIGN_SYSTEM.md`](../../docs/07_DESIGN_SYSTEM.md)).
 */

export type StatusChipKind = 'degraded' | 'offline' | 'stale' | 'quota';

interface ChipPresentation {
  readonly glyph: string;
  readonly containerClass: string;
  readonly textClass: string;
  readonly defaultLabel: string;
}

const PRESENTATION: Readonly<Record<StatusChipKind, ChipPresentation>> = {
  // "Estimated without traffic" says what is missing. "Degraded" is our word for
  // it, not the user's, and it tells them nothing they can act on.
  degraded: {
    glyph: '⚠',
    containerClass: 'bg-surface-raised border border-warning',
    textClass: 'text-warning',
    defaultLabel: 'Estimated without traffic',
  },
  offline: {
    glyph: '◌',
    containerClass: 'bg-surface-raised border border-border',
    textClass: 'text-text-secondary',
    defaultLabel: 'Offline',
  },
  // An ETA computed an hour ago is not wrong, it is old — and the user is the
  // one who can decide whether that matters on their route.
  stale: {
    glyph: '↻',
    containerClass: 'bg-surface-raised border border-border',
    textClass: 'text-text-secondary',
    defaultLabel: 'Estimate may be out of date',
  },
  quota: {
    glyph: '!',
    containerClass: 'bg-danger-subtle border border-danger',
    textClass: 'text-danger',
    defaultLabel: 'Limit reached',
  },
};

export interface StatusChipProps {
  readonly kind: StatusChipKind;
  /** Overrides the default wording where a screen can be more specific — "Free
   *  optimizations used" beats "Limit reached" when the screen knows which. */
  readonly label?: string;
  readonly testID?: string;
}

export function StatusChip({ kind, label, testID }: StatusChipProps): React.JSX.Element {
  const presentation = PRESENTATION[kind];
  const text = label ?? presentation.defaultLabel;

  return (
    <View
      className={`flex-row items-center gap-space-1 px-space-2 py-space-1 rounded-full self-start ${presentation.containerClass}`}
      // One element, one utterance. Announcing the glyph separately would read
      // the decoration and then the fact.
      accessibilityRole="text"
      accessibilityLabel={text}
      testID={testID}
    >
      <Text
        className={`text-caption ${presentation.textClass}`}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="status-chip-glyph"
      >
        {presentation.glyph}
      </Text>
      <Text
        className={`text-label-sm ${presentation.textClass}`}
        accessibilityElementsHidden
        importantForAccessibility="no"
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}
