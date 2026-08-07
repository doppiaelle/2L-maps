import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '../global.css';

/**
 * Root layout.
 *
 * Composition only — no business logic, no fetching (CLAUDE.md §1). Providers
 * and the entitlement guard arrive in wave 3 and wave 5 respectively; guards
 * resolve before the first render rather than redirecting after it, so no screen
 * the user is not entitled to see is ever briefly visible.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
