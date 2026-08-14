import { Pressable, ScrollView, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { NavigationProviderId, PlanTier } from '@/types';

export interface SettingsViewProps {
  readonly provider: NavigationProviderId;
  readonly currentPlan: PlanTier;
  onBack: () => void;
  onChooseProvider: (provider: NavigationProviderId) => void;
  onOpenSubscription: () => void;
  onSignOut: () => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

export function SettingsView({
  provider,
  currentPlan,
  onBack,
  onChooseProvider,
  onOpenSubscription,
  onSignOut,
  theme,
  testID,
}: SettingsViewProps): React.JSX.Element {
  const palette = colours[theme];

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
          accessibilityLabel="Back to route"
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
          testID="settings-back"
        >
          <Text style={{ color: palette.textPrimary, fontSize: 28, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{ color: palette.textPrimary, fontSize: 22, lineHeight: 28, fontWeight: '700' }}
        >
          Settings
        </Text>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 24,
          lineHeight: 30,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Subscription
      </Text>
      <Pressable
        onPress={onOpenSubscription}
        accessibilityRole="button"
        accessibilityLabel={`Open subscription plans. Current plan: ${planLabel(currentPlan)}`}
        style={{
          minHeight: 64,
          marginTop: space.space3,
          paddingHorizontal: space.space4,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        testID="settings-subscription"
      >
        <View>
          <Text style={{ color: palette.textTertiary, fontSize: 11, fontWeight: '700' }}>
            CURRENT PLAN
          </Text>
          <Text
            style={{
              color: palette.textPrimary,
              fontSize: 16,
              fontWeight: '700',
              marginTop: space.space1,
            }}
          >
            {planLabel(currentPlan)}
          </Text>
        </View>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.radiusMd,
            backgroundColor: palette.textPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.bg, fontSize: 22, fontWeight: '700' }}>→</Text>
        </View>
      </Pressable>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 30,
          lineHeight: 36,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Navigation
      </Text>
      <Text style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 21 }}>
        Choose which navigator opens after you confirm.
      </Text>

      <View
        style={{
          marginTop: space.space4,
          padding: space.space3,
          borderRadius: radius.radiusLg,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
        testID="settings-provider-list"
      >
        <Text style={{ color: palette.textSecondary, fontSize: 13, fontWeight: '700' }}>
          PREFERRED NAVIGATOR
        </Text>

        <View style={{ marginTop: space.space3, gap: space.space2 }} accessibilityRole="radiogroup">
          {PROVIDERS.map((item) => {
            const selected = provider === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => onChooseProvider(item.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Use ${item.label}`}
                style={{
                  minHeight: 46,
                  paddingHorizontal: space.space4,
                  borderRadius: radius.radiusMd,
                  borderWidth: selected ? 0 : 1,
                  borderColor: palette.border,
                  backgroundColor: selected ? palette.accent : palette.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                testID={`settings-provider-${item.value}`}
              >
                <Text
                  style={{
                    color: selected ? palette.accentOn : palette.textPrimary,
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
                  {item.label}
                </Text>
                {selected && (
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: palette.textPrimary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: palette.accent,
                      }}
                    />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text
        style={{
          color: palette.textPrimary,
          fontSize: 24,
          lineHeight: 30,
          fontWeight: '700',
          marginTop: space.space6,
        }}
      >
        Account
      </Text>
      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityHint="Signs you out on this device. Your saved routes stay in your account."
        style={{
          minHeight: 50,
          marginTop: space.space3,
          borderRadius: radius.radiusLg,
          backgroundColor: theme === 'light' ? '#EFEFED' : palette.surfaceRaised,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="settings-sign-out"
      >
        <Text style={{ color: '#B95656', fontSize: 15, fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const PROVIDERS: readonly { label: string; value: NavigationProviderId }[] = [
  { label: 'Google Maps', value: 'google-maps' },
  { label: 'Apple Maps', value: 'apple-maps' },
  { label: 'Waze', value: 'waze' },
];

function planLabel(plan: PlanTier): string {
  if (plan === 'day-pass') return 'Day pass';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}
