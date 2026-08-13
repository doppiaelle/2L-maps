import type { RouteShape } from '@/types';

export type RouteStartPreference = 'first-stop' | 'current-location';
export type RouteEndPreference = 'last-stop' | 'return-to-start' | 'current-location';

/** The compact controls shown beside a route before optimization. */
export interface RouteEndpointChoice {
  readonly start: RouteStartPreference;
  readonly end: RouteEndPreference;
}

/**
 * Keep the two choices representable by the existing optimization contract.
 *
 * “Return to my location” is a closed loop around the live device position, so
 * choosing it also selects that position as the start. If the user then changes
 * the start back to the first stop, the end follows to “return to start”. This
 * makes every label correspond to the geometry actually sent to the backend.
 */
export function normalizeEndpointChoice(
  choice: RouteEndpointChoice,
  changed: 'start' | 'end',
): RouteEndpointChoice {
  if (changed === 'end' && choice.end === 'current-location') {
    return { start: 'current-location', end: 'current-location' };
  }

  if (changed === 'start' && choice.start === 'first-stop' && choice.end === 'current-location') {
    return { start: 'first-stop', end: 'return-to-start' };
  }

  return choice;
}

/** Round trips share their origin and destination; one-way routes finish at the
 * last entered stop, which the backend keeps fixed while optimizing. */
export function shapeForRouteEnd(end: RouteEndPreference): RouteShape {
  return end === 'last-stop' ? 'one-way' : 'round-trip';
}

export function startLabel(start: RouteStartPreference): string {
  return start === 'current-location' ? 'My location' : 'First stop';
}

export function endLabel(end: RouteEndPreference): string {
  switch (end) {
    case 'return-to-start':
      return 'Starting point';
    case 'current-location':
      return 'My location';
    default:
      return 'Last stop';
  }
}

/** How many stops the backend is free to reorder for the selected geometry. */
export function reorderableCount(inputs: {
  readonly stopCount: number;
  readonly start: RouteStartPreference;
  readonly end: RouteEndPreference;
}): number {
  const afterOrigin = inputs.start === 'first-stop' ? inputs.stopCount - 1 : inputs.stopCount;
  const movable = inputs.end === 'last-stop' ? afterOrigin - 1 : afterOrigin;
  return Math.max(0, movable);
}

/**
 * Put the user-defined fixed endpoints where the optimizer contract expects
 * them. The backend keeps the first supplied stop fixed when there is no device
 * origin, and the last supplied stop fixed for a one-way route. Entry order is
 * the durable meaning of “first/last stop”; a previous optimization must not
 * silently change those choices on a later attempt.
 */
export function stopsForEndpointChoice<T extends { readonly entryOrder: number }>(
  stops: readonly T[],
  choice: RouteEndpointChoice,
): readonly T[] {
  if (stops.length < 2) return stops;

  const ordered = [...stops];

  if (choice.start === 'first-stop') {
    const firstEntered = ordered.reduce((first, stop) =>
      stop.entryOrder < first.entryOrder ? stop : first,
    );
    ordered.splice(ordered.indexOf(firstEntered), 1);
    ordered.unshift(firstEntered);
  }

  if (choice.end === 'last-stop') {
    const lastEntered = ordered.reduce((last, stop) =>
      stop.entryOrder > last.entryOrder ? stop : last,
    );
    ordered.splice(ordered.indexOf(lastEntered), 1);
    ordered.push(lastEntered);
  }

  return ordered;
}
