import { Pressable, Text, View } from 'react-native';

import { colours, layout, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import { estimatedHandoffCount, requiresCoordinates } from '@/lib/handoff/capabilities';
import type { NavigationProviderId } from '@/types';

/**
 * Choosing which app the route is handed to.
 *
 * Presented on the first handoff, and reachable from Settings afterwards
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §6).
 *
 * **The providers are not equivalent, and the screen says so before the choice
 * rather than after it.** Only Google Maps carries multiple waypoints; Waze
 * takes one stop at a time and needs coordinates
 * ([ADR-0004](../../docs/adr/0004-external-navigation-handoff.md)). A user who
 * picks Waze for a twelve-stop day should learn it means twelve handoffs *here*,
 * not on the road.
 *
 * **Only installed providers are offered.** A row that opens nothing is worse
 * than a row that is absent, and on iOS the list can only ever be a subset of
 * what was declared at build time.
 */

export interface ProviderPickerViewProps {
  readonly available: readonly NavigationProviderId[];
  readonly selected: NavigationProviderId | null;
  /** How many stops the route has, so the cost of each provider is concrete
   *  rather than described in the abstract. */
  readonly stopCount: number;
  readonly remember: boolean;
  onRememberChange: (remember: boolean) => void;
  onChoose: (provider: NavigationProviderId) => void;
  readonly theme: ThemeName;
  readonly testID?: string;
}

const PROVIDER_NAME: Readonly<Record<NavigationProviderId, string>> = {
  'google-maps': 'Google Maps',
  waze: 'Waze',
  'apple-maps': 'Apple Maps',
};

export function ProviderPickerView({
  available,
  selected,
  stopCount,
  remember,
  onRememberChange,
  onChoose,
  theme,
  testID,
}: ProviderPickerViewProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.bg, padding: layout.screenPadding }}
      testID={testID}
    >
      <Text accessibilityRole="header" className="text-title-md text-text-primary">
        Navigate with
      </Text>
      <Text className="text-body text-text-secondary mt-space-2">
        2L Maps plans the order. Your navigation app drives it.
      </Text>

      {available.length === 0 ? (
        // Not a blank list: a device with no navigation app installed is a real
        // state, and the user needs to know that is what happened.
        <Text className="text-body text-text-secondary mt-space-5" testID="provider-none">
          No navigation app was found on this device. Install Google Maps or Waze and come back.
        </Text>
      ) : (
        <View style={{ marginTop: space.space4 }}>
          {available.map((provider) => (
            <ProviderRow
              key={provider}
              provider={provider}
              isSelected={provider === selected}
              stopCount={stopCount}
              onChoose={onChoose}
              theme={theme}
            />
          ))}
        </View>
      )}

      {/* A toggle of our own rather than React Native's `Switch`. Two reasons,
          and the second is the one that decided it: the platform control cannot
          be rendered under this project's Jest setup at all — its deprecated
          Android spec fails codegen and takes the suite with it — and a control
          that cannot be tested has no business on the one screen that decides
          where a driver's day is sent. Ours also carries the label the design
          system asks for and states its own role. */}
      <Pressable
        onPress={() => {
          onRememberChange(!remember);
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: remember }}
        accessibilityLabel="Always use this app without asking again"
        className="flex-row items-center justify-between"
        style={{ marginTop: space.space5, minHeight: layout.touchMin }}
        testID="provider-remember"
      >
        <Text className="text-body text-text-primary flex-1">Always use this app</Text>
        <View
          style={{
            width: 51,
            height: 31,
            borderRadius: radius.radiusFull,
            backgroundColor: remember ? palette.accent : palette.border,
            justifyContent: 'center',
            paddingHorizontal: 3,
            alignItems: remember ? 'flex-end' : 'flex-start',
          }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <View
            style={{
              width: 25,
              height: 25,
              borderRadius: radius.radiusFull,
              backgroundColor: palette.surface,
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}

function ProviderRow({
  provider,
  isSelected,
  stopCount,
  onChoose,
  theme,
}: {
  provider: NavigationProviderId;
  isSelected: boolean;
  stopCount: number;
  onChoose: (provider: NavigationProviderId) => void;
  theme: ThemeName;
}): React.JSX.Element {
  const palette = colours[theme];
  const name = PROVIDER_NAME[provider];
  // `estimatedHandoffCount` counts *intermediate* stops: the last one is the
  // destination, not a waypoint. Passing the total here would overstate every
  // provider by one interruption.
  const handoffs = estimatedHandoffCount(provider, Math.max(0, stopCount - 1));

  // The honest sentence, computed rather than written per provider: one handoff
  // is "the whole route", more than one is a number the user should see now.
  const cost =
    handoffs <= 1
      ? 'Takes the whole route at once'
      : `${handoffs} handoffs — it takes one stop at a time`;

  // The caveat that actually bites: Waze takes `ll=lat,lng` and no address, so a
  // stop whose coordinate has expired cannot be handed to it at all (ADR-0007).
  // Not-chunking is already said above, in plain numbers.
  const caveat = requiresCoordinates(provider)
    ? 'Needs a location we can still resolve for every stop'
    : null;

  return (
    <Pressable
      onPress={() => {
        onChoose(provider);
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${name}. ${cost}`}
      style={{
        minHeight: layout.actionMinHeight,
        justifyContent: 'center',
        paddingHorizontal: space.space4,
        marginBottom: space.space2,
        borderRadius: radius.radiusMd,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? palette.accent : palette.border,
      }}
      testID="provider-option"
    >
      <Text className="text-body-strong text-text-primary">{name}</Text>
      <Text className="text-caption text-text-secondary">{cost}</Text>
      {caveat !== null && (
        <Text className="text-caption text-warning" testID="provider-caveat">
          {caveat}
        </Text>
      )}
    </Pressable>
  );
}
