import { isCoordinateFresh } from '@/lib/coordinates/staleness';
import type { ResolvedPlace } from '@/lib/route/plan-rows';
import { MAX_STOPS, MIN_STOPS, type RouteShape, type Stop } from '@/types';

/**
 * The draft route — the stops the user is arranging, before and after
 * optimization.
 *
 * This is the user's unsaved work, and it is the one piece of client state that
 * is persisted eagerly and never evicted under memory pressure
 * (docs/24_PERFORMANCE.md). Everything else can be refetched; this cannot.
 *
 * The logic lives here as pure functions so the store above it holds state and
 * decides nothing. A store that both stores and decides has two reasons to
 * change, and its invariants become untestable without mounting it.
 */

export interface DraftRoute {
  readonly routeId: string;
  readonly originPlaceId: string | null;
  readonly originIsCurrentLocation: boolean;
  readonly shape: RouteShape;
  /** In the order the user arranged them. After optimization this is the
   *  optimized order; `entryOrder` on each stop preserves the original. */
  readonly stops: readonly Stop[];
  /**
   * True when the current order came from an optimization.
   *
   * Separate from comparing the order to `entryOrder`, because an optimization
   * that changes nothing is a real and common outcome — the user's order was
   * already the fastest — and it has to be reported as an answer rather than as
   * "no optimization has happened".
   *
   * Cleared by every structural edit, since a hand reorder replaces the
   * optimizer's answer with the user's own.
   */
  readonly isOptimized: boolean;
  /** True when the current order came from a T0 result, so the UI keeps saying
   *  so for as long as that order is on screen (CLAUDE.md §7 rule 6). */
  readonly isDegraded: boolean;
}

export function emptyDraft(routeId: string): DraftRoute {
  return {
    routeId,
    originPlaceId: null,
    originIsCurrentLocation: true,
    shape: 'one-way',
    stops: [],
    isOptimized: false,
    isDegraded: false,
  };
}

/** Why an edit was refused. Each is stated to the user before they hit it, not
 *  as the outcome of trying (docs/08_SCREEN_SPECIFICATIONS.md). */
export type DraftRefusal = 'at-maximum' | 'not-found';

export type DraftResult =
  | { readonly ok: true; readonly draft: DraftRoute }
  | { readonly ok: false; readonly refusal: DraftRefusal };

/** Renumber positions so they stay contiguous from zero after any structural
 *  edit. A gap is invisible until something renders by index and skips a row. */
function renumber(stops: readonly Stop[]): readonly Stop[] {
  // `entryOrder` is deliberately untouched: it is what the current order is
  // measured against, and renumbering it would make every order look original.
  return stops.map((stop, index) => ({ ...stop, position: index }));
}

function nextEntryOrder(stops: readonly Stop[]): number {
  return stops.reduce((highest, stop) => Math.max(highest, stop.entryOrder), -1) + 1;
}

/**
 * Add a stop at the end.
 *
 * A duplicate `place_id` is allowed on purpose: a morning delivery and an
 * afternoon collection at the same address is a real working day, and the
 * schema deliberately carries no unique constraint either
 * (docs/12_DATABASE.md).
 */
export function addStop(draft: DraftRoute, stop: Stop): DraftResult {
  if (draft.stops.length >= MAX_STOPS) {
    return { ok: false, refusal: 'at-maximum' };
  }
  return {
    ok: true,
    draft: {
      ...draft,
      // Entry order is assigned here rather than by the caller: only the draft
      // knows what has been entered before. Derived from the highest so far, not
      // from the length, so removing a stop and adding another cannot produce
      // two stops claiming the same entry position.
      stops: renumber([...draft.stops, { ...stop, entryOrder: nextEntryOrder(draft.stops) }]),
      // The order is no longer the one the optimizer produced, so the result no
      // longer describes this route.
      isOptimized: false,
      isDegraded: false,
    },
  };
}

