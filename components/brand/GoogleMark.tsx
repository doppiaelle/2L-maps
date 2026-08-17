import Svg, { Path } from 'react-native-svg';

import { brandMarks } from '@/lib/design/tokens';

/**
 * Google's G, drawn.
 *
 * A vector rather than a bundled PNG, for the reason every other mark in this
 * app is a vector: it is scaled by Dynamic Type
 * ([`docs/23_ACCESSIBILITY.md`](../../docs/23_ACCESSIBILITY.md) — layouts reflow
 * to 200%), and a raster at one density is soft at every other. It also weighs
 * nothing and needs no `@2x`/`@3x` set.
 *
 * **It is drawn and never recoloured.** The four fills come from `brandMarks`,
 * which sits outside `ColourTokens` precisely so that a provider's palette cannot
 * leak into a system with one accent (`CLAUDE.md` §8 rule 2). A monochrome or
 * mint-tinted G would also be a use Google's brand terms do not permit.
 *
 * **Decorative by default.** The button beside it already says "Continue with
 * Google", and a screen reader that announces the mark as well says the word
 * twice (`CLAUDE.md` §10 rule 1).
 */
export function GoogleMark({ size }: { readonly size: number }): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        fill={brandMarks.googleBlue}
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill={brandMarks.googleGreen}
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill={brandMarks.googleYellow}
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill={brandMarks.googleRed}
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}
