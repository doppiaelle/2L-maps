import {
  FREE_AUTOCOMPLETE_SESSIONS_PER_MONTH,
  FREE_MAX_STOPS,
  FREE_OPTIMIZATIONS_PER_MONTH,
  FREE_SAVED_ROUTES,
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
    savedRoutes: FREE_SAVED_ROUTES,
    showsAds: true,
  },
  'day-pass': {
    plan: 'day-pass',
    maxStopsPerRoute: MAX_STOPS,
    optimizationsPerPeriod: 25,
    autocompleteSessionsPerPeriod: 40,
    savedRoutes: Number.POSITIVE_INFINITY,
    showsAds: false,
  },
  pro: {
    plan: 'pro',
    maxStopsPerRoute: MAX_STOPS,
    optimizationsPerPeriod: 300,
    autocompleteSessionsPerPeriod: 1_200,
    savedRoutes: Number.POSITIVE_INFINITY,
    showsAds: false,
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
  readonly savedRoutes?: number;
}

/**
 * Merge what the server said over the local fallback, field by field.
 *
 * Partial merge rather than all-or-nothing: the server tunes the free tier's
 * allowances against realised ad revenue (ADR-0015), and it should be able to
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
    savedRoutes: pick(server.savedRoutes, base.savedRoutes),
    // Never server-driven. Ads follow the plan, and a response that could turn
    // them on for a subscriber would make a paid feature revocable by a field
    // in a JSON body.
    showsAds: base.showsAds,
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
  | { readonly kind: 'degraded-only'; readonly canUnlockWithAd: boolean }
  /** Allowance spent and the route is too long for T0 to be worth offering.
   *  This is the one state where a free user genuinely cannot proceed. */
  | { readonly kind: 'blocked'; readonly canUnlockWithAd: boolean }
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
  const canUnlockWithAd = allowances.showsAds;
  return stopCount <= MAX_STOPS_T0
    ? { kind: 'degraded-only', canUnlockWithAd }
    : { kind: 'blocked', canUnlockWithAd };
}

/**
 * Whether a rewarded ad should be offered to buy one more optimization.
 *
 * Only on a plan that shows ads. Offering a subscriber the chance to watch an
 * advert for something they already paid for is the kind of detail that reads
 * as contempt.
 */
export function canOfferRewardedUnlock(allowances: PlanAllowances, usage: PlanUsage): boolean {
  return allowances.showsAds && usage.optimizations >= allowances.optimizationsPerPeriod;
}

/** How an offered rewarded ad ended. */
export type RewardedAdResult = 'watched' | 'dismissed' | 'unavailable';

/**
 * Whether the unlock is granted.
 *
 * `unavailable` grants it. No fill, no network, SDK error — none of that is the
 * user's doing, and charging them for our fill rate is indefensible
 * (ADR-0015 rule 6). `dismissed` is a choice, and does not.
 */
export function grantsRewardedUnlock(result: RewardedAdResult): boolean {
  return result !== 'dismissed';
}
