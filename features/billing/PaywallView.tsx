import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { DAY_PASS_DURATION_HOURS, TRIAL_DURATION_DAYS } from '@/types';

/**
 * The paywall.
 *
 * Three rungs, presented as a choice rather than a wall
 * ([ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)): free with ads, a
 * day pass for the driver who needs today solved, and a subscription for the one
 * who works this way every day.
 *
 * **Guideline 3.1.2 is the reason for the wording, and the wording is the whole
 * risk.** Every paid row states its price, its period, and — for the trial —
 * that it converts, before the control that starts it
 * ([`docs/26_APP_STORE.md`](../../docs/26_APP_STORE.md)). A trial disclosure
 * that has to be scrolled to is the single most likely cause of rejection, so
 * the disclosure sits above the button rather than beneath it.
 *
 * **Declining costs nothing.** The free plan stays usable and is offered here as
 * a row, not as a dismissal — a paywall whose only way out is a close button
 * teaches the user that the product is a negotiation.
 */

export interface PaywallOffer {
  readonly id: string;
  readonly title: string;
  /** Already localised by the billing SDK; this screen never formats money. */
  readonly price: string;
  readonly detail: string;
}

export interface PaywallViewProps {
  /** Why the paywall appeared, stated first. A user who tapped Optimize and got
   *  a price list deserves to be told which limit they met. */
  readonly reason: 'quota-exhausted' | 'stops-exceeded' | 'chosen';
  readonly dayPass: PaywallOffer | null;
  readonly subscription: PaywallOffer | null;
  readonly isTrialAvailable: boolean;
  readonly isPurchasing: boolean;
  onBuy: (offerId: string) => void;
  onContinueFree: () => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

const REASON_TEXT: Readonly<Record<PaywallViewProps['reason'], string>> = {
  'quota-exhausted': 'You have used this month’s optimizations.',
  'stops-exceeded': 'This route has more stops than your plan covers.',
  chosen: 'More stops, more optimizations, no ads.',
};

export function PaywallView({
  reason,
  dayPass,
  subscription,
  isTrialAvailable,
  isPurchasing,
  onBuy,
  onContinueFree,
  theme,
  testID,
}: PaywallViewProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg, padding: layout.screenPadding }}
      testID={testID}
    >
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        Keep going
      </Text>
      <Text className="text-body text-text-secondary mt-space-2" testID="paywall-reason">
        {REASON_TEXT[reason]}
      </Text>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        {dayPass !== null && (
          <Offer
            offer={dayPass}
            disclosure={`One payment. Covers the next ${DAY_PASS_DURATION_HOURS} hours. Does not renew.`}
            onBuy={onBuy}
            isPurchasing={isPurchasing}
            theme={theme}
            testID="paywall-day-pass"
          />
        )}

        {subscription !== null && (
          <Offer
            offer={subscription}
            // Above the control, never below it. A trial disclosure that has to
            // be scrolled to is the most likely cause of App Review rejection
            // (docs/26_APP_STORE.md).
            disclosure={
              isTrialAvailable
                ? `Free for ${TRIAL_DURATION_DAYS} days, then ${subscription.price} a month. It renews automatically until you cancel, and you can cancel any time in your account settings.`
                : `${subscription.price} a month. It renews automatically until you cancel.`
            }
            onBuy={onBuy}
            isPurchasing={isPurchasing}
            theme={theme}
            testID="paywall-subscription"
          />
        )}
      </View>

      {/* A row, not a dismissal. A paywall whose only way out is a close button
          teaches the user that the product is a negotiation (ADR-0015 rule 5). */}
      <Pressable
        onPress={onContinueFree}
        accessibilityRole="button"
        accessibilityLabel="Continue on the free plan, with ads"
        style={{
          minHeight: layout.touchMin,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: space.space3,
        }}
        testID="paywall-free"
      >
        <Text className="text-body text-text-secondary">Continue free, with ads</Text>
      </Pressable>
    </View>
  );
}

function Offer({
  offer,
  disclosure,
  onBuy,
  isPurchasing,
  theme,
  testID,
}: {
  offer: PaywallOffer;
  disclosure: string;
  onBuy: (offerId: string) => void;
  isPurchasing: boolean;
  theme: ThemeName;
  testID: string;
}): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View style={{ marginBottom: space.space5 }} testID={testID}>
      <Text className="text-body-strong text-text-primary">{offer.title}</Text>
      <Text className="text-caption text-text-secondary mt-space-1">{offer.detail}</Text>

      {/* The terms come before the button, in the reading order and in the
          accessibility order. Both matter, and only one of them is visible. */}
      <Text className="text-caption text-text-secondary mt-space-2" testID={`${testID}-terms`}>
        {disclosure}
      </Text>

      <Pressable
        onPress={() => {
          onBuy(offer.id);
        }}
        disabled={isPurchasing}
        accessibilityRole="button"
        // The label carries the price and the terms, because a screen reader
        // user hears the button without having read what sits above it.
        accessibilityLabel={`${offer.title}, ${offer.price}. ${disclosure}`}
        accessibilityState={{ disabled: isPurchasing, busy: isPurchasing }}
        style={{
          minHeight: layout.actionMinHeight,
          marginTop: space.space3,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isPurchasing ? 0.6 : 1,
        }}
      >
        <Text className="text-body-strong text-accent-on">{offer.price}</Text>
      </Pressable>
    </View>
  );
}
