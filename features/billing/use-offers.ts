import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useMonetisation } from '@/features/monetisation/monetisation-provider';
import { GC_TIME_MS, STALE_TIME_MS } from '@/lib/query/client';
import type { PaywallOffer } from './PaywallView';
import type { PurchaseOutcome } from '@/lib/providers/types';

/**
 * What the paywall may offer, and what happens when it is tapped.
 *
 * **A row is shown only for a product the store actually has.** A price rendered
 * here that the store would not charge is the worst bug this screen can have —
 * it is the one Guideline 3.1.2 is about, and the one a user would be right to
 * call a lie ([`docs/26_APP_STORE.md`](../../docs/26_APP_STORE.md)). So the
 * offers come from the billing SDK, already localised by it, and this hook never
 * formats money.
 *
 * **Null billing yields no offers**, which is the state of every build until a
 * RevenueCat project exists. The paywall then presents the free plan and the
 * reason it appeared, which is still a useful screen — a user who met a limit
 * deserves to be told which one even when there is nothing to sell them.
 */

export interface Offers {
  readonly dayPass: PaywallOffer | null;
  readonly subscription: PaywallOffer | null;
  readonly isTrialAvailable: boolean;
  readonly isPurchasing: boolean;
  /** Null while nothing has failed. A cancelled purchase is not a failure and
   *  never sets it — the user changed their mind, and a red banner for that is
   *  the app arguing with them. */
  readonly failure: 'pending' | 'not-allowed' | 'failed' | null;
  buy: (offerId: string) => void;
}

export const OFFERS_QUERY_KEY = ['billing', 'offers'] as const;

export function useOffers(): Offers {
  const { billing } = useMonetisation();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [failure, setFailure] = useState<Offers['failure']>(null);

  const state = useQuery({
    queryKey: OFFERS_QUERY_KEY,
    // Not merely disabled: with no billing SDK there is nothing to ask, and a
    // query that fails on every mount would retry through the screen's life for
    // an answer that cannot arrive.
    enabled: billing !== null,
    staleTime: STALE_TIME_MS.entitlement,
    gcTime: GC_TIME_MS.entitlement,
    queryFn: () => billing?.currentState() ?? Promise.resolve(null),
  });

  const complete = (outcome: PurchaseOutcome) => {
    setIsPurchasing(false);
    // Backing out is not an error and is never shown as one.
    setFailure(outcome.ok || outcome.reason === 'cancelled' ? null : outcome.reason);
  };

  return {
    // No products until there is an SDK to enumerate them. Rendering a row with
    // nothing behind it gives the user a button that fails on tap.
    dayPass: null,
    subscription: null,
    // A trial is available until one has been started. Absent billing, the
    // server's answer on `/usage-quota` is what the screen falls back to.
    isTrialAvailable: state.data?.trialEndsAt === null,
    isPurchasing,
    failure,
    buy: (offerId) => {
      if (billing === null) return;
      setIsPurchasing(true);
      setFailure(null);
      void billing
        .buyDayPass(offerId)
        .then(complete)
        .catch(() => {
          complete({ ok: false, reason: 'failed' });
        });
    },
  };
}
