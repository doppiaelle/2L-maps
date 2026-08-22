import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from './session-provider';
import { GoogleMark } from '@/components/brand/GoogleMark';
import { SignInBackdrop } from '@/components/brand/SignInBackdrop';
import { usePendingDeepLinkContext } from '@/features/navigation/deep-link-provider';
import { useAppTheme } from '@/features/preferences/use-app-theme';
import { brandLogo, colours, elevPill, layout, radius, space, text } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * Sign in.
 *
 * Apple and Google only ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md)
 * §8). No password to lose, no email to verify, and nothing for us to store: the
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
 *
 * **The composition is two blocks and the air between them.** Identity at the
 * top, over the quiet end of the photograph; the controls in the lower third,
 * where a thumb reaches without the phone changing hands (`CLAUDE.md` §7 rule 2).
 * Nothing sits in the middle, because the middle of a phone screen is the part a
 * one-handed grip cannot comfortably reach and the part of this picture that has
 * something to look at.
 */
export function SignInScreen(): React.JSX.Element {
  const { signIn, signUp } = useSession();
  const theme = useAppTheme();
  const palette = colours[theme];
  const insets = useSafeAreaInsets();
  const { target } = usePendingDeepLinkContext();
  const [failure, setFailure] = useState<'unavailable' | 'failed' | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

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
    <View style={{ flex: 1, backgroundColor: palette.bg }} testID="sign-in-screen">
      <SignInBackdrop theme={theme} />

      {/* Scrolls only when it has to. At 200% Dynamic Type the wordmark and two
          buttons no longer fit a small screen, and a layout that cannot scroll
          truncates instead of reflowing (`CLAUDE.md` §10 rule 5). */}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: layout.screenPadding,
          paddingTop: insets.top + space.space7,
          paddingBottom: insets.bottom + space.space5,
        }}
        alwaysBounceVertical={false}
      >
        <View style={{ alignItems: 'center' }}>
          <Image
            source={require('../../assets/brand/logo.png')}
            resizeMode="contain"
            style={{ width: brandLogo.width, aspectRatio: brandLogo.aspectRatio }}
            // Decorative: the wordmark directly below says the same word, and a
            // screen reader that reads both says the name twice.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="brand-logo"
          />
          <Text
            accessibilityRole="header"
            style={{
              color: palette.textPrimary,
              fontSize: text.display.size,
              lineHeight: text.display.lineHeight,
              fontWeight: text.display.weight,
              letterSpacing: (text.display.tracking / 100) * text.display.size,
              marginTop: space.space5,
              textAlign: 'center',
            }}
          >
            2L Maps
          </Text>
          {/* `body`, not `title-md`: the tagline is a sentence, and the title
              voice at 17/600 both crowds the wordmark above it and is wide
              enough to wrap on a 360 pt Android phone — where it would break
              after "More", leaving one word on a line of its own. */}
          <Text
            style={{
              color: palette.textSecondary,
              fontSize: text.body.size,
              lineHeight: text.body.lineHeight,
              fontWeight: text.body.weight,
              marginTop: space.space3,
              textAlign: 'center',
            }}
          >
            Smart routes. Less time. More freedom.
          </Text>
        </View>

        {/* The air. It is what puts the controls in the lower third on a tall
            screen and collapses first on a short one. */}
        <View style={{ flexGrow: 1, minHeight: space.space6 }} />

        <View>
          {target !== null && (
            <Text
              style={{
                color: palette.textSecondary,
                fontSize: text.caption.size,
                lineHeight: text.caption.lineHeight,
                textAlign: 'center',
                marginBottom: space.space3,
              }}
            >
              {target.kind === 'route'
                ? 'Your route will open once you are signed in.'
                : 'You will continue where you were headed once you are signed in.'}
            </Text>
          )}

          {failure !== null && (
            <Text
              style={{
                color: palette.danger,
                fontSize: text.caption.size,
                lineHeight: text.caption.lineHeight,
                textAlign: 'center',
                marginBottom: space.space3,
              }}
              accessibilityLiveRegion="polite"
            >
              {failure === 'unavailable'
                ? 'Sign-in is not available in this build.'
                : 'Sign-in did not complete. Check your connection and try again.'}
            </Text>
          )}

          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={palette.textSecondary}
            accessibilityLabel="Email"
            style={{ backgroundColor: palette.surface, color: palette.textPrimary, borderRadius: radius.radiusLg, paddingHorizontal: space.space4, minHeight: layout.actionMinHeight, marginTop: space.space3 }}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={palette.textSecondary}
            accessibilityLabel="Password"
            style={{ backgroundColor: palette.surface, color: palette.textPrimary, borderRadius: radius.radiusLg, paddingHorizontal: space.space4, minHeight: layout.actionMinHeight, marginTop: space.space3 }}
          />
          <SignInButton
            label={mode === 'sign-up' ? 'Create account' : 'Sign in'}
            onPress={() => {
              setFailure(null);
              setIsWorking(true);
              const action = mode === 'sign-up' ? signUp({ email: email.trim(), password }) : signIn('email', { email: email.trim(), password });
              void action.then((outcome) => {
                setIsWorking(false);
                if (!outcome.ok) setFailure(outcome.reason);
              });
            }}
            isWorking={isWorking}
            isPrimary
            theme={theme}
            testID="sign-in-email"
          />
          <Pressable onPress={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')} accessibilityRole="button">
            <Text style={{ color: palette.textSecondary, textAlign: 'center', marginTop: space.space3 }}>
              {mode === 'sign-up' ? 'Already have an account? Sign in' : 'Need an account? Register'}
            </Text>
          </Pressable>

          {Platform.OS === 'ios' && (
            <SignInButton
              label="Continue with Apple"
              onPress={() => {
                attempt('apple');
              }}
              isWorking={isWorking}
              isPrimary
              theme={theme}
              testID="sign-in-apple"
            />
          )}
          <SignInButton
            label="Continue with Google"
            onPress={() => {
              attempt('google');
            }}
            isWorking={isWorking}
            isPrimary={false}
            theme={theme}
            mark={<GoogleMark size={space.space5} />}
            testID="sign-in-google"
          />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * One provider, one button.
 *
 * The card shape is this system's, not the provider's: `radius-lg` — the radius
 * of a primary action (docs/07 §8) — a `surface` fill and a soft lift, so the two
 * buttons read as one row of the same product rather than two vendors' widgets
 * stacked. The only thing borrowed is the mark itself.
 *
 * The lift is not decoration. This control floats over a photograph, and a border
 * on a photograph is another line in the picture; a shadow is the only thing that
 * reads as *above* it.
 */
function SignInButton({
  label,
  onPress,
  isWorking,
  isPrimary,
  theme,
  mark,
  testID,
}: {
  readonly label: string;
  onPress: () => void;
  readonly isWorking: boolean;
  readonly isPrimary: boolean;
  readonly theme: ThemeName;
  readonly mark?: React.ReactNode;
  readonly testID: string;
}): React.JSX.Element {
  const palette = colours[theme];

  return (
    <Pressable
      onPress={onPress}
      disabled={isWorking}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Announced rather than only drawn, so a screen reader user knows the
      // control is busy instead of tapping it again (`CLAUDE.md` §10 rule 7).
      accessibilityState={{ disabled: isWorking, busy: isWorking }}
      testID={testID}
      style={{
        minHeight: layout.actionMinHeight,
        borderRadius: radius.radiusLg,
        marginTop: space.space3,
        paddingHorizontal: space.space4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.space3,
        backgroundColor: isPrimary ? palette.textPrimary : palette.surface,
        opacity: isWorking ? 0.6 : 1,
        ...elevPill,
      }}
    >
      {isWorking ? (
        <ActivityIndicator
          color={isPrimary ? palette.bg : palette.textPrimary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        mark
      )}
      <Text
        style={{
          color: isPrimary ? palette.bg : palette.textPrimary,
          fontSize: text.bodyStrong.size,
          lineHeight: text.bodyStrong.lineHeight,
          fontWeight: text.bodyStrong.weight,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
