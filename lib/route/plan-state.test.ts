import { actionIntentOf, metricsAreEstimated, planStateOf } from './plan-state';
import type { PlanInputs } from './plan-state';
import type { OptimizeAvailability } from '@/lib/entitlement/plans';
import { MIN_STOPS } from '@/types';

/**
 * The states specified for this screen (docs/08_SCREEN_SPECIFICATIONS.md §7).
 * The ones that matter most are the ones a reviewer never sees: the allowance
 * running out mid-draft, and a failure that must leave the order alone.
 *
 * `in-progress` is no longer among them. It used to outrank every other state,
 * because the screen's job while driving was to name the next stop and offer
 * Done and Skip; the drive happens inside a navigation app and the driver is not
 * here ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)).
 */

const inputs = (overrides: Partial<PlanInputs> = {}): PlanInputs => ({
  isLoading: false,
  stopCount: 5,
  isOptimizing: false,
  hasResult: false,
  isDegraded: false,
  wasAlreadyOptimal: false,
  lastFailure: null,
  ...overrides,
});

const allowed = (remaining = 3): OptimizeAvailability => ({ kind: 'allowed', remaining });

describe('which state Plan is in', () => {
  it('shows the empty state with no stops', () => {
    expect(planStateOf(inputs({ stopCount: 0 })).kind).toBe('empty');
  });

  it('shows a draft once there are stops and no result', () => {
    expect(planStateOf(inputs())).toEqual({ kind: 'draft', stopCount: 5 });
  });

  it('shows the optimized state once a result lands', () => {
    expect(planStateOf(inputs({ hasResult: true }))).toEqual({
      kind: 'optimized',
      stopCount: 5,
      isDegraded: false,
      wasAlreadyOptimal: false,
    });
  });

  it('carries the degraded flag through rather than flattening it', () => {
    // A T0 result never looks like a T1 result (CLAUDE.md §7 rule 6), and the
    // label persists into history.
    const state = planStateOf(inputs({ hasResult: true, isDegraded: true }));
    expect(state.kind === 'optimized' && state.isDegraded).toBe(true);
  });

  it('reports an order that was already optimal', () => {
    // Stated positively in the header, not as silence and not as an error.
    // Reordering nothing is a correct answer, and the user paid for it.
    const state = planStateOf(inputs({ hasResult: true, wasAlreadyOptimal: true }));
    expect(state.kind === 'optimized' && state.wasAlreadyOptimal).toBe(true);
  });
});

describe('a route already handed over', () => {
  it('comes back to the same optimized state the driver left', () => {
    // Returning from Google Maps must not land on a different screen. The route
    // is still optimized, the map still shows it, and Confirm still hands it
    // over again — which is what a driver who closed the navigation app at lunch
    // needs in the afternoon.
    expect(planStateOf(inputs({ hasResult: true })).kind).toBe('optimized');
    expect(actionIntentOf(planStateOf(inputs({ hasResult: true })), allowed()).kind).toBe('start');
  });
});

describe('a failed optimization', () => {
  it('keeps the stops it was given', () => {
    // The order is untouched (docs/08 §7). A failed optimization that also
    // scrambled the list is two problems.
    const state = planStateOf(inputs({ stopCount: 12, lastFailure: 'upstream' }));
    expect(state).toEqual({ kind: 'failed', stopCount: 12, canRetry: true });
  });

  it('does not hide behind a stale result', () => {
    // Showing yesterday's optimized route after today's attempt failed would
    // let a driver leave on numbers that are not for this day.
    expect(planStateOf(inputs({ hasResult: true, lastFailure: 'offline' })).kind).toBe('failed');
  });
});

describe('what the control says', () => {
  it('is hidden when there is nothing to act on', () => {
    // Hidden, not disabled: a greyed button invites a tap that can only fail.
    expect(actionIntentOf(planStateOf(inputs({ stopCount: 0 })), allowed()).kind).toBe('hidden');
    expect(actionIntentOf(planStateOf(inputs({ isLoading: true })), allowed()).kind).toBe('hidden');
  });

  it('offers Optimize on a draft, with what is left', () => {
    expect(actionIntentOf(planStateOf(inputs()), allowed(2))).toEqual({
      kind: 'optimize',
      remaining: 2,
    });
  });

  it('explains why one stop is not a route', () => {
    // A disabled control with no explanation reads as a broken one.
    const intent = actionIntentOf(planStateOf(inputs({ stopCount: 1 })), allowed());
    expect(intent).toEqual({
      kind: 'blocked',
      reason: `Add at least ${MIN_STOPS} stops to optimize`,
    });
  });

  it('names the plan’s ceiling rather than failing silently', () => {
    const intent = actionIntentOf(planStateOf(inputs({ stopCount: 40 })), {
      kind: 'too-many-stops',
      limit: 15,
    });
    expect(intent).toEqual({ kind: 'blocked', reason: 'Your plan covers up to 15 stops' });
  });

  it('offers the local solver, labelled, when the allowance is spent', () => {
    // Offered rather than withheld — and labelled, because a degraded result
    // must never look like a full one.
    expect(
      actionIntentOf(planStateOf(inputs()), { kind: 'degraded-only', canUnlockWithAd: false }),
    ).toEqual({ kind: 'degraded-only', note: 'Estimated without traffic' });
  });

  it('offers the ad instead when one would buy a real optimization', () => {
    expect(
      actionIntentOf(planStateOf(inputs()), { kind: 'degraded-only', canUnlockWithAd: true }),
    ).toEqual({ kind: 'unlockable', note: 'Watch a short ad for a traffic-aware route' });
  });

  it('says what happened when nothing at all is available', () => {
    expect(
      actionIntentOf(planStateOf(inputs()), { kind: 'blocked', canUnlockWithAd: false }),
    ).toEqual({
      kind: 'blocked',
      reason: 'Your optimizations are used up until the allowance resets',
    });
  });

  it('becomes Start once a route is optimized', () => {
    expect(actionIntentOf(planStateOf(inputs({ hasResult: true })), allowed()).kind).toBe('start');
  });

  it('offers a retry after a failure', () => {
    expect(actionIntentOf(planStateOf(inputs({ lastFailure: 'upstream' })), allowed()).kind).toBe(
      'retry',
    );
  });

  it('ignores the allowance entirely once a result exists', () => {
    // The work is already paid for. Blocking Start on a spent allowance would
    // take away something the user has.
    expect(
      actionIntentOf(planStateOf(inputs({ hasResult: true })), {
        kind: 'blocked',
        canUnlockWithAd: false,
      }).kind,
    ).toBe('start');
  });
});

describe('whether the numbers are a real road route', () => {
  it('marks a draft’s metrics as an estimate', () => {
    // A straight-line estimate and a traffic-aware duration are different
    // claims, and a driver plans their day on that number.
    expect(metricsAreEstimated(planStateOf(inputs()))).toBe(true);
  });

  it('marks a degraded result as an estimate too', () => {
    expect(metricsAreEstimated(planStateOf(inputs({ hasResult: true, isDegraded: true })))).toBe(
      true,
    );
  });

  it('does not mark a real result', () => {
    expect(metricsAreEstimated(planStateOf(inputs({ hasResult: true })))).toBe(false);
  });
});