/**
 * Remove a stop.
 *
 * Returns the removed stop and its index so the caller can offer undo. A
 * destructive action is undoable, not confirmed — a toast with undo beats a
 * dialog (CLAUDE.md §7 rule 7), and undo needs the position back or the stop
 * reappears at the end.
 */
export function removeStop(
  draft: DraftRoute,
  stopId: string,
):
  | {
      readonly ok: true;
      readonly draft: DraftRoute;
      readonly removed: Stop;
      readonly atIndex: number;
    }
  | { readonly ok: false; readonly refusal: DraftRefusal } {
  const atIndex = draft.stops.findIndex((stop) => stop.id === stopId);
  const removed = draft.stops[atIndex];
  if (atIndex === -1 || removed === undefined) {
    return { ok: false, refusal: 'not-found' };
  }

  const stops = draft.stops.filter((stop) => stop.id !== stopId);
  return {
    ok: true,
    draft: { ...draft, stops: renumber(stops), isOptimized: false, isDegraded: false },
    removed,
    atIndex,
  };
}

/**
 * Write freshly resolved coordinates into the stops that were missing them.
 *
 * **This is the line whose absence made three separate defects.** Every stop the
 * app creates is born with `coordinate: null` and nothing ever wrote one back,
 * so a stop's address and its marker both depended on a live `/place-details`
 * round trip, every single time. Three consequences, all reported from the
 * device:
 *
 * - A row whose lookup had not landed — or had failed once — read "Address needs
 *   refreshing" for ever, with no way to refresh it.
 * - The places query is keyed on the *set* of place ids, so adding or removing
 *   one stop made it a query nobody had run: every coordinate went null at once
 *   and every marker vanished until the new batch arrived. With no signal they
 *   never came back.
 * - The same coordinates were re-bought on every cold start, which is an
 *   allowance spent on data we already had (`docs/31_COST_MODEL.md`).
 *
 * The thirty-day rule is unaffected and is what makes this safe:
 * `refreshedAt` is stamped now, `isCoordinateFresh` expires it on day 31, and
 * the purge job clears it server-side
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * Caching a coordinate for up to thirty days is exactly what the terms permit;
 * refusing to cache it at all was not caution, it was a defect.
 *
 * A stop whose coordinate is still fresh is left alone — including its
 * `refreshedAt`, so re-resolving a neighbour cannot silently extend somebody
 * else's window.
 *
 * Returns the same draft when nothing changed, so a store `set` can be skipped
 * and a render avoided.
 */
export function applyResolvedCoordinates(
  draft: DraftRoute,
  resolved: ReadonlyMap<string, ResolvedPlace>,
  now: Date,
): DraftRoute {
  if (resolved.size === 0) return draft;

  let changed = false;
  const refreshedAt = now.toISOString();

  const stops = draft.stops.map((stop) => {
    if (isCoordinateFresh(stop.coordinate, now)) return stop;

    const place = resolved.get(stop.placeId);
    if (place === undefined) return stop;

    changed = true;
    return {
      ...stop,
      coordinate: {
        latitude: place.coordinate.latitude,
        longitude: place.coordinate.longitude,
        formattedAddress: place.address,
        refreshedAt,
      },
    };
  });

  return changed ? { ...draft, stops } : draft;
}

/** Put a removed stop back where it was. */
export function restoreStop(draft: DraftRoute, stop: Stop, atIndex: number): DraftRoute {
  const bounded = Math.max(0, Math.min(atIndex, draft.stops.length));
  const stops = [...draft.stops];
  stops.splice(bounded, 0, stop);
  return { ...draft, stops: renumber(stops) };
}

/**
 * Move a stop to a new position.
 *
 * Out-of-range indices are clamped rather than refused: a drag gesture that ends
 * past the end of the list means "put it last", and refusing would drop the stop
 * back where it started, which reads as the gesture having failed.
 */
