/* eslint-disable @typescript-eslint/no-explicit-any -- see the note below. */
import { View } from 'react-native';

/**
 * `react-native-gesture-handler` under Jest.
 *
 * Two reasons this file exists, and the second is the interesting one.
 *
 * **It has to.** The real package imports React Native's deprecated Switch spec,
 * and the codegen Babel plugin bundled with `babel-preset-expo` fails to parse
 * it — the suite dies at transform time, before a single line of ours runs. A
 * native module mocked under Jest is expected (`CLAUDE.md` §5: mock the network,
 * the map, the clock; never the function under test).
 *
 * **It makes the gesture testable rather than merely absent.** `Gesture.Pan()`
 * records the handlers it is given and hands them back through
 * `lastPanGesture()`, so a test can deliver a synthetic release and assert what
 * the component did with it. That matters here specifically: the pan reports
 * velocity positive when the finger moves *down*, while the snapping function
 * takes it positive when the sheet *grows*, and getting that inversion wrong
 * produces a sheet that closes when you flick it open. Without this, the only
 * way to catch it would be a thumb on a physical device.
 *
 * What is still not covered, and is not pretended to be: the gesture actually
 * running on the UI thread, and the 300 ms budget. Both need hardware
 * ([ADR-0014](../docs/adr/0014-android-first-verification.md)).
 *
 * `any` is disabled for this file alone: a mock accepts whatever the real
 * component accepts, and restating those types would duplicate the SDK surface.
 */

export interface RecordedPan {
  start: (event: any) => void;
  update: (event: any) => void;
  end: (event: any) => void;
}

let recorded: RecordedPan | null = null;

/** The most recently constructed pan gesture, or null if none was built. */
export const lastPanGesture = (): RecordedPan | null => recorded;

export const resetGestures = (): void => {
  recorded = null;
};

const noop = () => undefined;

class PanGestureMock {
  private handlers: RecordedPan = { start: noop, update: noop, end: noop };

  constructor() {
    recorded = this.handlers;
  }

  onStart(handler: (event: any) => void) {
    this.handlers.start = handler;
    return this;
  }

  onUpdate(handler: (event: any) => void) {
    this.handlers.update = handler;
    return this;
  }

  onEnd(handler: (event: any) => void) {
    this.handlers.end = handler;
    return this;
  }
}

export const Gesture = {
  Pan: () => new PanGestureMock(),
};

export function GestureDetector({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <>{children}</>;
}

export function GestureHandlerRootView(props: any): React.JSX.Element {
  return <View {...props} />;
}

export const Directions = { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 };
export const State = { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 };
