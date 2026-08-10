import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MonetisationProvider, useMonetisation } from './monetisation-provider';
import { useOffers } from '@/features/billing/use-offers';
import type { AdsProvider, BillingProvider } from '@/lib/providers/types';

/**
 * Billing and advertising are both absent, and these tests are about absence
 * being a supported state rather than a branch nobody exercises.
 *
 * The screens that touch them have to work with no RevenueCat project and no
 * AdMob account, because that is every build today and will be every build a
 * developer holds for some time after that.
 */

let queryClient: QueryClient | null = null;

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

const stubBilling = (): BillingProvider => ({
  currentState: async () => ({
    status: 'none',
    plan: 'free',
    trialEndsAt: null,
    renewsAt: null,
    dayPassExpiresAt: null,
  }),
  startTrial: async () => ({ ok: true }),
  buyDayPass: async () => ({ ok: true }),
  restore: async () => ({
    status: 'none',
    plan: 'free',
    trialEndsAt: null,
    renewsAt: null,
    dayPassExpiresAt: null,
  }),
});

const stubAds = (): AdsProvider => ({
  consent: async () => 'not-asked',
  requestConsent: async () => 'non-personalised',
  loadBanner: async () => null,
  showRewarded: async () => 'unavailable',
});

function Probe(): React.JSX.Element {
  const { billing, ads } = useMonetisation();
  const offers = useOffers();

  return (
    <Text testID="probe">
      {JSON.stringify({
        hasBilling: billing !== null,
        hasAds: ads !== null,
        dayPass: offers.dayPass,
        subscription: offers.subscription,
        isPurchasing: offers.isPurchasing,
      })}
    </Text>
  );
}

const renderProbe = async (props: Parameters<typeof MonetisationProvider>[0] | null = null) => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MonetisationProvider billing={props?.billing ?? null} ads={props?.ads ?? null}>
        <Probe />
      </MonetisationProvider>
    </QueryClientProvider>,
  );

  await act(async () => undefined);
  return result;
};

describe('with nothing configured', () => {
  it('reports both as absent rather than throwing on first use', async () => {
    // A stub that throws would move the failure to whichever screen happened to
    // touch it first, which is the opposite of a supported state.
    await renderProbe();
    const state = screen.getByTestId('probe').props.children as string;

    expect(state).toContain('"hasBilling":false');
    expect(state).toContain('"hasAds":false');
  });

  it('offers no product, so no button can fail on tap', async () => {
    // A price shown here that the store would not charge is the worst bug this
    // screen can have (docs/26_APP_STORE.md).
    await renderProbe();
    const state = screen.getByTestId('probe').props.children as string;

    expect(state).toContain('"dayPass":null');
    expect(state).toContain('"subscription":null');
  });

  it('does not sit in a purchasing state nobody can leave', async () => {
    await renderProbe();
    expect(screen.getByTestId('probe').props.children).toContain('"isPurchasing":false');
  });
});

describe('once something is configured', () => {
  it('passes the providers through unchanged', async () => {
    // The seam is the whole deliverable: the day the accounts exist, one adapter
    // is written and handed in here.
    await renderProbe({ billing: stubBilling(), ads: stubAds(), children: null });
    const state = screen.getByTestId('probe').props.children as string;

    expect(state).toContain('"hasBilling":true');
    expect(state).toContain('"hasAds":true');
  });
});
