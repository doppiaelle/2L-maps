import type { AdConsentState } from '@/lib/providers/types';

import { createAdsProvider } from './ads-adapter';
import type { AdsSdkPort } from './ads-adapter';

/**
 * Two things are being tested, and both are legal or ethical rather than
 * functional: the SDK must not run before consent, and a failure on our side
 * must never cost the user anything.
 */

const stub = (overrides: Partial<AdsSdkPort> = {}) => {
  const calls: string[] = [];
  const sdk: AdsSdkPort = {
    consentStatus: overrides.consentStatus ?? (async () => 'personalised'),
    showConsentForm: overrides.showConsentForm ?? (async () => 'personalised'),
    loadBanner:
      overrides.loadBanner ??
      (async (slot) => {
        calls.push(`banner:${slot}`);
        return { height: 50 };
      }),
    showRewarded:
      overrides.showRewarded ??
      (async () => {
        calls.push('rewarded');
        return 'watched';
      }),
  };
  return { provider: createAdsProvider({ sdk }), calls };
};

describe('nothing reaches the SDK before consent', () => {
  it('does not request a banner while consent has not been asked', async () => {
    // Too late is the point: an SDK asked for a banner has already written to
    // device storage, which is what ePrivacy requires consent for — even for
    // non-personalised ads.
    const { provider, calls } = stub({ consentStatus: async () => 'not-asked' });

    expect(await provider.loadBanner('stop-list')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('does not show a rewarded ad while consent has not been asked', async () => {
    const { provider, calls } = stub({ consentStatus: async () => 'not-asked' });

    expect(await provider.showRewarded()).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('runs once consent exists, personalised or not', async () => {
    for (const state of ['personalised', 'non-personalised'] as const) {
      const { provider, calls } = stub({ consentStatus: async () => state });
      await provider.loadBanner('result');
      expect(calls).toEqual(['banner:result']);
    }
  });

  it('treats an unreachable consent platform as no consent', async () => {
    // A CMP we cannot reach has not granted anything. Erring closed is the only
    // safe direction here.
    const { provider, calls } = stub({
      consentStatus: async () => {
        throw new Error('CMP unavailable');
      },
    });

    expect(await provider.loadBanner('stop-list')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('re-reads consent rather than caching it', async () => {
    // A user can revoke in system settings, outside the app's flow.
    let state: AdConsentState = 'personalised';
    const { provider } = stub({ consentStatus: async () => state });

    expect(await provider.loadBanner('stop-list')).not.toBeNull();
    state = 'not-asked';
    expect(await provider.loadBanner('stop-list')).toBeNull();
  });
});

describe('our failures never cost the user', () => {
  it('leaves the reserved slot empty when nothing fills', async () => {
    // The space is laid out either way. A banner that pops in and reflows the
    // list moves the row under the user's thumb.
    const { provider } = stub({ loadBanner: async () => null });
    expect(await provider.loadBanner('stop-list')).toBeNull();
  });

  it('leaves the slot empty when the SDK throws', async () => {
    const { provider } = stub({
      loadBanner: async () => {
        throw new Error('ad network exploded');
      },
    });
    expect(await provider.loadBanner('result')).toBeNull();
  });

  it('reports a broken rewarded ad as unavailable, never as dismissed', async () => {
    // The distinction is the user's money: `dismissed` withholds the unlock,
    // `unavailable` grants it, and an SDK crash is not a decision they made
    // (ADR-0015 rule 6).
    const { provider } = stub({
      showRewarded: async () => {
        throw new Error('no fill');
      },
    });
    expect(await provider.showRewarded()).toBe('unavailable');
  });

  it('still reports a genuine dismissal as a dismissal', async () => {
    const { provider } = stub({ showRewarded: async () => 'dismissed' });
    expect(await provider.showRewarded()).toBe('dismissed');
  });
});

describe('the consent form', () => {
  it('returns what the user chose', async () => {
    const { provider } = stub({ showConsentForm: async () => 'non-personalised' });
    expect(await provider.requestConsent()).toBe('non-personalised');
  });

  it('reports a form that failed to present as still not asked', async () => {
    const { provider } = stub({
      showConsentForm: async () => {
        throw new Error('form failed to load');
      },
    });
    expect(await provider.requestConsent()).toBe('not-asked');
  });
});
