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
        onClearTrace={jest.fn()}
        onOpenSubscription={jest.fn()}
        onShareTrace={jest.fn()}
        onSignOut={jest.fn()}
        traceEventCount={0}
        traceText="No trace events yet."
        theme="light"
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('settings-subscription')).toBeTruthy();
    expect(screen.queryByText('Always use this app')).toBeNull();
    expect(screen.queryByText('Navigate with')).toBeNull();
  });

  it('opens the temporary app trace panel from settings', () => {
    const onShareTrace = jest.fn();
    const onClearTrace = jest.fn();
    const traceText = ['0001 boot', '0002 routes.save_failed'].join('\n');

    render(
      <SettingsView
        provider="google-maps"
        currentPlan="free"
        onBack={jest.fn()}
        onChooseProvider={jest.fn()}
        onClearTrace={onClearTrace}
        onOpenSubscription={jest.fn()}
        onShareTrace={onShareTrace}
        onSignOut={jest.fn()}
        traceEventCount={2}
        traceText={traceText}
        theme="dark"
      />,
    );

    expect(screen.queryByTestId('settings-diagnostics-panel')).toBeNull();

    fireEvent.press(screen.getByTestId('settings-diagnostics-toggle'));

    expect(screen.getByTestId('settings-diagnostics-panel')).toBeTruthy();
    expect(screen.getByTestId('settings-diagnostics-trace').props.children).toBe(traceText);

    fireEvent.press(screen.getByTestId('settings-diagnostics-share'));
    fireEvent.press(screen.getByTestId('settings-diagnostics-clear'));

    expect(onShareTrace).toHaveBeenCalledTimes(1);
    expect(onClearTrace).toHaveBeenCalledTimes(1);
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
