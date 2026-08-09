import type { OptimizeAvailability } from '@/lib/entitlement/plans';
import { MIN_STOPS } from '@/types';

/**
 * What Plan is showing, and what its one control says.
 *
 * Eleven states are specified for this screen
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7),
 * and they are decided here rather than inside the screen for the reason
 * `CLAUDE.md` §1 gives: a component holding an `if` about a domain rule is the
 * rule in the wrong place. Here every combination is reachable in a test, and
 * the ones that only occur to a real user — the allowance running out while a
 * route is half driven, a saved route whose coordinates expired — cost a line
 * each rather than a device and a month.
 *
 * The order of the checks is the product's priority, and it is load-bearing:
 * a route in progress outranks everything, because the user is driving and the
 * screen's job is to tell them where to go next.
 */

export type PlanState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  /** Stops entered, no optimization yet. Metrics are a straight-line estimate
   *  and are labelled as one — never presented as a road distance. */
  | { readonly kind: 'draft'; readonly stopCount: number }
  | { readonly kind: 'optimizing'; readonly stopCount: number }
  | {
      readonly kind: 'optimized';
      readonly stopCount: number;
      readonly isDegraded: boolean;
      /** Stated positively in the header — "Already the fastest order" — rather
       *  than as silence or as an error (docs/08 §7). Reordering nothing is a
       *  correct answer and the user paid for it. */
      readonly wasAlreadyOptimal: boolean;
    }
  | { readonly kind: 'in-progress'; readonly completedCount: number; readonly stopCount: number }
  /** The attempt failed and **the order is untouched**. Saying so is the point:
   *  a failed optimization that also scrambled the list is two problems. */
  | { readonly kind: 'failed'; readonly stopCount: number; readonly canRetry: boolean };

export interface PlanInputs {
  readonly isLoading: boolean;
  readonly stopCount: number;
  readonly completedCount: number;
  readonly isRouteUnderway: boolean;
  readonly isOptimizing: boolean;
  readonly hasResult: boolean;
  readonly isDegraded: boolean;
  readonly wasAlreadyOptimal: boolean;
  readonly lastFailure: 'upstream' | 'offline' | null;
}

export function planStateOf(inputs: PlanInputs): PlanState {
  // A route being driven outranks every other state, including a failure and a
  // loading spinner. The user is in a van; the screen's job is the next stop.
  if (inputs.isRouteUnderway) {
    return {
      kind: 'in-progress',
      completedCount: inputs.completedCount,
      stopCount: inputs.stopCount,
    };
  }

  if (inputs.isLoading) return { kind: 'loading' };
  if (inputs.stopCount === 0) return { kind: 'empty' };
  if (inputs.isOptimizing) return { kind: 'optimizing', stopCount: inputs.stopCount };

  if (inputs.lastFailure !== null) {
    return {
      kind: 'failed',
      stopCount: inputs.stopCount,
      // Offline is worth retrying the moment a signal returns; an upstream
      // failure is too, but the wording differs and the caller needs to know
      // which sentence to show.
      canRetry: true,
    };
  }

  if (inputs.hasResult) {
    return {
      kind: 'optimized',
      stopCount: inputs.stopCount,
      isDegraded: inputs.isDegraded,
      wasAlreadyOptimal: inputs.wasAlreadyOptimal,
    };
  }

  return { kind: 'draft', stopCount: inputs.stopCount };
}

/**
 * What the primary control should say and do.
 *
 * A semantic intent rather than the component's own prop shape: `lib/` decides,
 * `components/` renders, and the screen — the one layer allowed to see both —
 * translates. Returning the component's props from here would put a rendering
 * concern in the layer that must not import React.
 */
export type ActionIntent =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'optimize'; readonly remaining: number }
  | { readonly kind: 'optimizing' }
  | { readonly kind: 'start' }
  /** Mid-route: mark the current stop done, with skip beside it. */
  | { readonly kind: 'advance' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'degraded-only'; readonly note: string }
  | { readonly kind: 'unlockable'; readonly note: string };

export function actionIntentOf(state: PlanState, availability: OptimizeAvailability): ActionIntent {
  switch (state.kind) {
    case 'loading':
      // Nothing to offer yet, and a disabled control during a skeleton is a
      // control the user tries to press.
      return { kind: 'hidden' };

    case 'empty':
      // Hidden, not disabled: with no stops there is nothing to optimize, and a
      // greyed button invites a tap that can only fail (docs/08 §7).
      return { kind: 'hidden' };

    case 'in-progress':
      return { kind: 'advance' };

    case 'optimizing':
      return { kind: 'optimizing' };

    case 'failed':
      return { kind: 'retry' };

    case 'optimized':
      return { kind: 'start' };

    case 'draft':
      return draftIntent(state.stopCount, availability);
  }
}

function draftIntent(stopCount: number, availability: OptimizeAvailability): ActionIntent {
  // One stop is not a route. Said in words rather than shown as a grey
  // rectangle — a disabled control with no explanation reads as a broken one.
  if (stopCount < MIN_STOPS) {
    return { kind: 'blocked', reason: `Add at least ${MIN_STOPS} stops to optimize` };
  }

  switch (availability.kind) {
    case 'allowed':
      return { kind: 'optimize', remaining: availability.remaining };

    case 'too-few-stops':
      return { kind: 'blocked', reason: `Add at least ${MIN_STOPS} stops to optimize` };

    case 'too-many-stops':
      return {
        kind: 'blocked',
        reason: `Your plan covers up to ${availability.limit} stops`,
      };

    case 'degraded-only':
      // The allowance is spent but the route is small enough for the local
      // solver. Offered, and labelled — a degraded result must never look like
      // a full one (CLAUDE.md §7 rule 6).
      return availability.canUnlockWithAd
        ? { kind: 'unlockable', note: 'Watch a short ad for a traffic-aware route' }
        : { kind: 'degraded-only', note: 'Estimated without traffic' };

    case 'blocked':
      return availability.canUnlockWithAd
        ? { kind: 'unlockable', note: 'Watch a short ad to optimize this route' }
        : {
            kind: 'blocked',
            reason: 'Your optimizations are used up until the allowance resets',
          };
  }
}

/**
 * Whether the metrics on screen describe a real road route.
 *
 * A straight-line estimate and a traffic-aware duration are different claims,
 * and showing them in the same typography with no distinction is the one thing
 * this screen must not do — a driver plans their day on that number.
 */
export function metricsAreEstimated(state: PlanState): boolean {
  if (state.kind === 'optimized') return state.isDegraded;
  return state.kind === 'draft';
}
