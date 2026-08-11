import type { RouteShape } from '@/types';

/**
 * Where the round starts, and where it finishes.
 *
 * **Both ends were invisible, and one of them was being decided by accident.**
 *
 * The origin has been a field on the draft since the first commit —
 * `originPlaceId` and `originIsCurrentLocation` — and **no screen has ever drawn
 * it**. "My location" in the search wrote it and closed the modal, so from the
 * driver's side nothing happened at all: the thing they picked did not appear
 * anywhere.
 *
 * The end was worse, because it looked like it worked. `setRouteShape` existed
 * and had no caller, so `shape` was always `'one-way'` — and a one-way route
 * pins its **last typed stop** as the destination and does not reorder it
 * (`supabase/functions/_shared/endpoints/optimize.ts`). A driver who typed Rome,
 * Abruzzo, Milan, Bari got Bari fixed at the end because they wrote it last, and
 * only two of the four stops were ever offered to the optimizer. The comment in
 * the endpoint said "the user chose where they finish". The user had never been
 * asked.
 *
 * So this module answers one question in the product's own words — *where does
 * this round begin and end* — and the answer is a control the driver can see
 * before pressing Optimize, not a dialog in front of it (`CLAUDE.md` §7 rule 8).
 */

/** Which end the route has. Maps onto `RouteShape`, but says it the way the
 *  driver would rather than the way the geometry does. */
export type RouteEnd = 'last-stop' | 'back-to-start';

export interface RouteEndsInputs {
  readonly originPlaceId: string | null;
  readonly originIsCurrentLocation: boolean;
  /** Whatever `useResolvedPlaces` knows about the origin, or null once the
   *  thirty-day purge has taken it (ADR-0007). */
  readonly originAddress: string | null;
  readonly shape: RouteShape;
  /** So the fallback can name the stop the route will actually start from
   *  rather than saying "somewhere". */
  readonly firstStopTitle: string | null;
}

export interface RouteEndOption {
  readonly end: RouteEnd;
  readonly label: string;
  /** Says what happens, never what the control is (`CLAUDE.md` §10 rule 1). */
  readonly accessibilityLabel: string;
  readonly isSelected: boolean;
}

export interface RouteEnds {
  /** `My location`, `Corso Francia 12`, or the first stop's own name. */
  readonly startLabel: string;
  readonly startSpoken: string;
  readonly options: readonly RouteEndOption[];
}

export function routeEndsOf(inputs: RouteEndsInputs): RouteEnds {
  const startLabel = startLabelOf(inputs);
  const isBackToStart = inputs.shape === 'round-trip';

  // Named for the place rather than for the shape. "Round trip" is what the
  // geometry is called; "back to my location" is what the driver is asking for,
  // and on a van round it is usually the whole point.
  const returnLabel = inputs.originIsCurrentLocation
    ? 'Back to my location'
    : `Back to ${startLabel}`;

  return {
    startLabel,
    startSpoken: `Starts at ${startLabel}`,
    options: [
      {
        end: 'last-stop',
        label: 'End at last stop',
        accessibilityLabel: 'Finish at the last stop, wherever the optimizer puts it',
        isSelected: !isBackToStart,
      },
      {
        end: 'back-to-start',
        label: returnLabel,
        accessibilityLabel: `Finish by returning to ${
          inputs.originIsCurrentLocation ? 'your location' : startLabel
        }`,
        isSelected: isBackToStart,
      },
    ],
  };
}

/**
 * The shape to store for an end the driver chose.
 *
 * A translation rather than a decision, and it lives here so that the two
 * vocabularies meet in exactly one place. The screen speaks about ends; the
 * draft, the database and the Routes API all speak about shape.
 */
export function shapeForEnd(end: RouteEnd): RouteShape {
  return end === 'back-to-start' ? 'round-trip' : 'one-way';
}

/**
 * How many of the stops the optimizer is actually allowed to reorder.
 *
 * It computes nothing the request depends on — it is what the control says out
 * loud, because the difference is the whole of the reported problem. It mirrors
 * `optimizeUpstream` exactly, and **two stops come off the top, not one**:
 *
 * - A route with no chosen origin **starts from its first stop**, and that stop
 *   is consumed as the origin rather than offered for reordering.
 * - A route that ends at a stop pins the **last** one as the destination.
 *
 * Rome, Abruzzo, Milan, Bari typed with neither end chosen is therefore two
 * movable stops out of four — which is precisely how a driver ends up looking at
 * an order they did not expect and cannot explain.
 */
export function reorderableCount(inputs: {
  readonly stopCount: number;
  readonly end: RouteEnd;
  /** True when no origin was chosen. The endpoint then starts from stop one,
   *  which is a resort rather than an error — but it costs a movable stop. */
  readonly startsFromFirstStop: boolean;
}): number {
  const routable = inputs.startsFromFirstStop ? inputs.stopCount - 1 : inputs.stopCount;
  const movable = inputs.end === 'back-to-start' ? routable : routable - 1;
  return Math.max(movable, 0);
}

function startLabelOf(inputs: RouteEndsInputs): string {
  if (inputs.originIsCurrentLocation) return 'My location';
  if (inputs.originAddress !== null) return firstLine(inputs.originAddress);
  // An origin place whose address has expired, or one that has not resolved yet.
  // The id is durable and the route still starts there; only the words are gone.
  if (inputs.originPlaceId !== null) return 'Saved starting point';
  // No origin was ever chosen, which is what an empty draft looks like. The
  // route begins at the first stop — and that is what the endpoint does too, so
  // the label states the behaviour rather than describing an absence.
  return inputs.firstStopTitle ?? 'The first stop';
}

/**
 * The street line of a formatted address.
 *
 * The full postal form truncates mid-postcode in a control this size and
 * identifies nothing; the first component is what the driver recognises. Same
 * rule as the History row (`lib/route/history-row.ts`), and it stays duplicated
 * rather than shared for now — two uses is not three (`CLAUDE.md` §12 rule 4).
 */
function firstLine(address: string): string {
  const first = address.split(',')[0]?.trim() ?? '';
  return first === '' ? address : first;
}
