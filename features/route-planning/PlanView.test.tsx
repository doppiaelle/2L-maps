import { render, screen } from '@testing-library/react-native';

import { PlanView } from './PlanView';
import type { PlanViewProps } from './PlanView';
import { actionIntentOf, planStateOf } from '@/lib/route/plan-state';
import type { PlanInputs } from '@/lib/route/plan-state';
import type { OptimizeAvailability } from '@/lib/entitlement/plans';

/**
 * Plan is composition, so this file asserts composition: that each of the
 * screen's specified states puts the right sentence and the right control in
 * front of the user (docs/08_SCREEN_SPECIFICATIONS.md §7). The decisions
 * themselves are proven in `lib/route/plan-state.test.ts`.
 */

const noop = () => undefined;

const stopItem = (i: number) => ({
  id: `stop-${i}`,
  position: i + 1,
  text: { title: `Via ${i}, Bergamo`, subtitle: null, needsRefreshing: false },
  state: 'pending' as const,
  hasCoordinate: true,
  meta: null,
});

const allowed: OptimizeAvailability = { kind: 'allowed', remaining: 3 };

const renderPlan = (
  inputs: Partial<PlanInputs>,
  availability: OptimizeAvailability = allowed,
  overrides: Partial<PlanViewProps> = {},
) => {
  const full: PlanInputs = {
    isLoading: false,
    stopCount: 3,
    completedCount: 0,
    isRouteUnderway: false,
    isOptimizing: false,
    hasResult: false,
    isDegraded: false,
    wasAlreadyOptimal: false,
    lastFailure: null,
    ...inputs,
  };
  const state = planStateOf(full);
  const count = full.stopCount;

  return render(
    <PlanView
      state={state}
      intent={actionIntentOf(state, availability)}
      stops={Array.from({ length: count }, (_, i) => stopItem(i))}
      distance={{ value: '34 KM', spoken: '34 kilometres' }}
      duration={{ value: '1h 12m', spoken: '1 hour 12 minutes' }}
      onSelectStop={noop}
      onRemoveStop={noop}
      onMoveStop={noop}
      onClearRoute={noop}
      onPrimaryAction={noop}
      onAddStop={noop}
      onImport={noop}
      {...overrides}
    />,
  );
};

describe('the empty state', () => {
  it('offers one affordance and no control that cannot work', () => {
    // A greyed Optimize with no stops invites a tap that can only fail.
    renderPlan({ stopCount: 0 });

    expect(screen.getByText('NO STOPS YET')).toBeTruthy();
    expect(screen.queryByTestId('plan-action')).toBeNull();
    expect(screen.getByLabelText('Add a stop')).toBeTruthy();
  });
});

describe('stops added, not optimized', () => {
  it('offers Optimize', () => {
    renderPlan({});
    expect(screen.getByText('Optimize')).toBeTruthy();
  });

  it('marks the metrics as a straight-line estimate', () => {
    // A straight-line figure and a traffic-aware duration are different claims
    // about the same day, and a driver plans on that number.
    renderPlan({});
    expect(screen.getByLabelText('Straight-line estimate')).toBeTruthy();
  });
});

describe('optimizing', () => {
  it('shows progress on the control and keeps the order visible', () => {
    // The existing order remains visible and unchanged (docs/08 §7): the user
    // must be able to see what they are waiting on.
    renderPlan({ isOptimizing: true });

    expect(screen.getByText('Optimizing')).toBeTruthy();
    expect(screen.getByText('Via 0, Bergamo')).toBeTruthy();
  });
});

describe('optimized', () => {
  it('becomes Confirm', () => {
    renderPlan({ hasResult: true });
    // "Confirm" rather than "Start": it sits under a drawn route the user is
    // being asked to accept, and what it does is hand the day to a navigation
    // app. This product has never navigated (ADR-0004).
    expect(screen.getByText('Confirm')).toBeTruthy();
  });

  it('shows no estimate chip once the numbers are real', () => {
    renderPlan({ hasResult: true });
    expect(screen.queryByLabelText('Straight-line estimate')).toBeNull();
    expect(screen.queryByLabelText('Estimated without traffic')).toBeNull();
  });

  it('labels a degraded result so it cannot pass for a full one', () => {
    // CLAUDE.md §7 rule 6. This is the product's most important four words.
    renderPlan({ hasResult: true, isDegraded: true });
    expect(screen.getByLabelText('Estimated without traffic')).toBeTruthy();
  });

  it('says an already-optimal order positively, not with silence', () => {
    // Reordering nothing is a correct answer, and the user paid for it.
    renderPlan({ hasResult: true, wasAlreadyOptimal: true });
    expect(screen.getByText('Already the fastest order')).toBeTruthy();
  });
});

describe('a failure', () => {
  it('offers a retry and says the stops are untouched', () => {
    // A failed optimization that also scrambled the list is two problems.
    renderPlan({ lastFailure: 'upstream' });

    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByText('Could not optimize. Your stops are unchanged.')).toBeTruthy();
    expect(screen.getByText('Via 0, Bergamo')).toBeTruthy();
  });
});

describe('quota exhausted', () => {
  it('explains rather than greying out silently', () => {
    renderPlan({}, { kind: 'blocked', canUnlockWithAd: false });
    expect(
      screen.getByText('Your optimizations are used up until the allowance resets'),
    ).toBeTruthy();
  });

  it('offers the ad when one would buy a real optimization', () => {
    renderPlan({}, { kind: 'degraded-only', canUnlockWithAd: true });
    expect(screen.getByText('Watch a short ad for a traffic-aware route')).toBeTruthy();
  });

  it('keeps the verb on a blocked control', () => {
    // The user still learns what the button is for while they cannot use it.
    renderPlan({}, { kind: 'blocked', canUnlockWithAd: false });
    expect(screen.getByText('Optimize')).toBeTruthy();
  });
});

describe('a route in progress', () => {
  it('says which stop, of how many', () => {
    renderPlan({ isRouteUnderway: true, completedCount: 2, stopCount: 9 });
    expect(screen.getByText('STOP 3 OF 9')).toBeTruthy();
  });

  it('offers Done and Skip side by side, both full size', () => {
    // The user is driving. A smaller Skip target is a mis-tap on somebody's
    // delivery.
    renderPlan({ isRouteUnderway: true }, allowed, { onSkipStop: noop });

    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByTestId('plan-skip').props.style).toMatchObject({ minHeight: 56 });
  });

  it('does not offer to add a stop mid-route', () => {
    renderPlan({ isRouteUnderway: true }, allowed, { onSkipStop: noop });
    expect(screen.queryByLabelText('Add a stop')).toBeNull();
  });
});

describe('loading a saved route', () => {
  it('shows a skeleton that matches the eventual layout', () => {
    renderPlan({ isLoading: true });
    expect(screen.getAllByTestId('stop-skeleton').length).toBeGreaterThan(0);
  });
});

/**
 * The map used to be rendered by this component, and three cases here asserted
 * markers and camera padding. It now belongs to the screen, behind every dock
 * section (ADR-0018), and `components/map/AppMap.test.tsx` already owns those
 * properties — keeping copies here would have been the same assertion in two
 * places, one of which no longer renders a map.
 */
