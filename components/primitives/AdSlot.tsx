import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { shouldShowAdSlot } from '@/lib/entitlement/plans';
import type { PlanAllowances } from '@/types';
import type { AdsProvider } from '@/lib/providers/types';

/**
 * The advertising slot.
 *
 * Three of [ADR-0015](../../docs/adr/0015-ad-supported-free-tier.md)'s rules are
 * enforced here rather than trusted to the screens that place it:
 *
 * **The space is reserved whether or not an ad fills it.** A banner that pops in
 * and reflows the list moves the row under a thumb that was already travelling
 * towards it — on a phone, one-handed, that is a mis-tap on somebody's delivery.
 * So the height is fixed from the first render and never changes.
 *
 * **Nothing renders during a route.** The user is driving (`CLAUDE.md` §7 rule
 * 8). This is a safety rule before it is a commercial one, which is why the
 * component checks it rather than assuming the screen did.
 *
 * **A failure is invisible.** No fill, no network, an SDK that throws — the slot
 * stays empty and the user continues. Their route does not depend on our ad
 * server being reachable.
 *
 * The decision of *whether* ads apply at all lives in `lib/entitlement/plans.ts`;
 * this component asks and renders (`CLAUDE.md` §1).
 */

/** Fixed, so the layout is identical before and after a fill. Chosen to match
 *  the standard banner rather than to be tuned per screen — a per-screen height
 *  would reintroduce the reflow this constant exists to prevent. */
export const AD_SLOT_HEIGHT = 50;

export interface AdSlotProps {
  readonly slot: 'stop-list' | 'result';
  readonly allowances: PlanAllowances;
  readonly isRouteInProgress: boolean;
  readonly ads: AdsProvider;
  readonly testID?: string;
}

export function AdSlot({
  slot,
  allowances,
  isRouteInProgress,
  ads,
  testID,
}: AdSlotProps): React.JSX.Element | null {
  const permitted = shouldShowAdSlot(allowances, { isRouteInProgress });
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!permitted) return undefined;

    let cancelled = false;
    void ads.loadBanner(slot).then((banner) => {
      // The screen may have unmounted, or a route may have started, while the
      // request was in flight. Setting state then would render an ad into a
      // context that has since become one where ads are forbidden.
      if (!cancelled) setFilled(banner !== null);
    });

    return () => {
      cancelled = true;
    };
  }, [ads, permitted, slot]);

  // A subscriber gets no slot at all — not an empty one. Reserving space for
  // something that can never appear is a gap they paid to remove.
  if (!permitted) return null;

  return (
    <View
      style={{ height: AD_SLOT_HEIGHT }}
      className="w-full items-center justify-center bg-surface"
      testID={testID}
      // Announced only once something is actually there. An empty reserved slot
      // is layout, and layout is not worth a screen reader's time.
      accessibilityElementsHidden={!filled}
      importantForAccessibility={filled ? 'yes' : 'no-hide-descendants'}
    >
      {filled && (
        <Text className="text-label-xs text-text-tertiary uppercase" accessibilityRole="text">
          Advertisement
        </Text>
      )}
    </View>
  );
}
