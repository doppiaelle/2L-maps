import { Redirect } from 'expo-router';

/**
 * Where Google sends the user back to.
 *
 * **It exists so the router has somewhere to put the redirect.** Sign-in opens
 * an authentication session and waits for `twolmaps://auth-callback`;
 * `openAuthSessionAsync` intercepts that URL and returns it to the caller, but
 * Android *also* delivers it as an intent, because the scheme is registered to
 * this app. Without a route of that name the router had nowhere to go and
 * rendered its unmatched-route screen — which is the error that appeared after
 * a successful sign-in, on top of a session that had in fact been established.
 * Restarting the app revealed it, which is exactly what a user would report as
 * "it errored but then I was logged in".
 *
 * There is nothing to do here. The code has already been exchanged by the time
 * this renders — that happens in `createAuthProvider`, on the value the browser
 * returned — so this only has to send the user where they were going. The root
 * layout's guard then decides whether that is Plan or the sign-in screen, which
 * is the one place that decision belongs.
 */
export default function AuthCallbackScreen(): React.JSX.Element {
  return <Redirect href="/" />;
}
