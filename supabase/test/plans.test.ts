import {
  ALLOWANCES,
  REPORTED_LIMITS,
  allowanceFor,
  quotaResetsAt,
  quotaWindowStart,
  resolvePlan,
  resolveStatus,
  type EntitlementRow,
} from '../functions/_shared/plans';
import {
  FREE_AUTOCOMPLETE_SESSIONS_PER_MONTH,
  FREE_OPTIMIZATIONS_PER_MONTH,
  DAY_PASS_DURATION_HOURS,
} from '../../types/constants';

/**
 * ADR-0015 turned entitlement from a boolean into a plan, and the tests that
 * matter are the ones about a user who has bought nothing: the free tier is the
 * common case now, and treating it as "no access" is the hard paywall the ADR
 * removed.
 */

const NOW = new Date('2026-08-09T12:00:00.000Z');

const row = (overrides: Partial<EntitlementRow> = {}): EntitlementRow => ({
  status: 'none',
  plan: null,
  trial_ends_at: null,
  renews_at: null,
  day_pass_expires_at: null,
  ...overrides,
});

describe('which rung a user is on', () => {
  it('puts a user with no entitlement row on free, not out of the product', () => {
    // Every new account looks like this on its first search. Answering
    // NO_ENTITLEMENT here is what locked the whole product behind a purchase.
    expect(resolvePlan(null, NOW)).toBe('free');
  });

  it('puts a lapsed subscriber on free rather than locking them out', () => {
    expect(resolvePlan(row({ status: 'lapsed' }), NOW)).toBe('free');
  });

  it('meters a trial exactly like a paid subscription', () => {
    // A trial is a free period, not a free tier — which is also what makes it a
    // fair preview of what is being sold (docs/20_SUBSCRIPTIONS.md).
    expect(resolvePlan(row({ status: 'trial' }), NOW)).toBe('pro');
  });

  it('keeps a user working through a billing retry', () => {
    expect(resolvePlan(row({ status: 'grace' }), NOW)).toBe('pro');
  });

  it('honours an unexpired day pass over the stored status', () => {
    const entitlement = row({
      status: 'day-pass',
      day_pass_expires_at: new Date(NOW.getTime() + 3_600_000).toISOString(),
    });
    expect(resolvePlan(entitlement, NOW)).toBe('day-pass');
  });

  it('stops honouring a day pass the moment it expires', () => {
    // The row keeps saying day-pass afterwards. Trusting it would hand out Pro
    // allowances indefinitely for one payment.
    const entitlement = row({
      status: 'day-pass',
      day_pass_expires_at: new Date(NOW.getTime() - 1_000).toISOString(),
    });
    expect(resolvePlan(entitlement, NOW)).toBe('free');
  });

  it('degrades an unrecognised status to free rather than throwing', () => {
    // A status the webhook learns to write before this code learns to read it
    // must cost a user their Pro allowances, never their access.
    expect(resolvePlan(row({ status: 'something-new' }), NOW)).toBe('free');
  });
});

describe('what the client is told, which is a different question', () => {
  it('reports a day-pass holder as having no subscription', () => {
    // They have not subscribed to anything. The *plan* says day-pass; the
    // status is about the subscription, and conflating them is what makes a
    // lapsed user look locked out (ADR-0015).
    expect(resolveStatus('day-pass')).toBe('none');
  });

  it('does not alarm a user mid-billing-retry', () => {
    expect(resolveStatus('grace')).toBe('active');
  });

  it('reports both ways a subscription can end as lapsed', () => {
    expect(resolveStatus('lapsed')).toBe('lapsed');
    expect(resolveStatus('expired')).toBe('lapsed');
  });
});

describe('allowances', () => {
  it('matches the free numbers the client falls back to offline', () => {
    // The client's constants are a display fallback for exactly these figures
    // (types/constants.ts). If the two drift, the allowance bar lies before the
    // first response arrives.
    expect(ALLOWANCES.free['/optimize']).toBe(FREE_OPTIMIZATIONS_PER_MONTH);
    expect(ALLOWANCES.free['/places-autocomplete']).toBe(FREE_AUTOCOMPLETE_SESSIONS_PER_MONTH);
  });

  it('gives every plan an allowance for every metered endpoint', () => {
    // A missing entry is not a free pass: `checkQuota` throws INTERNAL on one.
    // This is the test that catches adding an endpoint and forgetting a plan.
    const endpoints = Object.keys(ALLOWANCES.pro);
    for (const plan of ['free', 'day-pass', 'pro'] as const) {
      for (const endpoint of endpoints) {
        expect(allowanceFor(plan, endpoint)).toEqual(expect.any(Number));
      }
    }
  });

  it('never gives a lower plan more than a higher one', () => {
    for (const endpoint of Object.keys(ALLOWANCES.pro)) {
      const free = allowanceFor('free', endpoint) ?? 0;
      const dayPass = allowanceFor('day-pass', endpoint) ?? 0;
      const pro = allowanceFor('pro', endpoint) ?? 0;
      expect(free).toBeLessThanOrEqual(dayPass);
      expect(dayPass).toBeLessThanOrEqual(pro);
    }
  });

  it('reports only limits that name a real endpoint', () => {
    for (const { endpoint } of REPORTED_LIMITS) {
      expect(ALLOWANCES.pro[endpoint]).toEqual(expect.any(Number));
    }
  });
});

describe('the quota window', () => {
  it('is the calendar month for free and Pro', () => {
    expect(quotaWindowStart('free', null, NOW).toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(quotaResetsAt('pro', null, NOW).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('is the pass itself for a day pass, not the calendar month', () => {
    // Otherwise a pass bought on the 31st buys a few hours of allowance and one
    // bought on the 1st buys a month of it, for the same price.
    const expiry = new Date(NOW.getTime() + 6 * 3_600_000);
    const entitlement = row({ day_pass_expires_at: expiry.toISOString() });

    const start = quotaWindowStart('day-pass', entitlement, NOW);
    expect(expiry.getTime() - start.getTime()).toBe(DAY_PASS_DURATION_HOURS * 3_600_000);
    expect(quotaResetsAt('day-pass', entitlement, NOW).toISOString()).toBe(expiry.toISOString());
  });

  it('falls back to the month when the stored expiry is unreadable', () => {
    const entitlement = row({ day_pass_expires_at: 'not a date' });
    expect(quotaWindowStart('day-pass', entitlement, NOW).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });
});
