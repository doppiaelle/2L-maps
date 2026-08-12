import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '@/features/stores';
import type { ThemeName } from '@/lib/design/tokens';

/** Resolves the persisted Light / System / Dark choice in one place. */
export function useAppTheme(): ThemeName {
  const systemTheme = useColorScheme();
  const preference = usePreferencesStore((store) => store.preferences.theme);

  if (preference !== null) return preference;
  return systemTheme === 'dark' ? 'dark' : 'light';
}
