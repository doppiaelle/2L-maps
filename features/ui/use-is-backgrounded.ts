import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the app is off screen.
 *
 * **Nothing was ever asking.** `lib/ui/undo-window.ts` was written so an undo
 * window pauses while the app is backgrounded — a driver who is interrupted
 * mid-removal should not come back to find the toast gone and the stop with it —
 * and it is tested for exactly that. But `isBackgrounded` was never passed by
 * any screen, and `AppState` appeared nowhere in the app, so in production the
 * window ran down in the user's pocket. A rule with no caller is a rule that is
 * not in force.
 *
 * A hook rather than a provider: the undo toast is the only consumer, the
 * subscription is one listener, and a context for a single boolean would be
 * plumbing for its own sake.
 */
export function useIsBackgrounded(): boolean {
  const [isBackgrounded, setIsBackgrounded] = useState(() => AppState.currentState !== 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // `inactive` is iOS's transitional state — the app switcher, an incoming
      // call, the notification shade. It counts as off screen: the user cannot
      // read the toast, so the window they are being given has not started.
      setIsBackgrounded(state !== 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return isBackgrounded;
}
