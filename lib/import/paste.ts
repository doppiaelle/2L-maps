import { MAX_STOPS } from '@/types';

/**
 * Turning pasted text into candidate addresses, without a model.
 *
 * **This is the primary path, not the fallback.** A driver's day usually arrives
 * as a list — one address per line, out of a spreadsheet, an email or a
 * dispatcher's message — and that list needs splitting and tidying rather than
 * understanding. Sending it to a language model would be paying for inference to
 * do the work of a `split`.
 *
 * The model ([ADR-0016](../../docs/adr/0016-ai-assisted-stop-entry.md)) earns
 * its place on the *other* material: a forwarded WhatsApp thread, a photographed
 * delivery note, prose with addresses embedded in it. So the two are ordered —
 * this first, the model when this is not enough — and this one also has to work
 * when the model is unavailable, unaffordable or turned off.
 *
 * Everything here is pure and none of it guesses. A line that cannot be read is
 * carried forward as a line the user is shown, never as an address invented from
 * it: a guess that reaches a route sends a driver to the wrong door, and it does
 * so with the same confidence as a correct answer.
 */

export interface PasteCandidate {
  /** Position in the pasted text, so a correction can be shown against the
   *  original rather than against a renumbered list. */
  readonly index: number;
  readonly text: string;
}

export interface PasteResult {
  readonly candidates: readonly PasteCandidate[];
  /** Lines dropped as duplicates of an earlier one, named so a user who expected
   *  thirty stops and got twenty-eight is told why rather than left counting. */
  readonly duplicates: readonly string[];
  /** Lines beyond the ceiling. Refused before geocoding, never silently cut. */
  readonly overflow: readonly string[];
  /** True when the text looks like prose rather than a list, so the screen can
   *  offer the model instead of a bad split. */
  readonly needsParsing: boolean;
}

/**
 * How many words a line may have before it stops looking like an address.
 *
 * An Italian address runs to about eight — "Via Borgo Palazzo 137, 24125
 * Bergamo BG". A twenty-word line is a sentence, and splitting a paragraph on
 * newlines produces exactly those.
 */
const MAX_WORDS_PER_ADDRESS = 14;

/** Below this a "line" is a fragment: a name, a phone number, a bare postcode. */
const MIN_ADDRESS_CHARACTERS = 6;

/**
 * The share of usable lines below which the text is prose rather than a list.
 *
 * Not a confidence score — a routing decision. Above it the split is offered as
 * the answer; below it the user is offered the model, because a paragraph split
 * on newlines yields fragments and telling them "22 of your 25 lines are
 * unreadable" is worse than not having tried.
 */
const LIST_LIKE_RATIO = 0.6;

/**
 * Split, tidy, deduplicate and cap.
 *
 * `maxStops` is the **plan's** ceiling, passed in rather than read from the
 * constant, so a free user is stopped at their own limit and told which one it
 * is rather than at a number belonging to somebody else's subscription
 * ([ADR-0029](../../docs/adr/0029-single-driver-wedge-and-subscription-first-freemium.md)).
 */
export function parsePaste(text: string, maxStops: number = MAX_STOPS): PasteResult {
  const lines = text
    // Also on semicolons: a spreadsheet column pasted from Excel arrives that
    // way as often as it arrives with newlines.
    .split(/[\r\n;]+/)
    .map(normalise)
    .filter((line) => line !== '');

  const usable = lines.filter(isAddressLike);

  // Measured against the lines that survived splitting, not against the raw
  // text: a paste with trailing blank lines is not prose.
  const needsParsing = lines.length > 0 && usable.length / lines.length < LIST_LIKE_RATIO;

  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicates: string[] = [];

  for (const line of usable) {
    // Compared case- and punctuation-insensitively, because the same address
    // typed twice in a spreadsheet rarely matches byte for byte.
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seen.has(key)) {
      duplicates.push(line);
      continue;
    }
    seen.add(key);
    unique.push(line);
  }

  const ceiling = Math.max(0, maxStops);
  return {
    candidates: unique.slice(0, ceiling).map((line, index) => ({ index, text: line })),
    duplicates,
    // Named rather than dropped. A user who pasted forty rows onto a plan that
    // holds fifteen needs to see which fifteen, and that the rest are waiting
    // rather than gone.
    overflow: unique.slice(ceiling),
    needsParsing,
  };
}

/**
 * Tidy one line.
 *
 * Leading list markers are stripped because a pasted list is full of them —
 * "1.", "-", "•", "3)" — and none of them is part of an address. A trailing
 * comma likewise.
 */
function normalise(line: string): string {
  return (
    line
      .replace(/^\s*(?:[-–—*•]|\d{1,3}[.)])\s+/, '')
      // Tabs are what a spreadsheet paste puts between columns, and the columns
      // beside an address are usually part of it.
      .replace(/\t+/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/[,;]\s*$/, '')
      .trim()
  );
}

/**
 * Whether a line is plausibly an address.
 *
 * Deliberately permissive: this decides what to *offer*, not what to send to a
 * driver, and geocoding is the real judge. Being strict here would discard a
 * valid address that happens to be written oddly, which the user would then have
 * to type again.
 */
function isAddressLike(line: string): boolean {
  if (line.length < MIN_ADDRESS_CHARACTERS) return false;
  if (line.split(' ').length > MAX_WORDS_PER_ADDRESS) return false;

  // An address has a number in it somewhere — a street number, a postcode, or
  // both. A line with none is a name, a note or a heading.
  return /\d/.test(line);
}
