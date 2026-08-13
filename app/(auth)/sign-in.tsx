import { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';

import { useSession } from '@/features/auth/session-provider';
import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { useAppTheme } from '@/features/preferences/use-app-theme';
import { colours, layout, space } from '@/lib/design/tokens';

/**
 * Sign in.
 *
 * Apple and Google only ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md)
 * §6). No password to lose, no email to verify, and nothing for us to store: the
 * only identity this product keeps is the `user_id` the JWT already carries.
 *
 * **Apple is offered on iOS only**, because Sign in with Apple on Android is a
 * web flow that asks the user to type an Apple ID password on a phone they
 * probably did not buy from Apple — worse than the alternative sitting next to
 * it. App Review's equivalence requirement applies where Apple's own sheet is
 * available, which is the platform where it is shown.
 *
 * **A held deep link is named rather than swallowed.** Somebody who tapped a
 * route link and landed on a sign-in screen needs to be told the link survived,
 * or they will assume it did not (docs/10 §6).
 */
export default function SignInScreen(): React.JSX.Element {
  const { signIn } = useSession();
  const theme = useAppTheme();
  const palette = colours[theme];
  const { target } = usePendingDeepLinkContext();
  const [failure, setFailure] = useState<'unavailable' | 'failed' | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const attempt = (method: 'apple' | 'google') => {
    setFailure(null);
    setIsWorking(true);
    void signIn(method).then((outcome) => {
      setIsWorking(false);
      // A cancellation is the user changing their mind, and showing an error for
      // it is the app arguing with them.
      if (!outcome.ok && outcome.reason !== 'cancelled') setFailure(outcome.reason);
    });
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.bg,
        paddingHorizontal: layout.screenPadding,
        paddingTop: 64,
      }}
      testID="sign-in-screen"
    >
      <View style={{ alignItems: 'center', paddingHorizontal: space.space2 }}>
        <View
          style={{
            width: 128,
            height: 128,
            borderRadius: 64,
            backgroundColor: palette.accentSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={require('../../assets/brand/logo.png')}
            resizeMode="contain"
            style={{ width: 116, height: 88 }}
            accessibilityLabel="2L Maps mascot"
            testID="brand-logo"
          />
        </View>
        <Text
          style={{
            color: palette.textPrimary,
            fontSize: 38,
            lineHeight: 46,
            fontWeight: '700',
            marginTop: space.space6,
          }}
        >
          2L Maps
        </Text>
        <Text
          style={{
            color: palette.accent,
            fontSize: 17,
            lineHeight: 24,
            fontWeight: '700',
            marginTop: space.space1,
          }}
        >
          Get the fastest itinerary.
        </Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: 16,
            lineHeight: 24,
            textAlign: 'center',
            marginTop: space.space5,
          }}
        >
          Plan multiple stops.{'\n'}We automatically find the smartest order.
        </Text>

        {target !== null && (
          <Text
            style={{
              color: palette.textSecondary,
              fontSize: 13,
              textAlign: 'center',
              marginTop: space.space4,
            }}
          >
            {target.kind === 'route'
              ? 'Your route will open once you are signed in.'
              : 'You will continue where you were headed once you are signed in.'}
          </Text>
        )}
      </View>

      <View
        style={{
          marginTop: space.space7,
          padding: space.space3,
          borderRadius: 20,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: 16,
            fontWeight: '700',
            marginBottom: space.space3,
          }}
        >
          Welcome back
        </Text>
        {failure !== null && (
          <Text
            style={{ color: palette.danger, fontSize: 13, marginBottom: space.space2 }}
            accessibilityLiveRegion="polite"
          >
            {failure === 'unavailable'
              ? 'Sign-in is not available in this build.'
              : 'Sign-in did not complete. Check your connection and try again.'}
          </Text>
        )}

        {/* The controls sit in the lower third, reachable one-handed
          (CLAUDE.md §7 rule 2). */}
        {Platform.OS === 'ios' && (
          <SignInButton
            label="Continue with Apple"
            onPress={() => {
              attempt('apple');
            }}
            isWorking={isWorking}
            isPrimary
            theme={theme}
          />
        )}
        <SignInButton
          label="Continue with Google"
          onPress={() => {
            attempt('google');
          }}
          isWorking={isWorking}
          isPrimary={Platform.OS !== 'ios'}
          theme={theme}
        />
      </View>
      <Text
        style={{
          color: palette.textTertiary,
          fontSize: 14,
          textAlign: 'center',
          marginTop: space.space6,
        }}
      >
        Your routes, ordered for less driving.
      </Text>
    </View>
  );
}

function SignInButton({
  label,
  onPress,
  isWorking,
  isPrimary,
  theme,
}: {
  label: string;
  onPress: () => void;
  isWorking: boolean;
  isPrimary: boolean;
  theme: 'light' | 'dark';
}): React.JSX.Element {
  const palette = colours[theme];
  return (
    <Pressable
      onPress={onPress}
      disabled={isWorking}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isWorking, busy: isWorking }}
      style={{
        minHeight: 54,
        borderRadius: 16,
        marginTop: space.space2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isPrimary ? palette.textPrimary : palette.surfaceRaised,
        borderWidth: isPrimary ? 0 : 1,
        borderColor: palette.border,
        opacity: isWorking ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          color: isPrimary ? palette.bg : palette.textPrimary,
          fontSize: 16,
          fontWeight: '700',
        }}
      >
        {label === 'Continue with Google' ? `G   ${label}` : label}
      </Text>
    </Pressable>
  );
}
