import type { AdConsentState, AdsProvider, RewardedOutcome } from '@/lib/providers/types';

/**
 * The concrete `AdsProvider`.
 *
 * Two invariants shape everything here, and both are enforced by this module
 * rather than trusted to call sites.
 *
 * **Nothing reaches the SDK before consent exists.** Not a banner request, not
 * an initialisation. In the EEA a Google-certified CMP owns the answer and
 * ePrivacy requires consent for the device storage the SDK uses *even for
 * non-personalised ads* (docs/32_LEGAL_COMPLIANCE.md). An SDK that is asked for
 * a banner has already written to storage, so "ask, then decide" is too late —
 * the check has to come first, here.
 *
 * **Nothing fails loudly.** No fill, no network, an SDK that throws — all of it
 * resolves to an outcome the caller continues from. A user's route does not
 * depend on our ad server being reachable, and a rewarded unlock is granted
 * when the ad could not be shown, because charging someone for our fill rate is
 * indefensible ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md) rule 6).
 *
 * Note what this interface cannot express: there is no parameter here that
 * accepts a coordinate, an address, a `place_id` or a route. That is
 * `CLAUDE.md` §9 rule 7 made structural — a call site cannot leak what it
 * cannot pass.
 */

/** The slice of the ad SDK and its consent platform that this adapter needs. */
export interface AdsSdkPort {
  /** Current consent as the CMP reports it. It can change outside the app —
   *  a user may revoke in system settings — so it is read, never cached. */
  consentStatus: () => Promise<AdConsentState>;
  /** Present the CMP's own form. Returns the resulting state. */
  showConsentForm: () => Promise<AdConsentState>;
  /** Null when nothing filled. */
  loadBanner: (slot: string) => Promise<{ readonly height: number } | null>;
  /** Resolves once the rewarded view ends, either way. */
  showRewarded: () => Promise<'watched' | 'dismissed'>;
}

export interface AdsAdapterOptions {
  readonly sdk: AdsSdkPort;
}

export function createAdsProvider(options: AdsAdapterOptions): AdsProvider {
  const { sdk } = options;

  const currentConsent = async (): Promise<AdConsentState> => {
    try {
      return await sdk.consentStatus();
    } catch {
      // A CMP we cannot reach has not granted anything. Treating an error as
      // `not-asked` keeps the gate closed, which is the only safe direction.
      return 'not-asked';
    }
  };

  return {
    consent: currentConsent,

    requestConsent: async () => {
      try {
        return await sdk.showConsentForm();
      } catch {
        return 'not-asked';
      }
    },

    loadBanner: async (slot) => {
      // The gate. `not-asked` is not a soft no — it is the state in which the
      // SDK must not run at all.
      if ((await currentConsent()) === 'not-asked') return null;

      try {
        return await sdk.loadBanner(slot);
      } catch {
        // The slot was laid out before this call and stays laid out, empty. A
        // banner that pops in and reflows the list moves the row under the
        // user's thumb, which is why the space is reserved either way.
        return null;
      }
    },

    showRewarded: async (): Promise<RewardedOutcome> => {
      if ((await currentConsent()) === 'not-asked') return 'unavailable';

      try {
        return await sdk.showRewarded();
      } catch {
        // Reported as `unavailable`, never as `dismissed`. The distinction is
        // the user's money: `dismissed` withholds the unlock, `unavailable`
        // grants it, and an SDK crash is not a decision the user made.
        return 'unavailable';
      }
    },
  };
}
