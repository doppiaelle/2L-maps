import { fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsView } from './SettingsView';
import { SubscriptionView } from './SubscriptionView';
import { fallbackAllowances } from '@/lib/entitlement/plans';

describe('settings', () => {
  it('contains one navigator selector and one subscription entry', () => {
    render(
      <SettingsView
        provider="google-maps"
        currentPlan="free"
        onBack={jest.fn()}
        onChooseProvider={jest.fn()}
        onOpenSubscription={jest.fn()}
        onSignOut={jest.fn()}
        theme="light"
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('settings-subscription')).toBeTruthy();
    expect(screen.queryByText('Always use this app')).toBeNull();
    expect(screen.queryByText('Navigate with')).toBeNull();
  });
});

describe('subscription comparison', () => {
  it('marks the server plan and never exposes a fake purchase control', () => {
    render(
      <SubscriptionView
        currentPlan="free"
        currentAllowances={fallbackAllowances('free')}
        selectedPlan="free"
        onBack={jest.fn()}
        onChoosePlan={jest.fn()}
        theme="light"
      />,
    );

    expect(screen.getByTestId('subscription-plan-free').props.accessibilityLabel).toContain(
      'current plan',
    );
    expect(screen.getByText('This is your current plan')).toBeTruthy();
    expect(screen.queryByText(/buy|subscribe|€|\$/i)).toBeNull();
  });

  it('compares a future plan without granting it locally', () => {
    const onChoosePlan = jest.fn();
    const { rerender } = render(
      <SubscriptionView
        currentPlan="free"
        currentAllowances={fallbackAllowances('free')}
        selectedPlan="free"
        onBack={jest.fn()}
        onChoosePlan={onChoosePlan}
        theme="dark"
      />,
    );

    fireEvent.press(screen.getByTestId('subscription-plan-pro'));
    expect(onChoosePlan).toHaveBeenCalledWith('pro');

    rerender(
      <SubscriptionView
        currentPlan="free"
        currentAllowances={fallbackAllowances('free')}
        selectedPlan="pro"
        onBack={jest.fn()}
        onChoosePlan={onChoosePlan}
        theme="dark"
      />,
    );
    expect(screen.getByText('Purchases are coming soon')).toBeTruthy();
  });
});
