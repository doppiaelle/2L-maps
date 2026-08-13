import {
  FREE_AUTOCOMPLETE_SESSIONS_PER_MONTH,
  FREE_MAX_STOPS,
  FREE_OPTIMIZATIONS_PER_MONTH,
  MAX_STOPS,
  MAX_STOPS_T0,
} from '@/types';
import type { PlanAllowances, PlanTier, PlanUsage } from '@/types';

/**
 * What each rung of the ladder may do, and what happens when it runs out.
 *
 * This module is the whole of the plan logic and it is pure. Every screen that
 * needs to know "can this user add another stop" or "what happens if they tap
 * Optimize now" asks here, so the answer cannot drift between the stop list and
 * the result screen (CLAUDE.md §1: components render, `lib/` decides).
 *
 * **None of this decides access.** The server does that
 * ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md)); these
 * functions decide what the interface *shows*. When the two disagree — after an
 * offline period, a refund, a plan change on another device — the server is
 * right and the client re-renders. Treating this file as the gate would put the
 * paywall on the one machine the user controls.
 */

const FALLBACKS: Readonly<Record<PlanTier, PlanAllowances>> = {
  free: {
    plan: 'free',
    maxStopsPerRoute: FREE_MAX_STOPS,
    optimizationsPerPeriod: FREE_OPTIMIZATIONS_PER_MONTH,
    autocompleteSessionsPerPeriod: FREE_AUTOCOMPLETE_SESSIONS_PER_MONTH,
  },
  'day-pass': {
    plan: 'day-pass',
    maxStopsPerRoute: MAX_STOPS,
    optimizationsPerPeriod: 25,
    autocompleteSessionsPerPeriod: 40,
  },
  pro: {
    plan: 'pro',
    maxStopsPerRoute: MAX_STOPS,
    optimizationsPerPeriod: 300,
    autocompleteSessionsPerPeriod: 1_200,
  },
};

/**
 * The allowances to display before the server has spoken.
 *
 * Named `fallback` rather than `allowancesFor` on purpose: the name is the
 * warning. Anything that reads this without having tried `resolveAllowances`
 * first is showing a guess.
 */
export function fallbackAllowances(plan: PlanTier): PlanAllowances {
  return FALLBACKS[plan];
}

/** Server limits as they arrive on `/usage-quota`, all optional. */
export interface ServerLimits {
  readonly maxStopsPerRoute?: number;
  readonly optimizationsPerPeriod?: number;
  readonly autocompleteSessionsPerPeriod?: number;
}

/**
 * Merge what the server said over the local fallback, field by field.
 *
 * Partial merge rather than all-or-nothing: the server tunes the free tier's
 * allowances against its measured acquisition budget (ADR-0029), and it should be able to
 * move one number without having to restate the rest.
 */
export function resolveAllowances(plan: PlanTier, server: ServerLimits | null): PlanAllowances {
  const base = FALLBACKS[plan];
  if (server === null) return base;

  return {
    plan,
    maxStopsPerRoute: pick(server.maxStopsPerRoute, base.maxStopsPerRoute),
    optimizationsPerPeriod: pick(server.optimizationsPerPeriod, base.optimizationsPerPeriod),
    autocompleteSessionsPerPeriod: pick(
      server.autocompleteSessionsPerPeriod,
      base.autocompleteSessionsPerPeriod,
    ),
  };
}

/** A negative or non-finite limit is a malformed response, not a tighter cap. */
function pick(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

/**
 * What tapping Optimize will actually do, right now.
 *
 * Computed as one value rather than a set of booleans because the states are
 * mutually exclusive and the screen has to pick exactly one thing to say. Three
 * booleans invite a fourth combination that means nothing.
 */
export type OptimizeAvailability =
  | { readonly kind: 'allowed'; readonly remaining: number }
  /** Allowance spent, but the route is small enough that the local solver still
   *  gives an honest answer. Degraded, labelled, and free. */
  | { readonly kind: 'degraded-only' }
  /** Allowance spent and the route is too long for T0 to be worth offering.
   *  This is the one state where a free user genuinely cannot proceed. */
  | { readonly kind: 'blocked' }
  | { readonly kind: 'too-few-stops' }
  | { readonly kind: 'too-many-stops'; readonly limit: number };

export function optimizeAvailability(
  allowances: PlanAllowances,
  usage: PlanUsage,
  stopCount: number,
): OptimizeAvailability {
  if (stopCount < 2) return { kind: 'too-few-stops' };
  if (stopCount > allowances.maxStopsPerRoute) {
    return { kind: 'too-many-stops', limit: allowances.maxStopsPerRoute };
  }

  const remaining = allowances.optimizationsPerPeriod - usage.optimizations;
  if (remaining > 0) return { kind: 'allowed', remaining };

  // Out of allowance. What happens next is decided by the local solver's own
  // ceiling, not by the plan: above MAX_STOPS_T0 a straight-line order can be
  // worse than the order the user typed, so offering it would be dishonest
  // rather than generous (ADR-0003).
  return stopCount <= MAX_STOPS_T0 ? { kind: 'degraded-only' } : { kind: 'blocked' };
}
