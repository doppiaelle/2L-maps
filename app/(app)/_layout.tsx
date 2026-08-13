import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-provider';

/**
 * The signed-in group.
 *
 * **Authentication is a route guard; entitlement is not.** A lapsed or free user
 * reaches Plan, History and Settings normally — only metered actions are
 * blocked, and the paywall is presented over the screen rather than instead of
 * it ([ADR-0011](../../docs/adr/0011-server-side-quota-enforcement.md),
 * [`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §6). The
 * user's own data is never held hostage.
 *
 * **The guard fails closed** (docs/10 §10): no session, for any reason including
 * an error reading one, is treated as signed out.
 */
export default function AppLayout(): React.JSX.Element {
  const { session } = useSession();

  if (session === null) return <Redirect href="/sign-in" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
