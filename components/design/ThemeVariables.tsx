import { vars } from 'nativewind';
import { View } from 'react-native';

import { cssVariables } from '@/lib/design/tailwind-theme';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * Binds the active palette to the colour variables every class name reads.
 *
 * **Without this, colour classes have no values at all.** `colourScale()` maps
 * `text-primary` to `var(--colour-text-primary)`; something has to say what that
 * variable is, and nothing did. `cssVariables()` was written to provide exactly
 * this and was never called from anywhere — so `colourScale()` emitted light
 * literals instead, and dark mode rendered `#111112` text on `#0B0B0C`.
 *
 * It wraps rather than configures because that is how CSS variables work in
 * NativeWind: they inherit down the tree from the element that declares them, so
 * this has to sit above every screen. One instance, at the root.
 *
 * **The theme is passed in, not read here.** This component has no opinion about
 * whether the user follows the system or has chosen a theme — that decision
 * belongs to whoever owns the preference, and reading `useColorScheme` here
 * would quietly override it.
 */

export interface ThemeVariablesProps {
  readonly theme: ThemeName;
  readonly children: React.ReactNode;
}

export function ThemeVariables({ theme, children }: ThemeVariablesProps): React.JSX.Element {
  return (
    <View style={[{ flex: 1 }, vars(cssVariables()[theme])]} testID="theme-variables">
      {children}
    </View>
  );
}
