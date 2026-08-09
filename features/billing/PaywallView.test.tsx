import { fireEvent, render, screen } from '@testing-library/react-native';

import { PaywallView } from './PaywallView';
import { TRIAL_DURATION_DAYS } from '@/types';

/**
 * Guideline 3.1.2 is the reason this file exists. A trial disclosure that is
 * missing, or that sits below the button, is the single most likely cause of
 * App Review rejection (docs/26_APP_STORE.md) — and it is exactly the kind of
 * thing a redesign quietly removes.
 */

const noop = () => undefined;

const subscription = {
  id: 'pro-monthly',
  title: '2L Maps Pro',
  price: '€9.99',
  detail: 'Unlimited optimizations, 25 stops, no ads',
};

const dayPass = {
  id: 'day-pass',
  title: 'Day pass',
  price: '€1.99',
  detail: 'Everything Pro has, for today',
};

const renderPaywall = (overrides: Partial<Parameters<typeof PaywallView>[0]> = {}) =>
  render(
    <PaywallView
      reason="quota-exhausted"
      dayPass={dayPass}
      subscription={subscription}
      isTrialAvailable
      isPurchasing={false}
      onBuy={noop}
      onContinueFree={noop}
      theme="light"
      {...overrides}
    />,
  );

describe('the trial disclosure', () => {
  it('states the length, the price after it, and that it renews', () => {
    renderPaywall();

    const terms = screen.getByTestId('paywall-subscription-terms').props.children;
    expect(terms).toContain(`${TRIAL_DURATION_DAYS} days`);
    expect(terms).toContain('€9.99');
    expect(terms).toContain('renews automatically');
    expect(terms).toContain('cancel');
  });

  it('is spoken with the button, not only drawn above it', () => {
    // A screen reader user hears the control without having read what sits
    // above it.
    renderPaywall();
    expect(screen.getByLabelText(/renews automatically until you cancel/)).toBeTruthy();
  });

  it('drops the trial wording when no trial is on offer', () => {
    // Claiming a trial the store will not grant is a rejection and a lie in the
    // same sentence.
    renderPaywall({ isTrialAvailable: false });

    const terms = screen.getByTestId('paywall-subscription-terms').props.children;
    expect(terms).not.toContain('Free for');
    expect(terms).toContain('renews automatically');
  });

  it('says the day pass does not renew', () => {
    // A consumable presented like a subscription is the other half of 3.1.2.
    renderPaywall();
    expect(screen.getByTestId('paywall-day-pass-terms').props.children).toContain('Does not renew');
  });
});

describe('why the paywall appeared', () => {
  it('names the limit that was met', () => {
    // A user who tapped Optimize and got a price list deserves to know which
    // limit they hit.
    renderPaywall({ reason: 'quota-exhausted' });
    expect(screen.getByTestId('paywall-reason').props.children).toMatch(/optimizations/);
  });

  it('says something different when the route is simply too long', () => {
    renderPaywall({ reason: 'stops-exceeded' });
    expect(screen.getByTestId('paywall-reason').props.children).toMatch(/more stops/);
  });
});

describe('declining', () => {
  it('is a row, not a close button', () => {
    // A paywall whose only way out is a dismissal teaches the user that the
    // product is a negotiation (ADR-0015 rule 5).
    let continued = false;
    renderPaywall({
      onContinueFree: () => {
        continued = true;
      },
    });

    fireEvent.press(screen.getByLabelText('Continue on the free plan, with ads'));
    expect(continued).toBe(true);
  });
});

describe('buying', () => {
  it('reports which offer', () => {
    let bought: string | null = null;
    renderPaywall({
      onBuy: (id) => {
        bought = id;
      },
    });

    fireEvent.press(screen.getByLabelText(/2L Maps Pro/));
    expect(bought).toBe('pro-monthly');
  });

  it('announces that it is busy rather than only dimming', () => {
    renderPaywall({ isPurchasing: true });
    expect(screen.getByLabelText(/2L Maps Pro/).props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('offers only what the store actually returned', () => {
    // An offer row with no product behind it is a button that fails on tap.
    renderPaywall({ dayPass: null });
    expect(screen.queryByTestId('paywall-day-pass')).toBeNull();
  });
});
