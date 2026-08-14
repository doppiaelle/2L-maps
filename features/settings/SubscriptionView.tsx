import { Pressable, ScrollView, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { fallbackAllowances } from '@/lib/entitlement/plans';
import type { PlanAllowances, PlanTier } from '@/types';

export interface SubscriptionViewProps {
  readonly currentPlan: PlanTier;
  readonly currentAllowances: PlanAllowances;
  readonly selectedPlan: PlanTier;
  onBack: () => void;
  onChoosePlan: (plan: PlanTier) => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

/** Plan comparison backed by the same fallback values used by entitlement UI.
 * Store purchase controls intentionally stay disabled until a BillingProvider
 * is composed at runtime: selecting a card may never grant access locally. */
export function SubscriptionView({
  currentPlan,
  currentAllowances,
  selectedPlan,
  onBack,
  onChoosePlan,
  theme,
  testID,
}: SubscriptionViewProps): React.JSX.Element {
  const palette = colours[theme];
  const selectedIsCurrent = selectedPlan === currentPlan;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: layout.screenPadding,
        paddingBottom: space.space7,
      }}
      showsVerticalScrollIndicator={false}
      testID={testID}
    >
      <View
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.space3 }}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}
          testID="subscription-back"
        >
          <Text style={{ color: palette.textPrimary, fontSize: 28, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{ color: palette.textPrimary, fontSize: 22, lineHeight: 28, fontWeight: '700' }}
        >
          Subscription
        </Text>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 30,
          lineHeight: 36,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Choose your plan
      </Text>
      <Text style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 21 }}>
        Compare route, search and History allowances.
      </Text>

      <View style={{ marginTop: space.space5, gap: space.space3 }} accessibilityRole="radiogroup">
        {PLAN_ORDER.map((plan) => {
          const selected = selectedPlan === plan;
          const current = currentPlan === plan;
          const allowances = current ? currentAllowances : fallbackAllowances(plan);

          return (
            <Pressable
              key={plan}
              onPress={() => onChoosePlan(plan)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${labelOf(plan)} plan${current ? ', current plan' : ''}`}
              style={{
                padding: space.space4,
                borderRadius: radius.radiusLg,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? palette.accent : palette.border,
                backgroundColor: selected ? palette.accentSubtle : palette.surface,
              }}
              testID={`subscription-plan-${plan}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{
                    flex: 1,
                    color: selected ? palette.accent : palette.textPrimary,
                    fontSize: 20,
                    fontWeight: '700',
                  }}
                >
                  {labelOf(plan)}
                </Text>
                {current && (
                  <View
                    style={{
                      paddingHorizontal: space.space2,
                      paddingVertical: space.space1,
                      borderRadius: radius.radiusFull,
                      backgroundColor: palette.textPrimary,
                    }}
                  >
                    <Text style={{ color: palette.bg, fontSize: 11, fontWeight: '700' }}>
                      CURRENT
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{
                  color: palette.textSecondary,
                  fontSize: 14,
                  lineHeight: 21,
                  marginTop: space.space2,
                }}
              >
                {allowanceCopy(plan, allowances)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          marginTop: space.space5,
          padding: space.space4,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
        testID="subscription-status"
      >
        <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '700' }}>
          {selectedIsCurrent ? 'This is your current plan' : 'Purchases are coming soon'}
        </Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: 14,
            lineHeight: 20,
            marginTop: space.space1,
          }}
        >
          {selectedIsCurrent
            ? 'Your live allowance is always verified by the server.'
            : 'Plan selection is ready; store checkout will appear here once billing is connected.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const PLAN_ORDER: readonly PlanTier[] = ['free', 'day-pass', 'pro'];

function labelOf(plan: PlanTier): string {
  if (plan === 'day-pass') return 'Day pass';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function allowanceCopy(plan: PlanTier, allowances: PlanAllowances): string {
  const period = plan === 'day-pass' ? 'in 24 hours' : 'per month';
  return `${allowances.maxStopsPerRoute} stops · ${allowances.optimizationsPerPeriod} optimizations ${period} · Full History`;
}
