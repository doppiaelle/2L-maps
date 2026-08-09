/**
 * The bottom sheet's detents, decided as arithmetic rather than inside a
 * gesture handler.
 *
 * The stop list is a bottom sheet at every size, never a sidebar
 * ([ADR-0010](../../docs/adr/0010-mobile-only-scope.md)), and it has three
 * detents ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 *
 * Snapping lives here because it is the part that is wrong in most sheets and
 * invisible in review: a sheet that only snaps to the nearest detent ignores a
 * deliberate flick, and one that only follows velocity jumps two detents from a
 * nudge. Both feel broken in a way nobody can describe afterwards. As a pure
 * function the behaviour is stated once and tested at its boundaries.
 */

/** Named as the product names them, not as the library does. */
export type SheetDetent = 'collapsed' | 'half' | 'expanded';

/** Enough for the metrics and the primary action, and nothing else
 *  (docs/08 §7). Fixed rather than proportional: it holds a known amount of
 *  content, and on a tall phone a percentage would leave it half empty. */
export const PEEK_HEIGHT = 180;

export const HALF_FRACTION = 0.5;

/** Not 1. The map stays visible above the sheet at every detent — the user is
 *  meant to keep their place, and a sheet that covers everything is a screen. */
export const FULL_FRACTION = 0.9;

/**
 * Above this, a gesture is read as a flick and carries the sheet one detent in
 * its direction regardless of where it was released.
 *
 * Points per second. Chosen so a deliberate flick always wins and a slow drag
 * never does; the two failure modes it sits between are a sheet that ignores
 * intent and one that overshoots from a nudge.
 */
export const FLICK_VELOCITY = 600;

const ORDER: readonly SheetDetent[] = ['collapsed', 'half', 'expanded'];

export function detentHeight(detent: SheetDetent, screenHeight: number): number {
  switch (detent) {
    case 'collapsed':
      // Never taller than the screen: on a very small device, or at 200%
      // Dynamic Type in landscape, the peek height alone can exceed it.
      return Math.min(PEEK_HEIGHT, screenHeight);
    case 'half':
      return screenHeight * HALF_FRACTION;
    case 'expanded':
      return screenHeight * FULL_FRACTION;
  }
}

/**
 * How much of the screen the sheet covers, which is what the map needs in order
 * to fit a route above it rather than behind it.
 *
 * Derived from the same heights the sheet is drawn at, so the camera padding
 * cannot drift from the thing it is padding for.
 */
export function detentFraction(detent: SheetDetent, screenHeight: number): number {
  if (screenHeight <= 0) return 0;
  return detentHeight(detent, screenHeight) / screenHeight;
}

/**
 * Where a released drag settles.
 *
 * `height` is the sheet's height at the moment of release, and `velocity` is in
 * points per second, **positive when the sheet is growing** — that is, when the
 * user is dragging upwards. Stating the sign here rather than at the call site
 * is deliberate: inverting it is the classic bug, and it produces a sheet that
 * closes when flicked open.
 */
export function resolveDetent(
  height: number,
  velocity: number,
  screenHeight: number,
  from: SheetDetent,
): SheetDetent {
  const index = ORDER.indexOf(from);

  // A flick moves exactly one detent. Two would mean a nudge could take the
  // user from peek to full, past the detent they were reaching for.
  if (velocity >= FLICK_VELOCITY) return ORDER[Math.min(index + 1, ORDER.length - 1)] ?? from;
  if (velocity <= -FLICK_VELOCITY) return ORDER[Math.max(index - 1, 0)] ?? from;

  return nearestDetent(height, screenHeight);
}

export function nearestDetent(height: number, screenHeight: number): SheetDetent {
  let best: SheetDetent = 'collapsed';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const detent of ORDER) {
    const distance = Math.abs(detentHeight(detent, screenHeight) - height);
    // Strictly less than, so ties resolve to the *lower* detent: at an exact
    // midpoint the user has not committed, and revealing less is the recoverable
    // mistake — the map stays visible and one more drag opens it.
    if (distance < bestDistance) {
      best = detent;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Whether the stop list is worth rendering at this detent.
 *
 * At peek the sheet shows metrics and the primary action only, so mounting a
 * virtualised list behind them costs frames during the one transition this
 * product is judged on (docs/24_PERFORMANCE.md).
 */
export function showsStopList(detent: SheetDetent): boolean {
  return detent !== 'collapsed';
}

/** Per-stop actions and reorder handles appear only at full height, where there
 *  is room for them without crowding the row's address (docs/08 §7). */
export function showsRowActions(detent: SheetDetent): boolean {
  return detent === 'expanded';
}
