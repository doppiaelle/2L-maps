import { useMemo, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { parsePaste, type PasteCandidate } from '@/lib/import/paste';

/**
 * Import state, and the decision about when to spend money on it.
 *
 * Two readers, ordered.
 *
 * **The model reads everything, and it is the primary path.** An earlier version
 * offered it only when a line-splitting heuristic decided the text looked like
 * prose, which meant the interesting case — a note where the addresses run
 * together without a line break each — landed on the splitter, produced one
 * useless candidate, and the user had to notice a secondary link to get the tool
 * that would actually have worked.
 *
 * The cost is a metered call per import ([ADR-0016](../../docs/adr/0016-ai-assisted-stop-entry.md)),
 * accepted deliberately: an import is a rare, deliberate act — a few a day at
 * most — and the alternative was a feature that failed on the material it exists
 * for.
 *
 * **The splitter still runs, underneath, always.** It is free, instant, and it is
 * what the screen shows when there is no model configured, when the call fails,
 * and while the call is in flight. A paid attempt that fails must not take away
 * a working answer that was already there.
 */

export interface ImportProblem {
  readonly text: string;
  /** Why this line is here, in the user's terms. "Unparsed" is our word. */
  readonly reason: string;
}

export interface ImportState {
  readonly text: string;
  setText: (text: string) => void;
  readonly candidates: readonly PasteCandidate[];
  readonly problems: readonly ImportProblem[];
  readonly canParse: boolean;
  readonly isParsing: boolean;
  parse: () => void;
  editProblem: (index: number, text: string) => void;

  /**
   * Resolve the candidates into stops.
   *
   * **Separate from parsing, and after review, on purpose.** Geocoding is what
   * turns text into a `place_id`, which is the durable key everything else in
   * the product hangs off ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
   * A stop added without one could not be saved, handed off or re-resolved — so
   * the import does not "add addresses and sort it out later".
   *
   * Partial success again: the lines that resolved become stops, the ones that
   * did not come back as problems the user can correct and retry.
   */
  resolve: () => Promise<readonly { readonly placeId: string; readonly address: string }[]>;
  readonly isResolving: boolean;
  /**
   * The last thing that went wrong, so the screen states it rather than
   * appearing to ignore a tap.
   *
   * `could-not-parse` was missing and the omission was visible in use: the model
   * call failed, the hook returned early, and the button had simply done
   * nothing. The free splitter's result stayed on screen — correct behaviour —
   * but nothing said the paid attempt had been tried and failed, so the feature
   * read as broken rather than degraded (`CLAUDE.md` §0 rule 5).
   */
  readonly failure: 'could-not-resolve' | 'could-not-parse' | null;
}

export function useImport(): ImportState {
  const services = useServices();
  const { allowances } = useUsageQuota();

  const [text, setText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [failure, setFailure] = useState<ImportState['failure']>(null);
  /** Addresses the geocoder could not place. Usually a missing town rather than
   *  a place that does not exist, which is why they come back for correction. */
  const [unresolved, setUnresolved] = useState<readonly string[]>([]);
  /** What the model returned, when it has been asked. Held separately from the
   *  paste so a failed parse leaves the free result standing. */
  const [parsed, setParsed] = useState<{
    readonly addresses: readonly string[];
    readonly unparsed: readonly string[];
  } | null>(null);
  const [edits, setEdits] = useState<Readonly<Record<number, string>>>({});

  const split = useMemo(
    () => parsePaste(text, allowances.maxStopsPerRoute),
    [text, allowances.maxStopsPerRoute],
  );

  const candidates: readonly PasteCandidate[] =
    parsed === null
      ? split.candidates
      : parsed.addresses.map((address, index) => ({ index, text: address }));

  const problems: readonly ImportProblem[] = useMemo(() => {
    const rows: ImportProblem[] = [];

    for (const line of parsed?.unparsed ?? []) {
      rows.push({ text: line, reason: 'Could not read this as an address' });
    }
    for (const line of unresolved) {
      rows.push({ text: line, reason: 'No match — try adding the town' });
    }
    for (const line of split.duplicates) {
      // Named rather than silently removed: a user who pasted thirty rows and
      // got twenty-eight stops is otherwise left counting.
      rows.push({ text: line, reason: 'Already in the list' });
    }
    for (const line of split.overflow) {
      rows.push({
        text: line,
        reason: `Over your plan's limit of ${allowances.maxStopsPerRoute} stops`,
      });
    }

    return rows.map((row, index) => {
      const edited = edits[index];
      return edited === undefined ? row : { ...row, text: edited };
    });
  }, [parsed, unresolved, split.duplicates, split.overflow, allowances.maxStopsPerRoute, edits]);

  return {
    text,
    setText: (next) => {
      setText(next);
      // A new paste is a new question. Keeping the previous parse would show the
      // user addresses from text they have replaced.
      setParsed(null);
      setEdits({});
      setUnresolved([]);
      setFailure(null);
    },
    candidates,
    problems,
    // Whenever there is something to read and something to read it with. The
    // heuristic that used to gate this is gone: it hid the feature from exactly
    // the material the feature is for.
    canParse: text.trim() !== '' && services !== null && !isParsing,
    isParsing,
    parse: () => {
      if (services === null) return;
      setIsParsing(true);

      void services.geocoding
        .parse({ kind: 'text', text })
        .then((outcome) => {
          setIsParsing(false);
          if (!outcome.ok) {
            // The free result is left standing — clearing a working answer
            // because a paid attempt failed takes away the thing that worked —
            // but the attempt is reported. Returning silently here is what made
            // the button look dead.
            setFailure('could-not-parse');
            return;
          }
          setParsed({ addresses: outcome.candidates, unparsed: outcome.unparsed });
          setEdits({});
        })
        .catch(() => {
          setIsParsing(false);
          setFailure('could-not-parse');
        });
    },
    editProblem: (index, next) => {
      setEdits((current) => ({ ...current, [index]: next }));
    },

    isResolving,

    resolve: async () => {
      if (services === null) return [];

      const addresses = [
        ...candidates.map((candidate) => candidate.text),
        // A corrected line joins the list. That is the entire point of making
        // the problem rows editable rather than merely visible.
        ...problems
          .filter((problem, index) => edits[index] !== undefined && problem.text.trim() !== '')
          .map((problem) => problem.text),
      ];
      if (addresses.length === 0) return [];

      setIsResolving(true);
      const outcome = await services.geocoding.geocodeAddresses(addresses);
      setIsResolving(false);

      if (!outcome.ok) {
        // Nothing is added, and the list the user assembled is left exactly as
        // it was. Clearing it because a network call failed would make them
        // paste it again.
        setFailure('could-not-resolve');
        return [];
      }

      setFailure(null);
      // What did not resolve becomes a problem row rather than vanishing: the
      // user pasted it, and an address the geocoder could not place is usually
      // one that needs a town adding, not one that does not exist.
      setUnresolved(outcome.unresolved);

      return outcome.resolved.map((place) => ({
        placeId: place.placeId,
        address: place.formattedAddress,
      }));
    },

    failure,
  };
}
