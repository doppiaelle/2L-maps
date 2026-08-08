import { z } from 'zod';

import type { BillingProvider, BillingState, PurchaseOutcome } from '@/lib/providers/types';

import type { ApiClient } from './client';

/**
 * The concrete `BillingProvider`.
 *
 * The whole point of this adapter is what it does **not** do: it never lets the
 * store's answer become the app's answer. RevenueCat reports what the device
 * believes; entitlement is what the server knows
 * ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md)), and the
 * two legitimately disagree — after an offline stretch, a refund, a family
 * sharing change, a second device, or a day pass bought on a phone and used on
 * a tablet.
 *
 * So every path here ends the same way: **ask the server**. A successful
 * purchase does not return an entitlement, it returns a reason to re-read one.
 * The webhook is the only writer of entitlement
 * (docs/33_API_CONTRACTS.md), and this adapter is a reader.
 *
 * That has a visible consequence worth stating rather than hiding: a purchase
 * can succeed at the store and the server can still say `free` for a moment,
 * because the webhook has not landed. The state below reports what the server
 * says, and the screen shows a pending purchase rather than a granted one. A
 * client that optimistically granted access would be re-implementing the
 * paywall on the one machine the user controls.
 */

const stateSchema = z.object({
  status: z.union([
    z.literal('trial'),
    z.literal('active'),
    z.literal('lapsed'),
    z.literal('none'),
  ]),
  plan: z.union([z.literal('free'), z.literal('day-pass'), z.literal('pro')]),
  trialEndsAt: z.string().nullable(),
  renewsAt: z.string().nullable(),
  dayPassExpiresAt: z.string().nullable(),
});

/** What a store purchase can come back as. Mapped from the SDK at the edge, so
 *  the SDK's own vocabulary never reaches the product. */
export type SdkPurchaseResult =
  | 'purchased'
  /** The store accepted it but has not settled — Ask to Buy, SCA, slow bank. */
  | 'pending'
  | 'cancelled'
  /** Parental restriction, unsupported region, store disabled. */
  | 'not-allowed'
  | 'failed';

/** The narrow slice of the billing SDK this adapter needs. */
export interface BillingSdkPort {
  purchase: (productId: string) => Promise<SdkPurchaseResult>;
  restorePurchases: () => Promise<void>;
}

export interface BillingAdapterOptions {
  readonly client: ApiClient;
  readonly sdk: BillingSdkPort;
}

/** What a signed-out or unreachable app shows: the free rung, which is a real
 *  product rather than a locked door (ADR-0015). */
const UNKNOWN: BillingState = {
  status: 'none',
  plan: 'free',
  trialEndsAt: null,
  renewsAt: null,
  dayPassExpiresAt: null,
};

export function createBillingProvider(options: BillingAdapterOptions): BillingProvider {
  const { client, sdk } = options;

  const readServer = async (): Promise<BillingState> => {
    // Entitlement and allowances are the same question asked twice, so they
    // arrive in one call rather than two round trips on every app start
    // (docs/33_API_CONTRACTS.md).
    const result = await client.get('/usage-quota', stateSchema);
    // Offline or a broken response falls back to free rather than to the last
    // known paid state. Erring towards free costs a subscriber a moment of
    // reduced function; erring the other way hands out entitlement on a network
    // error, and that is the failure that cannot be walked back.
    return result.ok ? result.data : UNKNOWN;
  };

  const purchaseThenReconcile = async (productId: string): Promise<PurchaseOutcome> => {
    let sdkResult: SdkPurchaseResult;
    try {
      sdkResult = await sdk.purchase(productId);
    } catch {
      // The SDK's error object can carry the receipt and the store account
      // identifier, so it is deliberately not read or logged (CLAUDE.md §9).
      return { ok: false, reason: 'failed' };
    }

    if (sdkResult !== 'purchased') {
      return { ok: false, reason: sdkResult };
    }

    // Purchased at the store. That is a reason to re-read, not an entitlement:
    // the webhook writes it and this call finds out whether it has landed.
    await readServer();
    return { ok: true };
  };

  return {
    currentState: readServer,

    startTrial: purchaseThenReconcile,
    buyDayPass: purchaseThenReconcile,

    restore: async () => {
      try {
        await sdk.restorePurchases();
      } catch {
        // A restore that fails locally still warrants asking the server — the
        // entitlement may already be there, attached to the account rather than
        // to this device's receipt cache, which is the case restore exists for.
      }
      return readServer();
    },
  };
}
