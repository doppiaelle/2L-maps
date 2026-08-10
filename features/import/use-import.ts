import { useMemo, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import { useUsageQuota } from '@/features/quota/use-usage-quota';
import { parsePaste, type PasteCandidate } from '@/lib/import/paste';

/**
 * Import state, and the decision about when to spend money on it.
 *
 * **The split runs first, always, and for free.** A driver's day usually arrives
 * as a list, and a list needs splitting rather than understanding — paying for
 * inference to do the work of a `split` is the sort of cost this product spends
 * its discipline avoiding ([`docs/31_COST_MODEL.md`](../../docs/31_COST_MODEL.md)).
 *
 * **The model is offered, never run automatically**, and only when the split
 * says the text is prose. That is a metered call
 * ([ADR-0016](../../docs/adr/0016-ai-assisted-stop-entry.md)); spending on it is
 * the user's decision, taken with the free result already on screen so they can
 * see what it would be replacing.
 *
 * **A failed parse leaves the free result standing.** The alternative — clearing
 * the screen because the paid attempt failed — takes away something that was
 * working in order to report that something else did not.
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
  /** The last thing that went wrong, so the screen states it rather than
   *  appearing to ignore a tap. */
  readonly failure: 'could-not-resolve' | null;
}

export function useImport(): ImportState {
  const services = useServices();
  const { allowances } = useUsageQuota();

  const [text, setText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [failure, setFailure] = useState<'could-not-resolve' | null>(null);
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
    // Only when the split says so, and only when there is a service to ask.
    canParse: split.needsParsing && services !== null && !isParsing,
    isParsing,
    parse: () => {
      if (services === null) return;
      setIsParsing(true);

      void services.geocoding
        .parse({ kind: 'text', text })
        .then((outcome) => {
          setIsParsing(false);
          // Left standing on failure. Clearing a working free result because a
          // paid attempt failed takes away the thing that was working.
          if (!outcome.ok) return;
          setParsed({ addresses: outcome.candidates, unparsed: outcome.unparsed });
          setEdits({});
        })
        .catch(() => {
          setIsParsing(false);
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
