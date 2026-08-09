import { decideLaunch, isInAppGroup } from './launch';
import type { LaunchContext } from './launch';

/**
 * The ordering in this decision is load-bearing, not incidental
 * (docs/10_NAVIGATION_FLOW.md §4), and the scenarios that matter most — a deep
 * link arriving while a route is in progress, a cold start mid-delivery — are
 * the ones that are painful to reproduce on a device. So they are tested here,
 * where reproducing them costs nothing.
 */

const ROUTE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const context = (overrides: Partial<LaunchContext> = {}): LaunchContext => ({
  isRestored: true,
  isSignedIn: true,
  hasRouteInProgress: false,
  pendingDeepLink: null,
  ...overrides,
});

describe('before anything is known', () => {
  it('holds the splash rather than rendering a guess', () => {
    // Rendering an empty Plan and swapping in a restored route afterwards
    // produces a flash that reads as a bug (docs/10 §4).
    expect(decideLaunch(context({ isRestored: false }))).toEqual({ kind: 'hold-splash' });
  });

  it('holds it even with everything else decided', () => {
    // Restoration is a precondition, not one input among several.
    const destination = decideLaunch(
      context({
        isRestored: false,
        isSignedIn: true,
        hasRouteInProgress: true,
        pendingDeepLink: { kind: 'history' },
      }),
    );
    expect(destination.kind).toBe('hold-splash');
  });
});

describe('signed out', () => {
  it('lands on sign-in', () => {
    expect(decideLaunch(context({ isSignedIn: false }))).toEqual({
      kind: 'sign-in',
      isHoldingDeepLink: false,
    });
  });

  it('holds a deep link rather than discarding it', () => {
    // Discarding it makes the tap that opened the app look ignored (docs/10 §6).
    expect(
      decideLaunch(context({ isSignedIn: false, pendingDeepLink: { kind: 'history' } })),
    ).toEqual({ kind: 'sign-in', isHoldingDeepLink: true });
  });

  it('does not reach an app screen even with a route in progress', () => {
    // The guard replaces the group; it never pushes. Nothing signed-in may sit
    // beneath a signed-out user in the stack.
    expect(decideLaunch(context({ isSignedIn: false, hasRouteInProgress: true })).kind).toBe(
      'sign-in',
    );
  });
});

describe('an in-progress route outranks everything else', () => {
  it('resumes it on a cold start', () => {
    expect(decideLaunch(context({ hasRouteInProgress: true }))).toEqual({
      kind: 'plan',
      mode: 'in-progress',
      routeId: null,
    });
  });

  it('is offered before a deep link to a different route', () => {
    // docs/10 §9, row 7. The user is mid-delivery; a link that silently
    // replaced what they are driving would lose the one piece of state this
    // product cannot reconstruct.
    const destination = decideLaunch(
      context({ hasRouteInProgress: true, pendingDeepLink: { kind: 'route', routeId: ROUTE_ID } }),
    );

    expect(destination).toEqual({ kind: 'plan', mode: 'in-progress', routeId: null });
  });

  it('is offered before a deep link to another screen', () => {
    expect(
      decideLaunch(context({ hasRouteInProgress: true, pendingDeepLink: { kind: 'history' } }))
        .kind,
    ).toBe('plan');
  });
});

describe('a pending deep link', () => {
  it('opens a route on Plan, carrying its id', () => {
    expect(
      decideLaunch(context({ pendingDeepLink: { kind: 'route', routeId: ROUTE_ID } })),
    ).toEqual({ kind: 'plan', mode: 'opened-route', routeId: ROUTE_ID });
  });

  it('reaches history', () => {
    expect(decideLaunch(context({ pendingDeepLink: { kind: 'history' } }))).toEqual({
      kind: 'history',
    });
  });

  it('reaches a settings subsection', () => {
    expect(
      decideLaunch(context({ pendingDeepLink: { kind: 'settings', section: 'subscription' } })),
    ).toEqual({ kind: 'settings', section: 'subscription' });
  });
});

describe('the ordinary launch', () => {
  it('lands on Plan with the last draft', () => {
    expect(decideLaunch(context())).toEqual({ kind: 'plan', mode: 'draft', routeId: null });
  });

  it('never involves a navigation transition', () => {
    // The critical path stays on one screen (docs/10 §2). Plan is the root and
    // is never navigated *to*.
    expect(decideLaunch(context()).kind).toBe('plan');
  });
});

describe('which group renders', () => {
  it('is derived from the destination, not re-read from the session', () => {
    // A guard that decides one thing and a renderer that decides another is how
    // a protected screen briefly appears.
    expect(isInAppGroup(decideLaunch(context()))).toBe(true);
    expect(isInAppGroup(decideLaunch(context({ isSignedIn: false })))).toBe(false);
    expect(isInAppGroup(decideLaunch(context({ isRestored: false })))).toBe(false);
  });
});

describe('entitlement', () => {
  it('is not part of this decision at all', () => {
    // It gates actions, not routes (ADR-0011). A lapsed user reaches Plan,
    // History and Settings normally — their own data is never held hostage.
    // The test is the absence: `LaunchContext` has no entitlement field, so a
    // route guard cannot be added without changing this signature and this test.
    const keys = Object.keys(context()).sort();
    expect(keys).toEqual(['hasRouteInProgress', 'isRestored', 'isSignedIn', 'pendingDeepLink']);
  });
});
