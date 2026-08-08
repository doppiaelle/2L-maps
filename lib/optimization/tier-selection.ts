import { MAX_STOPS_T0, MAX_STOPS_T1, MIN_STOPS, type Tier } from '@/types';

/**
 * Which engine serves an optimization.
 *
 * This decision runs on the server and is never exposed in the response contract
 * (ADR-0003, docs/13_BACKEND.md): the client shows a wait and a result, and if it
 * knew which engine ran, changing engines would become a client release.
 *
 * The two boundaries encode different kinds of limit, and conflating them is the
 * mistake this module exists to prevent:
 *
 *   - **8 is a quality ceiling.** T0 orders stops by straight-line distance. At 8
 *     stops the result is usually defensible; at 20 it is often embarrassing. The
 *     limit is about being honest, not about speed.
 *   - **25 is a hard API limit.** `optimizeWaypointOrder` accepts at most 25
 *     intermediate waypoints. Crossing it silently would truncate the route.
 *
 * Crossing 25 also crosses a cost cliff: T1 bills per request, T2 bills per stop,
 * so a 26-stop route costs roughly twenty-five times a 25-stop one
 * (docs/31_COST_MODEL.md). That is a reason to report the escalation, never a
 * reason to hide it.
 */

/** What the caller knows when the tier must be chosen. */
export interface TierInput {
  readonly stopCount: number;
  /** False when offline, or when every upstream attempt has failed. */
  readonly isUpstreamAvailable: boolean;
  /** Time windows, priorities, capacities, multiple vehicles. All post-MVP, and
   *  any one of them forces T2 regardless of stop count. */
  readonly hasConstraints: boolean;
}

export type TierDecision =
  | { readonly kind: 'selected'; readonly tier: Tier; readonly isDegraded: boolean }
  | { readonly kind: 'unavailable'; readonly reason: TierUnavailableReason };

/**
 * Why no tier can serve a request.
 *
 * A discriminated reason rather than a thrown error: every one of these has a
 * distinct user-visible outcome and a distinct next action (CLAUDE.md §0 rule 5),
 * and an exception would collapse them into one message.
 */
export type TierUnavailableReason =
  /** Fewer than two stops is not a route. */
  | 'too-few-stops'
  /** Offline with more stops than the local heuristic may honestly order. */
  | 'offline-above-local-limit'
  /** Offline and the request needs constraint solving, which is server-only. */
  | 'offline-with-constraints';

export function selectTier(input: TierInput): TierDecision {
  const { stopCount, isUpstreamAvailable, hasConstraints } = input;

  if (stopCount < MIN_STOPS) {
    return { kind: 'unavailable', reason: 'too-few-stops' };
  }

  if (!isUpstreamAvailable) {
    if (hasConstraints) {
      return { kind: 'unavailable', reason: 'offline-with-constraints' };
    }
    if (stopCount > MAX_STOPS_T0) {
      return { kind: 'unavailable', reason: 'offline-above-local-limit' };
    }
    // T0 is always degraded, and the UI says so. Presenting it as equivalent to
    // T1 would be dishonest — the user is making driving decisions on it.
    return { kind: 'selected', tier: 'T0', isDegraded: true };
  }

  if (hasConstraints || stopCount > MAX_STOPS_T1) {
    return { kind: 'selected', tier: 'T2', isDegraded: false };
  }

  return { kind: 'selected', tier: 'T1', isDegraded: false };
}

/**
 * Whether a degraded local result can be offered as a fallback after an upstream
 * failure.
 *
 * Separate from `selectTier` because it answers a different question at a
 * different moment: not "which engine should run" but "we tried and failed —
 * is there anything honest left to offer this user".
 */
export function canOfferLocalFallback(stopCount: number, hasConstraints: boolean): boolean {
  return stopCount >= MIN_STOPS && stopCount <= MAX_STOPS_T0 && !hasConstraints;
}

/**
 * Whether crossing into T2 should be surfaced to the user before it happens.
 *
 * T2 bills per stop where T1 bills per request. The escalation is automatic and
 * the engine stays invisible, but the consequence — a longer wait, and quota
 * consumed far faster — is not something to discover afterwards.
 */
export function isCostEscalation(previousStopCount: number, nextStopCount: number): boolean {
  return previousStopCount <= MAX_STOPS_T1 && nextStopCount > MAX_STOPS_T1;
}
