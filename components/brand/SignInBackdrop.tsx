import { Image, StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  BACKDROP_SCRIM_BOTTOM_FRACTION,
  BACKDROP_SCRIM_TOP_FRACTION,
  backdrop,
  colours,
} from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';

/**
 * The photograph the sign-in screen stands on.
 *
 * **The blur is in the asset, not at runtime.** The upper half of
 * `sign-in-backdrop.jpg` carries a graduated Gaussian that fades to nothing a
 * little past the midpoint, baked once at build time. A live blur would mean
 * `expo-blur` — a native module, and therefore the Android prebuild gate, on the
 * first screen of the app (`CLAUDE.md` §13 rule 1) — to re-compute a constant
 * every frame. Nothing about this blur ever changes, so nothing about it belongs
 * in a render.
 *
 * What is left to runtime is the part that does change: the theme. Three layers,
 * cheapest first — a flat tint that pulls the picture toward `bg`, then a
 * gradient at each end. The ends are where content sits: the wordmark at the top,
 * the sign-in controls in the lower third (`CLAUDE.md` §7 rule 2). The middle is
 * left as it was photographed, which is the only reason it is a photograph and
 * not a colour.
 *
 * **It is scenery and takes no touches.** `pointerEvents="none"` throughout: a
 * full-screen sibling that swallowed a press would leave the only button on the
 * screen dead in exactly the way nobody reports usefully.
 */
export function SignInBackdrop({ theme }: { readonly theme: ThemeName }): React.JSX.Element {
  const palette = colours[theme];
  const scrim = backdrop[theme];

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="sign-in-backdrop"
    >
      <Image
        source={require('../../assets/brand/sign-in-backdrop.jpg')}
        // `cover` on a portrait photograph in a portrait frame crops the sides
        // on a wide phone and the ends on a tall one. The subject — the
        // interchange — sits in the middle of both axes, so both crops keep it.
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.bg, opacity: scrim.tintOpacity },
        ]}
        testID="sign-in-backdrop-tint"
      />
      <Gradient
        colour={palette.bg}
        opacity={scrim.scrimTopOpacity}
        edge="top"
        fraction={BACKDROP_SCRIM_TOP_FRACTION}
      />
      <Gradient
        colour={palette.bg}
        opacity={scrim.scrimBottomOpacity}
        edge="bottom"
        fraction={BACKDROP_SCRIM_BOTTOM_FRACTION}
      />
    </View>
  );
}

/**
 * One end of the frame, fading to nothing.
 *
 * Drawn with `react-native-svg` rather than `expo-linear-gradient`, because the
 * project already carries the former for the route canvas and a second native
 * module for two rectangles would be a prebuild gate bought with scenery.
 */
function Gradient({
  colour,
  opacity,
  edge,
  fraction,
}: {
  readonly colour: string;
  readonly opacity: number;
  readonly edge: 'top' | 'bottom';
  readonly fraction: number;
}): React.JSX.Element {
  const id = `sign-in-scrim-${edge}`;
  const isTop = edge === 'top';
  const height: DimensionValue = `${fraction * 100}%`;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: isTop ? 0 : undefined,
        bottom: isTop ? undefined : 0,
        height,
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {/* Vertical: opaque at the screen edge, transparent at the inner one. */}
          <LinearGradient id={id} x1="0" y1={isTop ? '0' : '1'} x2="0" y2={isTop ? '1' : '0'}>
            <Stop offset="0" stopColor={colour} stopOpacity={opacity} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
