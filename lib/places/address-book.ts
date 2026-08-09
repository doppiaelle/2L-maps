import { COORDINATE_MAX_AGE_DAYS } from '@/types';

import type { PlaceOption } from './search';

/**
 * The address book — one table, two sections.
 *
 * **This is the product's main cost lever, and it is the cheapest code in it.**
 * Address entry is 78% of per-user COGS
 * ([`docs/31_COST_MODEL.md`](../../docs/31_COST_MODEL.md) §8); every stop added
 * from here is an autocomplete session not opened and a Places call not made
 * (`CLAUDE.md` §6 rule 2). A driver's addresses repeat — that is what makes this
 * segment affordable to serve at all.
 *
 * **There is one table, not two.** `docs/08_SCREEN_SPECIFICATIONS.md` described
 * "recents, then favourites" as though they were separate stores;
 * [`docs/12_DATABASE.md`](../../docs/12_DATABASE.md) has a single `favourites`
 * table called "the address book", ordered by `use_count` and `last_used_at` and
 * indexed for exactly that. The schema wins: it was designed with the index and
 * the reason for it, and inventing a second table to match a screen description
 * would give two places for the same address to live.
 *
 * So the split is derived rather than stored. **Recent** is what was used inside
 * the coordinate window; **Saved** is everything older, still in the book and
 * still free to reuse. The window is the same thirty days as
 * [ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md) —
 * not a coincidence and not a coupling: past it, the coordinates for that place
 * have been purged anyway, so the two sections also happen to divide "will be
 * instant" from "may need one lookup".
 */

/** One row of the book, as stored, plus whatever the shared cache still holds
 *  for it. */
export interface AddressBookEntry {
  readonly placeId: string;
  /** The user's own name for it. Durable, never purged, and the only thing that
   *  survives when the coordinates do not. */
  readonly label: string | null;
  /** From `places_cache`, and null once the purge has run (ADR-0007). */
  readonly formattedAddress: string | null;
  readonly useCount: number;
  readonly lastUsedAt: string | null;
}

export interface AddressBook {
  readonly recent: readonly PlaceOption[];
  readonly saved: readonly PlaceOption[];
}

/**
 * Split and order the book.
 *
 * Recent is ordered by when, Saved by how often — which is the question each
 * section is answering. A driver looking in Recent means "the one from this
 * morning"; a driver looking in Saved means "the depot".
 */
export function splitAddressBook(
  entries: readonly AddressBookEntry[],
  now: Date = new Date(),
): AddressBook {
  const cutoff = now.getTime() - COORDINATE_MAX_AGE_DAYS * 86_400_000;

  const showable = entries.filter(isShowable);

  const recent = showable
    .filter((entry) => usedAt(entry) > cutoff)
    .sort((a, b) => usedAt(b) - usedAt(a));

  const saved = showable
    .filter((entry) => usedAt(entry) <= cutoff)
    .sort((a, b) => b.useCount - a.useCount || usedAt(b) - usedAt(a));

  return { recent: recent.map(toOption), saved: saved.map(toOption) };
}

/**
 * Whether an entry can be shown at all.
 *
 * An entry whose address has been purged and that the user never named has
 * nothing readable left — a blank row in a picker is not an option, it is a
 * guess. It is **not deleted**: the `place_id` is durable, and the next time
 * anything resolves that place the cache refills and the row comes back with its
 * street on it. Deleting the user's address book to tidy up a purge would be the
 * terms obligation eating the feature it was meant to protect.
 */
function isShowable(entry: AddressBookEntry): boolean {
  return (entry.label !== null && entry.label.trim() !== '') || entry.formattedAddress !== null;
}

/** Missing is treated as the epoch rather than as now: a row the server has
 *  never stamped is old, not fresh, and guessing upward would put it at the top
 *  of Recent for ever. */
function usedAt(entry: AddressBookEntry): number {
  if (entry.lastUsedAt === null) return 0;
  const parsed = Date.parse(entry.lastUsedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The user's own label wins the headline.
 *
 * They wrote "Depot" because "Via Borgo Palazzo 137" is not how they think about
 * it. The address goes underneath so the row is still verifiable at a glance —
 * two stops named "Warehouse" would otherwise be indistinguishable.
 */
function toOption(entry: AddressBookEntry): PlaceOption {
  const label = entry.label === null || entry.label.trim() === '' ? null : entry.label.trim();
  const address = entry.formattedAddress;

  if (label !== null) {
    return { placeId: entry.placeId, primaryText: label, secondaryText: address ?? '' };
  }

  // No label, so the address carries the row. Split at the first comma: the
  // street is what identifies a stop and the town is context, which is also how
  // Places itself divides a suggestion.
  const separator = (address ?? '').indexOf(',');
  if (address === null) return { placeId: entry.placeId, primaryText: '', secondaryText: '' };

  return separator === -1
    ? { placeId: entry.placeId, primaryText: address, secondaryText: '' }
    : {
        placeId: entry.placeId,
        primaryText: address.slice(0, separator).trim(),
        secondaryText: address.slice(separator + 1).trim(),
      };
}
