import { COORDINATE_MAX_AGE_DAYS } from '@/types';
import type { PlaceTextCache, Stop } from '@/types';

/**
 * What a stop is called, and how sure we are of it.
 *
 * **Three sources, in a fixed order of trust**, and getting the order wrong is
 * how a row ends up showing something worse than what it already had:
 *
 * 1. **The user's own `label`.** Theirs, permanent, and it beats anything Google
 *    says — somebody who typed "Magazzino nord" does not want it replaced by a
 *    street address on the next refresh.
 * 2. **A fresh `/place-details` address.** Google's canonical formatting, and
 *    the most current thing we hold.
 * 3. **The text autocomplete already gave us**, captured when the stop was
 *    chosen. Not as canonical as (2), and it is the difference between a
 *    readable list and a column of placeholders — it needs no network, no
 *    allowance, and it is there on the very first frame.
 *
 * **The placeholder is the fourth case and now means only what it says.** Before
 * this it meant "the second round trip has not landed", which was almost always
 * temporary and looked permanent. It now appears when Google's words have
 * genuinely expired and nothing has replaced them.
 *
 * The thirty-day clock is not a detail here. Autocomplete text is Google-derived
 * content and perishes exactly as a coordinate does
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md));
 * caching it up to thirty days is what the terms permit, and holding it past
 * that is a terms violation rather than a stale label.
 */

export interface StopText {
  /** The line the row leads with. Never empty. */
  readonly title: string;
  /** The quieter second line, or null when there is nothing to add. */
  readonly subtitle: string | null;
  /**
   * True when nothing nameable survives and the row is showing the placeholder.
   *
   * The screen uses this to decide whether the row needs attention, so it must
   * not be inferred by comparing `title` to the placeholder string — a real
   * address that happens to match would then be flagged.
   */
  readonly needsRefreshing: boolean;
}

/** Said once, here, so the row and its accessible label cannot drift apart. */
export const NEEDS_REFRESHING = 'Address needs refreshing';

/** Same window as a coordinate, from the same constant. Two clocks for the same
 *  obligation is one of them being wrong. */
export function isPlaceTextFresh(text: PlaceTextCache | null, now: Date): boolean {
  if (text === null) return false;

  const refreshedAt = Date.parse(text.refreshedAt);
  if (Number.isNaN(refreshedAt)) return false;

  const age = now.getTime() - refreshedAt;
  // A future timestamp is a broken clock, not freshness. Treating it as fresh
  // would keep Google's text indefinitely on a device set forward.
  if (age < 0) return false;

  return age < COORDINATE_MAX_AGE_DAYS * 86_400_000;
}

export interface StopTextInputs {
  readonly stop: Stop;
  /** The address `/place-details` returned this session, when it did. */
  readonly resolvedAddress: string | null;
  readonly now: Date;
}

export function stopTextOf({ stop, resolvedAddress, now }: StopTextInputs): StopText {
  const cachedAddress = isCoordinateAddressFresh(stop, now)
    ? (stop.coordinate?.formattedAddress ?? null)
    : null;
  const address = cachedAddress ?? resolvedAddress;

  const placeText = isPlaceTextFresh(stop.placeText, now) ? stop.placeText : null;

  // The user's label leads, and whatever Google offers becomes the second line
  // rather than being discarded — a label plus its address is more useful than
  // either alone, and it is the arrangement `StopRow` already draws.
  if (stop.label !== null && stop.label.length > 0) {
    return {
      title: stop.label,
      subtitle: address ?? joinPlaceText(placeText),
      needsRefreshing: false,
    };
  }

  if (address !== null && address.length > 0) {
    return { title: address, subtitle: null, needsRefreshing: false };
  }

  if (placeText !== null && placeText.primaryText.length > 0) {
    return {
      title: placeText.primaryText,
      subtitle: placeText.secondaryText.length > 0 ? placeText.secondaryText : null,
      needsRefreshing: false,
    };
  }

  return { title: NEEDS_REFRESHING, subtitle: null, needsRefreshing: true };
}

/**
 * Whether the stored address may still be shown.
 *
 * `formattedAddress` lives inside the coordinate cache and expires with it — the
 * purge job nulls the whole row together ([`docs/12_DATABASE.md`](../../docs/12_DATABASE.md)),
 * so an address outliving its coordinate on the device would be the one copy
 * nothing clears.
 */
function isCoordinateAddressFresh(stop: Stop, now: Date): boolean {
  const coordinate = stop.coordinate;
  if (coordinate === null) return false;

  const refreshedAt = Date.parse(coordinate.refreshedAt);
  if (Number.isNaN(refreshedAt)) return false;

  const age = now.getTime() - refreshedAt;
  if (age < 0) return false;

  return age < COORDINATE_MAX_AGE_DAYS * 86_400_000;
}

function joinPlaceText(text: PlaceTextCache | null): string | null {
  if (text === null) return null;
  const joined = [text.primaryText, text.secondaryText]
    .filter((part) => part.length > 0)
    .join(', ');
  return joined.length > 0 ? joined : null;
}

/** Capture what autocomplete said, stamped now. The one place the shape is
 *  built, so every creation site agrees on it. */
export function placeTextFrom(
  suggestion: { readonly primaryText: string; readonly secondaryText: string },
  now: Date,
): PlaceTextCache {
  return {
    primaryText: suggestion.primaryText,
    secondaryText: suggestion.secondaryText,
    refreshedAt: now.toISOString(),
  };
}
