/**
 * Conflict resolution for the offline mutation queue.
 *
 * The table in docs/11_STATE_MANAGEMENT.md §8 has one asymmetry that is the
 * whole design: **only a reorder-versus-reorder collision is surfaced to the
 * user.** Everything else resolves deterministically.
 *
 * That is a judgement about what a person can usefully answer. "Both devices
 * changed this label — which one?" is a question the system can settle by
 * timestamp and the user gains nothing by being asked. "Both devices reordered
 * the route" cannot be settled that way: the two orders are each coherent, the
 * difference is the user's own intent, and picking one silently discards work
 * they did deliberately.
 *
 * A dialog for a case the system can decide is noise, and noise trains people to
 * dismiss the dialog that matters.
 */

/** What a queued mutation does. Reorder is separated because it alone conflicts. */
export type MutationKind =
  | 'create-route'
  | 'update-route-fields'
  | 'delete-route'
  | 'reorder-stops'
  | 'add-stop'
  | 'remove-stop'
  | 'update-stop-fields'
  | 'mark-stop-state';

export interface QueuedMutation {
  /** Client-generated, so a row created offline keeps its identity through sync
   *  and references to it never break. */
  readonly id: string;
  readonly kind: MutationKind;
  readonly routeId: string;
  /** Which fields this mutation touches. Empty for kinds where the notion does
   *  not apply, such as a delete. */
  readonly fields: readonly string[];
  /** Client clock at the moment the user acted. */
  readonly occurredAt: string;
  /** Replaying a drain interrupted by another network loss must not duplicate
   *  server-side effects (docs/33_API_CONTRACTS.md). */
  readonly idempotencyKey: string;
}

export type Resolution =
  /** Apply the local mutation; it wins or does not collide. */
  | { readonly kind: 'apply-local' }
  /** Drop the local mutation; the remote already covers or supersedes it. */
  | { readonly kind: 'discard-local'; readonly reason: DiscardReason }
  /** Both are legitimate and the difference is the user's intent. Ask. */
  | { readonly kind: 'ask-user'; readonly conflict: 'reorder' };

export type DiscardReason =
  /** The route was deleted remotely; an edit to a deleted route is meaningless. */
  | 'route-deleted'
  /** The same field was changed remotely, more recently. */
  | 'superseded-by-newer';

/**
 * Resolve one local mutation against the remote mutations that landed while we
 * were offline.
 *
 * The order of checks matters. Deletion is evaluated first because an edit to a
 * deleted route cannot be applied at all — asking the user to choose an ordering
 * for a route that no longer exists would be absurd.
 */
export function resolve(local: QueuedMutation, remote: readonly QueuedMutation[]): Resolution {
  const sameRoute = remote.filter((m) => m.routeId === local.routeId);

  // Delete beats edit. The edit is discarded with a notice rather than silently:
  // the user did work that is not going to survive, and they should know.
  const deleted = sameRoute.some((m) => m.kind === 'delete-route');
  if (deleted && local.kind !== 'delete-route') {
    return { kind: 'discard-local', reason: 'route-deleted' };
  }

  // Two devices creating routes is not a conflict — they are different routes.
  if (local.kind === 'create-route') {
    return { kind: 'apply-local' };
  }

  // The one genuine conflict. Both orders are coherent; the difference is intent.
  if (local.kind === 'reorder-stops') {
    const remoteReorder = sameRoute.some((m) => m.kind === 'reorder-stops');
    return remoteReorder ? { kind: 'ask-user', conflict: 'reorder' } : { kind: 'apply-local' };
  }

  // Last-write-wins, per field. Two devices editing different fields of the same
  // route is not a collision, and treating it as one would surface a conflict
  // where none exists.
  const collidingFields = sameRoute.filter(
    (m) => m.fields.some((field) => local.fields.includes(field)) && isNewer(m, local),
  );

  return collidingFields.length > 0
    ? { kind: 'discard-local', reason: 'superseded-by-newer' }
    : { kind: 'apply-local' };
}

/**
 * Whether `a` happened after `b`.
 *
 * Ties resolve to *not* newer, so a local mutation survives a remote one with an
 * identical timestamp. Two clocks agreeing to the millisecond means they were not
 * really compared, and in that case keeping the user's own work is the better
 * failure — they can see and undo a change that stayed, but cannot recover one
 * that vanished.
 */
function isNewer(a: QueuedMutation, b: QueuedMutation): boolean {
  const at = Date.parse(a.occurredAt);
  const bt = Date.parse(b.occurredAt);
  if (Number.isNaN(at)) return false;
  if (Number.isNaN(bt)) return true;
  return at > bt;
}

/**
 * Resolve a whole queue, preserving order.
 *
 * The queue drains in the order the user acted, because a later edit may depend
 * on an earlier one — removing a stop that a previous mutation added, for
 * instance. Reordering the drain to batch by type would break that.
 */
export function resolveQueue(
  queue: readonly QueuedMutation[],
  remote: readonly QueuedMutation[],
): readonly { readonly mutation: QueuedMutation; readonly resolution: Resolution }[] {
  return queue.map((mutation) => ({ mutation, resolution: resolve(mutation, remote) }));
}

/**
 * Collapse mutations that the server never needs to see separately.
 *
 * Five relabellings of one stop while offline are five queue entries and one
 * server-visible outcome. Draining all five wastes requests and, on a metered
 * endpoint, would waste money — so the last write per (kind, route, field set)
 * survives.
 *
 * Deliberately not applied to `mark-stop-state`: completing then skipping a stop
 * is not the same as skipping it, and the intermediate state has already been
 * shown to the user.
 */
export function collapse(queue: readonly QueuedMutation[]): readonly QueuedMutation[] {
  const COLLAPSIBLE: ReadonlySet<MutationKind> = new Set([
    'update-route-fields',
    'update-stop-fields',
  ]);

  const lastIndexByKey = new Map<string, number>();
  queue.forEach((mutation, index) => {
    if (!COLLAPSIBLE.has(mutation.kind)) return;
    lastIndexByKey.set(keyOf(mutation), index);
  });

  return queue.filter((mutation, index) => {
    if (!COLLAPSIBLE.has(mutation.kind)) return true;
    return lastIndexByKey.get(keyOf(mutation)) === index;
  });
}

function keyOf(mutation: QueuedMutation): string {
  return `${mutation.kind}|${mutation.routeId}|${[...mutation.fields].sort().join(',')}`;
}
