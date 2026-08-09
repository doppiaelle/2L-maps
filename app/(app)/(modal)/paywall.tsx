import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import { PaywallView } from '@/features/billing/PaywallView';
import { useUsageQuota } from '@/features/quota/use-usage-quota';

/**
 * The paywall — modal, and **not dismissible by swipe**
 * ([`docs/10_NAVIGATION_FLOW.md`](../../../docs/10_NAVIGATION_FLOW.md) §6). It
 * needs a deliberate answer, and the route survives underneath either way.
 *
 * The offers come from the store through `BillingProvider`; until a RevenueCat
 * project exists there are none to show, and the screen says what it can rather
 * than inventing prices — a price shown here and a price charged by the store
 * disagreeing is the worst possible bug on this screen.
 */
export default function PaywallScreen(): React.JSX.Element {
  const scheme = useColorScheme();
  const { quota } = useUsageQuota();

  return (
    <PaywallView
      reason={quota === null ? 'chosen' : 'quota-exhausted'}
      // Null until the billing SDK is configured. Rendering a row with no
      // product behind it would give the user a button that fails on tap.
      dayPass={null}
      subscription={null}
      isTrialAvailable={quota?.trialEndsAt === null}
      isPurchasing={false}
      onBuy={() => undefined}
      onContinueFree={() => {
        router.back();
      }}
      theme={scheme === 'dark' ? 'dark' : 'light'}
      testID="paywall-screen"
    />
  );
}
