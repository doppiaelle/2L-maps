import { Text, View } from 'react-native';

import { colours, layout, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * The Google attribution.
 *
 * Always visible, never covered by the sheet at any detent, never dismissible.
 * This is a terms obligation, not a design element
 * ([`docs/32_LEGAL_COMPLIANCE.md`](../../docs/32_LEGAL_COMPLIANCE.md)): it has to
 * appear wherever the map or its data appears, including in a shared snapshot.
 *
 * It takes `bottomOffset` rather than deciding its own position, because what it
 * must clear is the sheet — whose height only the screen knows. Given `0` it
 * sits at the bottom of the map, which is correct when there is no sheet over it.
 *
 * Hidden from screen readers on purpose: it is a legal notice aimed at the eye,
 * it is present on every screen, and announcing it would put it between the user
 * and the map summary on every focus pass.
 */

export interface MapAttributionProps {
  readonly theme: ThemeName;
  /** Points of screen the sheet covers at its current detent. */
  readonly bottomOffset: number;
  readonly testID?: string;
}

export function MapAttribution({
  theme,
  bottomOffset,
  testID,
}: MapAttributionProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      pointerEvents="none"
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: layout.screenPadding,
        bottom: bottomOffset + space.space2,
      }}
    >
      <Text
        style={{
          color: palette.textSecondary,
          fontSize: 11,
          // A pill behind the text, because the base map underneath it changes
          // as the user pans and a bare label eventually lands on something it
          // cannot be read against — which is the one failure mode a
          // non-dismissible legal notice may not have.
          backgroundColor: palette.surface,
          paddingHorizontal: space.space2,
          paddingVertical: space.space1 / 2,
          borderRadius: space.space1,
          overflow: 'hidden',
        }}
      >
        © Google
      </Text>
    </View>
  );
}
