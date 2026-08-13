import { FREE_MAX_STOPS, FREE_OPTIMIZATIONS_PER_MONTH, MAX_STOPS, MAX_STOPS_T0 } from '@/types';
import type { PlanUsage } from '@/types';

import { fallbackAllowances, optimizeAvailability, resolveAllowances } from './plans';

const noUsage: PlanUsage = { optimizations: 0, autocompleteSessions: 0 };
const spent = (optimizations: number): PlanUsage => ({
  optimizations,
  autocompleteSessions: 0,
});

describe('stop limits at their boundaries', () => {
  const free = fallbackAllowances('free');
  const pro = fallbackAllowances('pro');

  it('allows a free route at the limit and refuses it one over', () => {
    expect(optimizeAvailability(free, noUsage, FREE_MAX_STOPS).kind).toBe('allowed');
    expect(optimizeAvailability(free, noUsage, FREE_MAX_STOPS + 1)).toEqual({
      kind: 'too-many-stops',
      limit: FREE_MAX_STOPS,
    });
  });

  it('allows Pro up to the product ceiling and refuses it one over', () => {
    expect(optimizeAvailability(pro, noUsage, MAX_STOPS).kind).toBe('allowed');
    expect(optimizeAvailability(pro, noUsage, MAX_STOPS + 1)).toEqual({
      kind: 'too-many-stops',
      limit: MAX_STOPS,
    });
  });

  it('refuses a route that is not a route', () => {
    expect(optimizeAvailability(free, noUsage, 1)).toEqual({ kind: 'too-few-stops' });
  });

  it('costs nothing to be generous about stops on free', () => {
    // The point of FREE_MAX_STOPS being 15 rather than 8: a T1 route bills the
    // same at either size, so the stingier limit would save $0.00 and only make
    // the free tier feel mean (ADR-0029, docs/31_COST_MODEL.md §8).
    expect(free.maxStopsPerRoute).toBeGreaterThan(MAX_STOPS_T0);
  });
});

describe('running out of the monthly allowance', () => {
  const free = fallbackAllowances('free');

  it('allows the last optimization and reports what is left', () => {
    expect(optimizeAvailability(free, spent(FREE_OPTIMIZATIONS_PER_MONTH - 1), 5)).toEqual({
      kind: 'allowed',
      remaining: 1,
    });
  });

  it('degrades rather than locking out, when the route is small enough', () => {
    // A free user is never locked out — T0 costs nothing and needs no network.
    const outcome = optimizeAvailability(free, spent(FREE_OPTIMIZATIONS_PER_MONTH), MAX_STOPS_T0);
    expect(outcome).toEqual({ kind: 'degraded-only' });
  });

  it('blocks above the local solver ceiling instead of offering a bad answer', () => {
    // The gap this test pins down: free allows 15 stops but T0 stops being
    // honest above 8. A 9-stop free route with the allowance spent is the one
    // state where there is genuinely nothing good to offer — so the app says so
    // rather than shipping a straight-line order that can be worse than the
    // one the user typed (ADR-0003). ADR-0029 retired the advertising unlock.
    const outcome = optimizeAvailability(
      free,
      spent(FREE_OPTIMIZATIONS_PER_MONTH),
      MAX_STOPS_T0 + 1,
    );
    expect(outcome).toEqual({ kind: 'blocked' });
  });

  it('degrades a paid plan after its allowance too', () => {
    const pro = fallbackAllowances('pro');
    const outcome = optimizeAvailability(pro, spent(pro.optimizationsPerPeriod), 4);
    expect(outcome).toEqual({ kind: 'degraded-only' });
  });
});

describe('the server owns the numbers', () => {
  it('takes the server value over the local fallback', () => {
    // The allowances move without an app release, which is the control that
    // keeps the free tier within a measured acquisition budget (ADR-0029).
    const tightened = resolveAllowances('free', { optimizationsPerPeriod: 5 });
    expect(tightened.optimizationsPerPeriod).toBe(5);
  });

  it('merges field by field, so one number can move alone', () => {
    const partial = resolveAllowances('free', { autocompleteSessionsPerPeriod: 20 });
    expect(partial.autocompleteSessionsPerPeriod).toBe(20);
    expect(partial.optimizationsPerPeriod).toBe(FREE_OPTIMIZATIONS_PER_MONTH);
    expect(partial.maxStopsPerRoute).toBe(FREE_MAX_STOPS);
  });

  it('falls back when the server has not answered yet', () => {
    expect(resolveAllowances('free', null)).toEqual(fallbackAllowances('free'));
  });

  it('ignores a malformed limit rather than applying it', () => {
    // A negative or non-finite limit is a broken response, not a tighter cap.
    // Applying it would lock a paying user out on a server-side typo.
    const nonsense = resolveAllowances('pro', {
      optimizationsPerPeriod: -1,
      maxStopsPerRoute: Number.NaN,
    });
    expect(nonsense.optimizationsPerPeriod).toBe(fallbackAllowances('pro').optimizationsPerPeriod);
    expect(nonsense.maxStopsPerRoute).toBe(MAX_STOPS);
  });
});
