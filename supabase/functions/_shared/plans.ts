import { DAY_PASS_DURATION_HOURS } from '../../../types/constants.ts';

/**
 * Plans, allowances and the quota window — one source, used by both readers.
 *
 * Two places need these numbers and they must not be able to disagree: the
 * pipeline's quota step, which *refuses* a call, and `/usage-quota`, which
 * *reports* what is left. Two copies means an allowance bar that says 4 of 15
 * remaining above a button that answers 429, and the user has no way to tell
 * which one is lying.
 *
 * **Entitlement is no longer a boolean** ([ADR-0029](../../../docs/adr/0029-single-driver-wedge-and-subscription-first-freemium.md)):
 * it is a three-value plan with per-plan allowances, and the ADR names the
 * pipeline's step 2 as one of the places that had to change. A free user is
 * *entitled* — to the free allowances. Treating "no subscription" as "no access"
 * is the hard paywall the current freemium model removed, and it would lock every new account out
 * of the product before they had seen it work once.
 *
 * The numbers come from [`docs/20_SUBSCRIPTIONS.md`](../../../docs/20_SUBSCRIPTIONS.md) §6
 * for the free and day-pass rows, and from
 * [`docs/33_API_CONTRACTS.md`](../../../docs/33_API_CONTRACTS.md) §10 for Pro.
 * They live on the server so they move without an app release, which is the
 * control that keeps the free tier inside its measured acquisition budget
 * ([ADR-0011](../../../docs/adr/0011-server-side-quota-enforcement.md)).
 */

export type PlanTier = 'free' | 'day-pass' | 'pro';

/** What the client is told about the subscription. Distinct from the plan: a
 *  `lapsed` subscriber is on the `free` plan, not locked out. */
export type EntitlementStatus = 'trial' | 'active' | 'lapsed' | 'none';

/** The entitlement row, as the webhook writes it. Every field nullable because a
 *  user who has never bought anything has no row at all — the common case now
 *  that a free tier exists, and not an error state. */
export interface EntitlementRow {
  readonly status: string;
  readonly plan: string | null;
  readonly trial_ends_at: string | null;
  readonly renews_at: string | null;
  readonly day_pass_expires_at: string | null;
}

/**
 * Monthly allowance per plan, per endpoint.
 *
 * Keyed by endpoint rather than by a friendly name so the quota step can look up
 * exactly what it is about to spend. `/place-details` is the outlier: it is
 * billed per `place_id`, and the shared `places_cache` means most of those
 * lookups never reach Google at all — the endpoint charges quota only for the
 * ones it actually fetched.
 */
export const ALLOWANCES: Readonly<Record<PlanTier, Readonly<Record<string, number>>>> = {
  free: {
    '/optimize': 15,
    '/places-autocomplete': 10,
    '/geocode': 60,
    '/place-details': 120,
    '/parse-addresses': 5,
  },
  'day-pass': {
    '/optimize': 25,
    '/places-autocomplete': 40,
    '/geocode': 150,
    '/place-details': 300,
    '/parse-addresses': 20,
  },
  pro: {
    '/optimize': 300,
    '/places-autocomplete': 1_200,
    '/geocode': 1_500,
    '/place-details': 1_500,
    '/parse-addresses': 100,
  },
};

/** What `/usage-quota` reports, and which endpoint each figure counts. The
 *  client reads these two names; adding a third here is a contract change. */
export const REPORTED_LIMITS: readonly { readonly name: string; readonly endpoint: string }[] = [
  { name: 'optimizations', endpoint: '/optimize' },
  { name: 'autocompleteSessions', endpoint: '/places-autocomplete' },
];

/**
 * Which rung this user is actually on right now.
 *
 * The day pass is checked first and against the clock, because it is consumable:
 * the stored row keeps saying `day-pass` after it has expired, and trusting it
 * would hand out Pro allowances indefinitely for one payment.
 *
 * A trial is Pro. It is a free *period*, not a free *tier* — metered exactly
 * like a paid subscription ([`docs/20_SUBSCRIPTIONS.md`](../../../docs/20_SUBSCRIPTIONS.md)),
 * which is also what makes the trial a fair preview of what is being sold.
 */
export function resolvePlan(row: EntitlementRow | null, now: Date): PlanTier {
  if (row === null) return 'free';

  if (row.day_pass_expires_at !== null && Date.parse(row.day_pass_expires_at) > now.getTime()) {
    return 'day-pass';
  }

  if (row.status === 'trial' || row.status === 'active' || row.status === 'grace') {
    return 'pro';
  }

  // `lapsed`, `expired`, `none`, or anything the webhook learns to write later.
  // Falling back to free rather than throwing is deliberate: an unrecognised
  // status must degrade a user to the free tier, never out of the product.
  return 'free';
}

/** What the client is told. Kept separate from the plan on purpose — the two
 *  answer different questions and can legitimately disagree. */
export function resolveStatus(raw: string | null): EntitlementStatus {
  switch (raw) {
    case 'trial':
      return 'trial';
    case 'active':
    // A billing retry is still an active subscription from the user's side, and
    // telling them otherwise mid-route would be alarming and wrong.
    case 'grace':
      return 'active';
    case 'lapsed':
    case 'expired':
      return 'lapsed';
    default:
      return 'none';
  }
}

/** The allowance for one endpoint on one plan. */
export function allowanceFor(plan: PlanTier, endpoint: string): number | undefined {
  return ALLOWANCES[plan][endpoint];
}

/**
 * When the current quota window opened.
 *
 * The calendar month for free and Pro. **Not for the day pass**, which buys
 * `DAY_PASS_DURATION_HOURS` of Pro-shaped allowance
 * ([`docs/20_SUBSCRIPTIONS.md`](../../../docs/20_SUBSCRIPTIONS.md) §6 states its
 * limits per day): counting a day pass against the calendar month would give a
 * pass bought on the 31st a few hours of allowance and one bought on the 1st a
 * whole month of it, for the same price.
 *
 * The window is derived from the expiry rather than stored, because the expiry
 * is the only end of it the webhook knows.
 */
export function quotaWindowStart(plan: PlanTier, row: EntitlementRow | null, now: Date): Date {
  if (plan === 'day-pass' && row?.day_pass_expires_at != null) {
    const expiry = Date.parse(row.day_pass_expires_at);
    if (!Number.isNaN(expiry)) {
      return new Date(expiry - DAY_PASS_DURATION_HOURS * 3_600_000);
    }
  }
  return startOfMonth(now);
}

/** When the current allowance resets, which is what the user is told. "Come back
 *  later" is not an answer a driver can act on; a date is. */
export function quotaResetsAt(plan: PlanTier, row: EntitlementRow | null, now: Date): Date {
  if (plan === 'day-pass' && row?.day_pass_expires_at != null) {
    const expiry = Date.parse(row.day_pass_expires_at);
    if (!Number.isNaN(expiry)) return new Date(expiry);
  }
  return startOfNextMonth(now);
}

export function startOfMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** The quota window is the calendar month, so the reset is the first of the next. */
export function startOfNextMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}
