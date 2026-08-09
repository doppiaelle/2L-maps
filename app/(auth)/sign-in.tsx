import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useSession } from '@/features/auth/session-provider';
import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { layout, radius, space } from '@/lib/design/tokens';

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
    <View className="flex-1 bg-bg justify-end px-screen-padding pb-space-8">
      <View className="flex-1 justify-center">
        <Text className="text-title-lg text-text-primary">2L Maps</Text>
        <Text className="text-body text-text-secondary mt-space-2">
          Plan a day of stops in the order that actually saves time.
        </Text>

        {target !== null && (
          <Text className="text-caption text-text-secondary mt-space-4">
            {target.kind === 'route'
              ? 'Your route will open once you are signed in.'
              : 'You will continue where you were headed once you are signed in.'}
          </Text>
        )}
      </View>

      {failure !== null && (
        <Text className="text-caption text-danger mb-space-3" accessibilityLiveRegion="polite">
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
        />
      )}
      <SignInButton
        label="Continue with Google"
        onPress={() => {
          attempt('google');
        }}
        isWorking={isWorking}
        isPrimary={Platform.OS !== 'ios'}
      />
    </View>
  );
}

function SignInButton({
  label,
  onPress,
  isWorking,
  isPrimary,
}: {
  label: string;
  onPress: () => void;
  isWorking: boolean;
  isPrimary: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={isWorking}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isWorking, busy: isWorking }}
      className={`items-center justify-center ${isPrimary ? 'bg-accent' : 'bg-surface-raised border border-border'}`}
      style={{
        minHeight: layout.actionMinHeight,
        borderRadius: radius.radiusLg,
        marginTop: space.space3,
        opacity: isWorking ? 0.6 : 1,
      }}
    >
      <Text className={`text-body-strong ${isPrimary ? 'text-accent-on' : 'text-text-primary'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
