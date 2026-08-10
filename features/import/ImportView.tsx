import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { PrimaryAction } from '@/components/primitives/PrimaryAction';
import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { PasteCandidate } from '@/lib/import/paste';

/**
 * Import a list
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §8).
 *
 * **Reading the text is the primary action**, and adding what it found is the
 * second. The button that used to say "this looks like a message" appeared only
 * when a heuristic guessed the paste was prose — so the case it was built for,
 * a note with the addresses running together, is exactly the case where it
 * stayed hidden and the user got one useless candidate instead.
 *
 * **Partial success is presented as success**, and that is the other half of
 * the design. Twenty-eight addresses read and three lines unreadable is a good
 * outcome: the primary action says "Add 28 stops" and is enabled, while the
 * three sit below in a section that names what is wrong with each. The failure
 * mode this avoids is the one where a screen refuses the batch because part of
 * it was imperfect, and the user retypes twenty-eight addresses they had already
 * given us (`CLAUDE.md` §0 rule 5).
 *
 * **Nothing is guessed.** A line that could not be read is shown as the line the
 * user pasted, editable, never as an address inferred from it. A guess reaches a
 * route with exactly the same confidence as a correct answer, and sends a driver
 * to the wrong door.
 */

export interface ImportViewProps {
  readonly text: string;
  onTextChange: (text: string) => void;

  readonly candidates: readonly PasteCandidate[];
  /** Lines that look like they were meant to be addresses and could not be read.
   *  Each is shown with its own reason. */
  readonly problems: readonly { readonly text: string; readonly reason: string }[];

  /** There is text to read and a service to read it with. */
  readonly canParse: boolean;
  readonly isParsing: boolean;
  onParse: () => void;

  onEditProblem: (index: number, text: string) => void;
  readonly isResolving: boolean;
  /** Stated rather than swallowed. A tap that appears to do nothing is the
   *  failure mode `CLAUDE.md` §0 rule 5 exists to prevent. */
  readonly failure: 'could-not-resolve' | 'could-not-parse' | null;
  onAdd: () => void;
  onDismiss: () => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function ImportView({
  text,
  onTextChange,
  candidates,
  problems,
  canParse,
  isParsing,
  onParse,
  onEditProblem,
  isResolving,
  failure,
  onAdd,
  onDismiss,
  theme,
  testID,
}: ImportViewProps): React.JSX.Element {
  const palette = colours[theme];
  const count = candidates.length;

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg, padding: layout.screenPadding }}
      testID={testID}
    >
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        Paste your list
      </Text>

      <TextInput
        value={text}
        onChangeText={onTextChange}
        multiline
        // Not focused on open, unlike the search field. The user arrives here to
        // paste, and a keyboard covering the area they are pasting into is the
        // one thing in the way of that.
        placeholder="Paste anything — a list, or a message with the addresses in it"
        placeholderTextColor={palette.textSecondary}
        accessibilityLabel="Paste your addresses, or a message containing them"
        style={{
          minHeight: 120,
          marginTop: space.space4,
          padding: space.space3,
          borderRadius: radius.radiusMd,
          borderWidth: 1,
          borderColor: palette.border,
          color: palette.textPrimary,
          textAlignVertical: 'top',
        }}
        testID="import-input"
      />

      {/* The prominent control, offered for any text at all. It reads a note
          where the addresses run together as readily as a tidy list, which the
          line splitter beneath cannot do. Tapped rather than automatic, because
          it is a metered call and a keystroke must never be one (ADR-0016). */}
      <Pressable
        onPress={onParse}
        disabled={!canParse}
        accessibilityRole="button"
        accessibilityLabel="Read the addresses out of this text"
        accessibilityState={{ disabled: !canParse, busy: isParsing }}
        style={{
          minHeight: layout.actionMinHeight,
          marginTop: space.space3,
          borderRadius: radius.radiusLg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.surfaceRaised,
          opacity: canParse ? 1 : 0.5,
        }}
        testID="import-parse"
      >
        <Text className="text-body-strong text-accent">
          {isParsing ? 'Reading…' : 'Read the addresses'}
        </Text>
      </Pressable>

      <ScrollView style={{ flex: 1, marginTop: space.space4 }}>
        {count > 0 && (
          <View testID="import-added">
            <Text className="text-label-sm text-text-secondary">
              {count === 1 ? '1 ADDRESS FOUND' : `${count} ADDRESSES FOUND`}
            </Text>
            {candidates.map((candidate) => (
              <Text
                key={candidate.index}
                className="text-body text-text-primary mt-space-2"
                testID="import-candidate"
              >
                {candidate.text}
              </Text>
            ))}
          </View>
        )}

        {problems.length > 0 && (
          <View style={{ marginTop: space.space5 }} testID="import-problems">
            {/* Its own section, below the ones that worked, so the good outcome
                is what the user sees first. */}
            <Text className="text-label-sm text-text-secondary">NEEDS A LOOK</Text>
            {problems.map((problem, index) => (
              <View key={`${problem.text}-${index}`} style={{ marginTop: space.space3 }}>
                <TextInput
                  value={problem.text}
                  onChangeText={(next) => {
                    onEditProblem(index, next);
                  }}
                  // The line the user pasted, editable — never an address
                  // inferred from it.
                  accessibilityLabel={`${problem.reason}. Edit: ${problem.text}`}
                  placeholderTextColor={palette.textSecondary}
                  style={{
                    minHeight: layout.touchMin,
                    paddingHorizontal: space.space3,
                    borderRadius: radius.radiusSm,
                    borderWidth: 1,
                    borderColor: palette.border,
                    color: palette.textPrimary,
                  }}
                  testID="import-problem"
                />
                <Text className="text-caption text-text-secondary mt-space-1">
                  {problem.reason}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {failure !== null && (
        <Text className="text-body text-danger mt-space-3" testID="import-failure">
          {failure === 'could-not-parse'
            ? // Names what still works. The split-by-line result below is real and
              // usable, so this is a degraded state rather than a dead end.
              'Could not read the list with AI just now. The lines below were split without it — check them, or try again.'
            : 'Could not look those addresses up just now. Your list is still here — try again in a moment.'}
        </Text>
      )}

      <PrimaryAction
        // Ready while problems remain. Twenty-eight good addresses and three bad
        // lines is a good outcome, and blocking on the three is how a user ends
        // up retyping the twenty-eight.
        state={
          isResolving
            ? { kind: 'working', label: 'Looking them up…' }
            : count === 0
              ? { kind: 'blocked', label: 'Add stops', reason: 'Paste a list to get started' }
              : { kind: 'ready', label: count === 1 ? 'Add 1 stop' : `Add ${count} stops` }
        }
        accessibilityLabel={
          problems.length === 0
            ? `Add ${count} stops to your route`
            : `Add ${count} stops to your route. ${problems.length} ${
                problems.length === 1 ? 'line' : 'lines'
              } still need a look`
        }
        onPress={onAdd}
        testID="import-add"
      />

      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close without adding anything"
        style={{
          minHeight: layout.touchMin,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: space.space2,
        }}
        testID="import-dismiss"
      >
        <Text className="text-body text-text-secondary">Cancel</Text>
      </Pressable>
    </View>
  );
}
