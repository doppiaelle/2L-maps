import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-provider';

/**
 * The signed-out group.
 *
 * `(auth)` and `(app)` are mutually exclusive, and the guard **replaces** the
 * group rather than pushing a screen
 * ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §6): a push
 * would leave a signed-out screen sitting on top of app screens the user could
 * reach with the back gesture.
 *
 * By the time this renders, restoration is complete — the root layout holds the
 * splash until then — so a session here means the user really is signed in and
 * this group has nothing to show.
 */
export default function AuthLayout(): React.JSX.Element {
  const { session } = useSession();

  if (session !== null) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
