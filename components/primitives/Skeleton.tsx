import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { motion } from '@/lib/design/tokens';

/**
 * A placeholder that matches what it replaces.
 *
 * Dimensions included. A skeleton that differs from the real content causes
 * layout shift when the data lands, which is worse than a spinner: the user
 * watches the interface settle after they thought it had arrived
 * ([`docs/09_COMPONENT_LIBRARY.md`](../../docs/09_COMPONENT_LIBRARY.md) §8).
 *
 * **Reduce Motion drops the shimmer entirely**, leaving a static block
 * (`CLAUDE.md` §10 rule 6). The shimmer is decoration; nothing about "this is
 * loading" depends on it, which is exactly the test for whether an animation may
 * be removed.
 *
 * The animation is `Animated` with `useNativeDriver`, not Reanimated: it is a
 * single opacity loop with no gesture attached, and it must not occupy the JS
 * thread while a list is scrolling.
 */

export interface SkeletonProps {
  readonly height: number;
  /** Defaults to filling its parent, which is what a row-shaped skeleton wants. */
  readonly width?: number | `${number}%`;
  readonly radius?: number;
  readonly prefersReducedMotion?: boolean;
  readonly testID?: string;
}

export function Skeleton({
  height,
  width = '100%',
  radius = 8,
  prefersReducedMotion = false,
  testID,
}: SkeletonProps): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (prefersReducedMotion) {
      // Reset rather than freeze wherever the loop happened to be: a skeleton
      // stopped mid-fade reads as a half-loaded thing rather than a placeholder.
      opacity.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: motion.sheet,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.sheet,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [opacity, prefersReducedMotion]);

  return (
    // Hidden from the accessibility tree: the container announces that it is
    // loading once, and a screen reader walking eight identical placeholders
    // learns nothing from the eighth.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Animated.View
        className="bg-surface-raised"
        style={{ height, width, borderRadius: radius, opacity }}
        testID="skeleton-block"
      />
    </View>
  );
}
