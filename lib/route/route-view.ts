/**
 * The Route section shows one of two things, and this decides which.
 *
 * **The map stopped being a place and became a moment**
 * ([ADR-0022](../../docs/adr/0022-one-route-section.md)). It used to be a dock
 * section of its own, mounted for ever behind everything, showing an empty
 * rectangle of somebody else's country until a route existed. Now there is one
 * Route section, it opens on the list, and the drawn map replaces the list at
 * the moment there is a route worth looking at — which is the moment the user
 * pressed Optimize and asked for exactly that.
 *
 * The rules live here rather than in the screen because two of them are easy to
 * get subtly wrong in a way nothing would catch: a map that outlives the result
 * it was drawn from, and a discard that takes the work with it.
 */

export type RouteView = 'list' | 'map';

/**
 * What just happened.
 *
 * Named for the user's action rather than for the state change it causes, so a
 * reader can tell whether a case is missing by asking "can the user do that?"
 * rather than by reading the return values.
 */
export type RouteViewEvent =
  /** An optimization landed. The only thing that opens the map. */
  | { readonly kind: 'result-arrived' }
  /** The X on the map. Leaves the result behind, keeps the stops. */
  | { readonly kind: 'dismissed' }
  /** A stop added, removed, reordered, or the whole route cleared. */
  | { readonly kind: 'edited' }
  /** The section was opened from the dock. */
  | { readonly kind: 'section-opened' };

export interface RouteViewInputs {
  readonly current: RouteView;
  /** Whether a result exists to draw. The map cannot be shown without one —
   *  there would be nothing on it. */
  readonly hasResult: boolean;
}

export function routeViewAfter(event: RouteViewEvent, inputs: RouteViewInputs): RouteView {
  switch (event.kind) {
    case 'result-arrived':
      // The answer to the question the user just asked, shown without a second
      // tap. This is the product's moment of truth
      // ([ADR-0005](../../docs/adr/0005-map-engine-and-route-preview.md)): the
      // order they are being asked to trust, laid out so they can see it.
      return 'map';

    case 'dismissed':
      // **The stops survive.** "Back to the list" with an empty list would not
      // be back to anything — the user is leaving a result, not abandoning an
      // afternoon of typing. What the screen clears alongside this is the
      // result, not the draft.
      return 'list';

    case 'edited':
      // A result describes a set of stops. Change the set and it describes
      // something that no longer exists, so it cannot stay on screen: a map of
      // yesterday's route is worse than no map, because it looks current.
      return 'list';

    case 'section-opened':
      // Returning to a result the user has not dismissed shows it again. They
      // went to Settings and came back; nothing about the route changed, and
      // making them press Optimize a second time would spend an allowance to
      // rebuild an answer we still hold.
      return inputs.hasResult ? inputs.current : 'list';

    default:
      return inputs.current;
  }
}

/**
 * Whether the map may be shown at all.
 *
 * A guard rather than a rule: `routeViewAfter` decides intent, and this is the
 * floor underneath it. A view of `'map'` with no result would render an empty
 * canvas, which is the one state the drawn map has no honest way to fill — it
 * has no tiles to fall back to.
 */
export function showsMap(view: RouteView, hasResult: boolean): boolean {
  return view === 'map' && hasResult;
}
