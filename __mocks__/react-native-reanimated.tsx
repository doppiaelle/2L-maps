/* eslint-disable @typescript-eslint/no-explicit-any -- see the note below. */
import { View } from 'react-native';

/**
 * Reanimated under Jest.
 *
 * Written out rather than delegated to the package's own `mock.js`: that file
 * loads the real entry point in order to re-export its types, which pulls in
 * `react-native-worklets`' ESM build and fails under Jest's module runtime. A
 * mock that cannot be loaded is worse than none, because the failure looks like
 * a defect in the component.
 *
 * Only what the sheet uses is here, and the one that matters is **`runOnJS`**.
 * Under the real implementation it hands work to the JS thread through the
 * worklets runtime, which Jest never drives — so a callback from a gesture's
 * `onEnd` is scheduled and never runs, and a test asserting what the release did
 * would see nothing and pass for the wrong reason. Here it is the identity
 * function, which is what makes the sheet's velocity handling assertable.
 *
 * `withSpring` and `withTiming` return their target immediately. That is the
 * honest substitution: this environment can assert *where* an animation ends,
 * never how long it takes. The 300 ms detent budget needs hardware
 * ([ADR-0014](../docs/adr/0014-android-first-verification.md)) and is not
 * claimed to be covered.
 *
 * `any` is disabled for this file alone: a mock accepts whatever the real module
 * accepts, and restating those types would duplicate the SDK's surface.
 */

export const useSharedValue = <T,>(initial: T): { value: T } => ({ value: initial });

export const useAnimatedStyle = (factory: () => any): any => factory();

export const withSpring = <T,>(toValue: T): T => toValue;
export const withTiming = <T,>(toValue: T): T => toValue;
export const withDelay = <T,>(_delay: number, animation: T): T => animation;

export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);

export const runOnUI = runOnJS;

export const Easing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  inOut: (fn: (t: number) => number) => fn,
};

const AnimatedView = (props: any) => <View {...props} />;

const Animated = {
  View: AnimatedView,
  Text: AnimatedView,
  ScrollView: AnimatedView,
  createAnimatedComponent: (Component: any) => Component,
};

export default Animated;
