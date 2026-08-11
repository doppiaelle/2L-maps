/**
 * React Native Testing Library v13 registers its matchers on import, so no
 * extend-expect entry point is needed.
 *
 * The clock is mocked, never the function under test (CLAUDE.md §5). Coordinate
 * expiry is a 30-day boundary (ADR-0007), so tests that touch it set a
 * deterministic now rather than relying on the wall clock.
 */
import '@testing-library/react-native';

/**
 * Gesture handler, completed.
 *
 * `jest-expo` already mocks this library, and its `Gesture` object carries
 * `Pan` and nothing else — so a component that merely *renders* a
 * `GestureDetector` with a pinch throws, and a whole map's worth of tests fails
 * for a reason that has nothing to do with the map.
 *
 * This mocks **the platform, never the thing under test** (`CLAUDE.md` §5). The
 * decisions a gesture leads to are pure and are proven in
 * `lib/map/viewport.test.ts` — what happens to the viewport under a pinch, a
 * drag and a double tap, and that the tap inverse is exact. What is left here is
 * a builder shaped like the real one so that rendering works, and it deliberately
 * simulates nothing: a test that asserted a pinch through this double would be
 * asserting the double.
 */
jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');

  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      'onBegin',
      'onStart',
      'onChange',
      'onUpdate',
      'onEnd',
      'onFinalize',
      'numberOfTaps',
      'enabled',
      'minDistance',
      'maxDuration',
    ]) {
      chain[method] = () => chain;
    }
    return chain;
  };

  return {
    ...actual,
    // A pass-through: the real detector inspects the gesture object it is given,
    // and a double that satisfied that inspection would be most of the library.
    // It renders its children and recognises nothing, which is exactly what a
    // test of *what the canvas draws* needs from it.
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: {
      ...actual.Gesture,
      Pan: builder,
      Pinch: builder,
      Tap: builder,
      Simultaneous: builder,
      Exclusive: builder,
      Race: builder,
    },
  };
});
