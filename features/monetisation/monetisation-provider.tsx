import { createContext, useContext, useMemo } from 'react';

import type { AdsProvider, BillingProvider } from '@/lib/providers/types';

/**
 * Billing and advertising, or their absence.
 *
 * **Both are null today, and that is a state the product supports rather than a
 * gap it tolerates.** RevenueCat needs an account and three configured products;
 * AdMob needs an account and a certified consent platform for the EEA
 * ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)). Neither exists
 * yet, so every screen that touches them has to work without them — and the way
 * to be sure it does is to make absence the ordinary case rather than a branch
 * nobody exercises.
 *
 * That is the same honest null `createSupabaseAuth` returns for an unconfigured
 * build, applied to two more capabilities. A throwing stub would move the
 * failure to whichever screen happened to touch it first, and a fake provider
 * that returns plausible offers would put prices on a paywall that no store
 * would charge — the worst possible bug on that screen.
 *
 * **The adapters are deliberately not written.** An adapter against an SDK that
 * is not installed is speculative generality (`CLAUDE.md` §12 rule 6): it cannot
 * be compiled against the real types, cannot be tested, and would be rewritten
 * the day the account exists. What is built here instead is the seam — every
 * call site already handles null, and the day the SDK arrives one file is added
 * and passed in at the composition root.
 */

export interface Monetisation {
  /** Null until a RevenueCat project exists. The paywall then shows what it can
   *  rather than inventing prices. */
  readonly billing: BillingProvider | null;
  /** Null until an AdMob account and a certified CMP exist. No slot is reserved
   *  while it is null — an empty gap is worse than no gap. */
  readonly ads: AdsProvider | null;
}

const MonetisationContext = createContext<Monetisation>({ billing: null, ads: null });

export interface MonetisationProviderProps {
  readonly billing?: BillingProvider | null;
  readonly ads?: AdsProvider | null;
  readonly children: React.ReactNode;
}

export function MonetisationProvider({
  billing = null,
  ads = null,
  children,
}: MonetisationProviderProps): React.JSX.Element {
  const value = useMemo<Monetisation>(() => ({ billing, ads }), [billing, ads]);
  return <MonetisationContext.Provider value={value}>{children}</MonetisationContext.Provider>;
}

export function useMonetisation(): Monetisation {
  return useContext(MonetisationContext);
}