export function moveStop(draft: DraftRoute, fromIndex: number, toIndex: number): DraftResult {
  const moved = draft.stops[fromIndex];
  if (moved === undefined) return { ok: false, refusal: 'not-found' };

  const stops = [...draft.stops];
  stops.splice(fromIndex, 1);
  stops.splice(Math.max(0, Math.min(toIndex, stops.length)), 0, moved);

  return {
    ok: true,
    // A hand reorder replaces the optimizer's order, so both flags go with it —
    // they described an order that no longer exists.
    draft: { ...draft, stops: renumber(stops), isOptimized: false, isDegraded: false },
  };
}

/** Relabel a stop. User content: durable, never purged (ADR-0007). */
export function labelStop(draft: DraftRoute, stopId: string, label: string | null): DraftResult {
  if (!draft.stops.some((stop) => stop.id === stopId)) {
    return { ok: false, refusal: 'not-found' };
  }
  return {
    ok: true,
    draft: {
      ...draft,
      // Relabelling does not change the order, so the optimization still holds.
      stops: draft.stops.map((stop) => (stop.id === stopId ? { ...stop, label } : stop)),
    },
  };
}

/**
 * Apply an optimization result.
 *
 * The result arrives as an order of ids; the stops themselves are unchanged. An
 * id the draft does not contain is ignored rather than fabricated, and any stop
 * the result omits is appended — losing a stop because the server returned a
 * short list would be silent data loss.
 */
export function applyOptimizedOrder(
  draft: DraftRoute,
  orderedStopIds: readonly string[],
  isDegraded: boolean,
): DraftRoute {
  const byId = new Map(draft.stops.map((stop) => [stop.id, stop]));
  const ordered: Stop[] = [];

  for (const id of orderedStopIds) {
    const stop = byId.get(id);
    if (stop !== undefined) {
      ordered.push(stop);
      byId.delete(id);
    }
  }
  // Whatever the result did not mention keeps its relative order at the end.
  ordered.push(...byId.values());

  return { ...draft, stops: renumber(ordered), isOptimized: true, isDegraded };
}

/** Toggling round trip invalidates any cached result: the optimal order genuinely
 *  differs between the two (docs/15_ROUTE_OPTIMIZATION.md). */
export function setShape(draft: DraftRoute, shape: RouteShape): DraftRoute {
  if (shape === draft.shape) return draft;
  return { ...draft, shape, isOptimized: false, isDegraded: false };
}

export type DraftReadiness =
  | { readonly canOptimize: true }
  | { readonly canOptimize: false; readonly reason: 'too-few-stops' | 'too-many-stops' };

/** Whether the draft can be optimized, and why not when it cannot. The screen
 *  states the limit in advance rather than on the failed attempt. */
export function readiness(draft: DraftRoute): DraftReadiness {
  if (draft.stops.length < MIN_STOPS) {
    return { canOptimize: false, reason: 'too-few-stops' };
  }
  if (draft.stops.length > MAX_STOPS) {
    return { canOptimize: false, reason: 'too-many-stops' };
  }
  return { canOptimize: true };
}

/** How many more stops fit. Shown as the limit approaches, not once it is hit. */
export function remainingCapacity(draft: DraftRoute): number {
  return Math.max(0, MAX_STOPS - draft.stops.length);
}

/**
 * Whether the optimizer looked at this order and left it alone.
 *
 * Only meaningful once `isOptimized` is true. It is a *result*, not the absence
 * of one — "Already the fastest order" is the answer the user paid for, and
 * showing nothing instead would read as the optimization having failed
 * (docs/08_SCREEN_SPECIFICATIONS.md §7).
 */
export function wasAlreadyOptimal(draft: DraftRoute): boolean {
  if (!draft.isOptimized) return false;
  return draft.stops.every((stop, index) => {
    const asEntered = [...draft.stops].sort((a, b) => a.entryOrder - b.entryOrder)[index];
    return asEntered?.id === stop.id;
  });
}
