import { z } from 'zod';

import type { AddressBookEntry } from '@/lib/places/address-book';
import type { RoutesPort } from './routes-adapter';

/**
 * The address book, over PostgREST.
 *
 * Reads join `favourites` to `places_cache`, which is the durability boundary in
 * one query: the book's own columns — `place_id`, the user's label, the counts —
 * are durable, and the street name beside them is on loan for thirty days
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * A `left` join rather than an inner one, so a purged place still comes back and
 * the entry is still the user's.
 *
 * **`recordUse` is the only write, and it must never fail loudly.** It is
 * book-keeping that happens while the user is doing something else — adding a
 * stop — and a toast saying "could not update your address book" in the middle
 * of building a route would be the app complaining about its own filing.
 */

const entryRowSchema = z.object({
  place_id: z.string(),
  label: z.string().nullable(),
  use_count: z.number().int(),
  last_used_at: z.string().nullable(),
  // PostgREST returns an embedded one-to-one as an object, or null when the
  // referenced row is absent.
  places_cache: z.object({ formatted_address: z.string().nullable() }).nullable(),
});

const ENTRY_COLUMNS = 'place_id,label,use_count,last_used_at,places_cache(formatted_address)';

/** What the book needs beyond reading and writing rows. Deliberately its own
 *  port rather than a wider one: this feature never touches routes. */
export interface FavouritesPort extends Pick<RoutesPort, 'select'> {
  /**
   * `record_place_use(place_id)`.
   *
   * A database function rather than a read-modify-write, for two reasons. The
   * increment is atomic, so a driver adding the same address on two devices does
   * not have both of them write `use_count = 4`. And the owner comes from
   * `auth.uid()` inside the function, so the client never states whose book it
   * is — a client-supplied `user_id` would be a claim the policy then has to
   * disprove, rather than a fact.
   */
  recordUse: (placeId: string) => Promise<{ error: { message: string } | null }>;
}

export interface FavouritesProvider {
  /** Null when the read failed — distinct from an empty book, which is what a
   *  new user has and is not an error. */
  list: (limit: number) => Promise<readonly AddressBookEntry[] | null>;
  /** Fire and forget by design; see above. */
  recordUse: (placeId: string) => Promise<void>;
}

export function createFavouritesProvider(port: FavouritesPort): FavouritesProvider {
  return {
    list: async (limit) => {
      const { data, error } = await port.select('favourites', {
        columns: ENTRY_COLUMNS,
        // Newest use first. The split into Recent and Saved happens in
        // `splitAddressBook`, but the ordering has to come from the index —
        // `favourites_user_recent_idx` exists for exactly this query.
        order: { column: 'last_used_at', ascending: false },
        limit,
      });
      if (error !== null) return null;

      const parsed = z.array(entryRowSchema).safeParse(data);
      if (!parsed.success) return null;

      return parsed.data.map((row): AddressBookEntry => ({
        placeId: row.place_id,
        label: row.label,
        formattedAddress: row.places_cache?.formatted_address ?? null,
        useCount: row.use_count,
        lastUsedAt: row.last_used_at,
      }));
    },

    recordUse: async (placeId) => {
      // The failure is swallowed on purpose. The user added a stop; whether we
      // managed to remember the address is our problem, and the worst case is
      // that the same address costs a search once more.
      await port.recordUse(placeId);
    },
  };
}
