import type { DeepLinkTarget } from './deep-links';

/**
 * Where a launch lands, decided once and in one place.
 *
 * [`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §4 draws this
 * as a decision tree, and the ordering in it is load-bearing rather than
 * incidental. Encoding it as a pure function means every launch scenario —
 * including the ones that are painful to reproduce on a device, like a deep link
 * arriving while a route is in progress — is tested without a renderer.
 *
 * **Guards resolve before the first render**, never as a redirect after it. A
 * visible flash of a screen the user is not entitled to see is both a quality
 * defect and a disclosure of the thing the guard exists to protect (docs/10 §8).
 * `hold-splash` is what that looks like in a return value.
 */

export interface LaunchContext {
  /** Persisted state has finished loading. Until then nothing is known and
   *  nothing may be rendered. */
  readonly isRestored: boolean;
  readonly isSignedIn: boolean;
  /** A route the user was part-way through when the process died. */
  readonly hasRouteInProgress: boolean;
  readonly pendingDeepLink: DeepLinkTarget | null;
}

export type LaunchDestination =
  | { readonly kind: 'hold-splash' }
  /** `isHoldingDeepLink` lets sign-in say where the user will land, instead of
   *  swallowing the link and appearing to ignore the tap that opened the app. */
  | { readonly kind: 'sign-in'; readonly isHoldingDeepLink: boolean }
  | {
      readonly kind: 'plan';
      readonly mode: 'in-progress' | 'opened-route' | 'draft';
      readonly routeId: string | null;
    }
  | { readonly kind: 'history' }
  | { readonly kind: 'settings'; readonly section: 'subscription' | null };

export function decideLaunch(context: LaunchContext): LaunchDestination {
  // 1. Nothing is known yet. Rendering an empty Plan and swapping in a restored
  //    route afterwards produces a flash that reads as a bug (docs/10 §4).
  if (!context.isRestored) return { kind: 'hold-splash' };

  // 2. The auth guard replaces the group; it never pushes, so no signed-out user
  //    can have an app screen beneath them in the stack. A pending deep link is
  //    held rather than discarded and resolves after sign-in.
  if (!context.isSignedIn) {
    return { kind: 'sign-in', isHoldingDeepLink: context.pendingDeepLink !== null };
  }

  // 3. An in-progress route outranks a deep link (docs/10 §9, row 7). The user
  //    is mid-delivery; a link that silently replaced what they are driving
  //    would lose the one piece of state this product cannot reconstruct.
  if (context.hasRouteInProgress) {
    return { kind: 'plan', mode: 'in-progress', routeId: null };
  }

  const link = context.pendingDeepLink;
  if (link !== null) {
    switch (link.kind) {
      case 'route':
        // Plan, not a detail screen: opening a route is something the user does
        // in order to work on it.
        return { kind: 'plan', mode: 'opened-route', routeId: link.routeId };
      case 'history':
        return { kind: 'history' };
      case 'settings':
        return { kind: 'settings', section: link.section };
    }
  }

  // 4. The ordinary launch: the last draft, or the empty state.
  return { kind: 'plan', mode: 'draft', routeId: null };
}

/**
 * Whether the destination lives in the signed-in group.
 *
 * Used to choose which group the root layout renders. Derived from the
 * destination rather than re-read from the session, so the two cannot disagree —
 * a guard that decides one thing and a renderer that decides another is how a
 * protected screen briefly appears.
 */
export function isInAppGroup(destination: LaunchDestination): boolean {
  return destination.kind !== 'sign-in' && destination.kind !== 'hold-splash';
}

/**
 * Entitlement is deliberately absent from everything above.
 *
 * It gates **actions, not routes** ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md),
 * docs/10 §6). A lapsed user reaches Plan, History and Settings normally and
 * only optimization is blocked — their own data is never held hostage. A
 * `LaunchContext` field for entitlement would be the first step towards a route
 * guard, so there isn't one.
 */
