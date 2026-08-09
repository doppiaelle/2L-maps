import { ApiClient } from './client';
import { createBillingProvider } from './billing-adapter';
import type { BillingSdkPort, SdkPurchaseResult } from './billing-adapter';

/**
 * Every test here is a variation on one rule: the store's answer never becomes
 * the app's answer. A suite that let a successful purchase imply entitlement
 * would pass while the client re-implemented the paywall on the one machine the
 * user controls (ADR-0011).
 */

const serverState = {
  status: 'active' as const,
  plan: 'pro' as const,
  trialEndsAt: null,
  renewsAt: '2026-09-08T00:00:00Z',
  dayPassExpiresAt: null,
};

const harness = (
  server: { status: number; payload: unknown },
  sdkResult: SdkPurchaseResult | Error = 'purchased',
) => {
  const calls: string[] = [];
  const client = new ApiClient({
    baseUrl: 'https://edge.test',
    getAccessToken: async () => 'jwt',
    fetchImpl: (async (url: string) => {
      calls.push(String(url).replace('https://edge.test', ''));
      return {
        ok: server.status >= 200 && server.status < 300,
        status: server.status,
        json: async () => server.payload,
      };
    }) as unknown as typeof fetch,
  });

  const sdk: BillingSdkPort & { purchases: string[]; restores: number } = {
    purchases: [],
    restores: 0,
    purchase: async (productId: string) => {
      sdk.purchases.push(productId);
      if (sdkResult instanceof Error) throw sdkResult;
      return sdkResult;
    },
    restorePurchases: async () => {
      sdk.restores += 1;
    },
  };

  return { provider: createBillingProvider({ client, sdk }), sdk, calls };
};

const ok = (payload: unknown = serverState) => ({ status: 200, payload });

describe('the server is the only source of entitlement', () => {
  it('reads state from the server, not from the store', async () => {
    const { provider, calls } = harness(ok());
    expect(await provider.currentState()).toEqual(serverState);
    expect(calls).toEqual(['/usage-quota']);
  });

  it('re-reads after a successful purchase instead of granting locally', async () => {
    // A purchase is a reason to re-read, not an entitlement. The webhook writes
    // entitlement; this adapter reads it.
    const { provider, sdk, calls } = harness(ok(), 'purchased');

    const outcome = await provider.startTrial('monthly');
    expect(outcome).toEqual({ ok: true });
    expect(sdk.purchases).toEqual(['monthly']);
    expect(calls).toEqual(['/usage-quota']);
  });

  it('falls back to free when the server is unreachable, never to the last paid state', async () => {
    // Erring towards free costs a subscriber a moment of reduced function.
    // Erring the other way hands out entitlement on a network error, and that
    // one cannot be walked back.
    const { provider } = harness({
      status: 503,
      payload: { error: { code: 'INTERNAL', message: 'x' } },
    });

    expect(await provider.currentState()).toEqual({
      status: 'none',
      plan: 'free',
      trialEndsAt: null,
      renewsAt: null,
      dayPassExpiresAt: null,
    });
  });

  it('falls back to free when the response does not match the contract', async () => {
    const { provider } = harness(ok({ status: 'active' }));
    expect((await provider.currentState()).plan).toBe('free');
  });

  it('keeps plan and status distinct, because a lapsed user is not locked out', async () => {
    // `lapsed` on the `free` plan is a real, common state: the subscription
    // ended and the product still works (ADR-0015).
    const { provider } = harness(
      ok({ ...serverState, status: 'lapsed', plan: 'free', renewsAt: null }),
    );
    const state = await provider.currentState();
    expect(state.status).toBe('lapsed');
    expect(state.plan).toBe('free');
  });
});

describe('purchase outcomes a screen must tell apart', () => {
  const cases: readonly [Exclude<SdkPurchaseResult, 'purchased'>, string][] = [
    ['cancelled', 'the user changed their mind'],
    ['pending', 'Ask to Buy, SCA, a slow bank'],
    ['not-allowed', 'parental restriction or unsupported region'],
    ['failed', 'everything else'],
  ];

  it.each(cases)('reports %s (%s) rather than a generic failure', async (result) => {
    const { provider, calls } = harness(ok(), result);
    const outcome = await provider.buyDayPass('day-pass');

    expect(outcome).toEqual({ ok: false, reason: result });
    // Nothing was purchased, so nothing is re-read.
    expect(calls).toHaveLength(0);
  });

  it('does not read the SDK error object when a purchase throws', async () => {
    // The thrown value can carry the receipt and the store account identifier,
    // neither of which may reach a log or a user-facing message (CLAUDE.md §9).
    const { provider } = harness(ok(), new Error('receipt=MIIT... account=alice@icloud.com'));

    const outcome = await provider.startTrial('monthly');
    expect(outcome).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('restore', () => {
  it('asks the server after restoring, because the account is the truth', async () => {
    const { provider, sdk, calls } = harness(ok());
    expect(await provider.restore()).toEqual(serverState);
    expect(sdk.restores).toBe(1);
    expect(calls).toEqual(['/usage-quota']);
  });

  it('still asks the server when the local restore fails', async () => {
    // The entitlement may be on the account rather than in this device's
    // receipt cache — which is the exact case restore exists for.
    const calls: string[] = [];
    const client = new ApiClient({
      baseUrl: 'https://edge.test',
      getAccessToken: async () => 'jwt',
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return { ok: true, status: 200, json: async () => serverState };
      }) as unknown as typeof fetch,
    });
    const sdk: BillingSdkPort = {
      purchase: async () => 'failed',
      restorePurchases: async () => {
        throw new Error('no receipt on device');
      },
    };

    const provider = createBillingProvider({ client, sdk });
    expect(await provider.restore()).toEqual(serverState);
    expect(calls).toHaveLength(1);
  });
});
