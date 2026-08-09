import { useCallback, useEffect, useState } from 'react';

import { isWorthLogging, parseDeepLink } from '@/lib/navigation/deep-links';
import type { DeepLinkTarget } from '@/lib/navigation/deep-links';

/**
 * The deep link waiting to be resolved, if any.
 *
 * It is *held* rather than acted on immediately, because a link can arrive
 * before the app is in a position to honour it — signed out, or with a route in
 * progress that outranks it ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md)
 * §6 and §9 row 7). Discarding it in those moments makes the tap that opened the
 * app look ignored.
 *
 * The linking API arrives injected, in the same style as `NavigationProvider`'s
 * `LinkingPort`: every launch scenario is then reachable in a test, including
 * the cold start with an initial URL, which is otherwise a device-only path.
 */

export interface DeepLinkPort {
  /** The URL that launched the app, or null for an ordinary launch. */
  getInitialURL: () => Promise<string | null>;
  /** Links arriving while the app is already running. Returns an unsubscribe. */
  addEventListener: (listener: (url: string) => void) => () => void;
}

export interface PendingDeepLink {
  readonly target: DeepLinkTarget | null;
  /** Called once the link has been honoured. Not clearing it would re-navigate
   *  on every render that consults it. */
  clear: () => void;
}

export function usePendingDeepLink(port: DeepLinkPort | null): PendingDeepLink {
  const [target, setTarget] = useState<DeepLinkTarget | null>(null);

  const consider = useCallback((url: string) => {
    const resolution = parseDeepLink(url);

    if (resolution.ok) {
      setTarget(resolution.target);
      return;
    }

    // Every failure lands on Plan, which is where the app was going anyway.
    // Only one of them is worth recording: a link of ours that did not parse is
    // a defect or an attempt, while somebody else's URL is noise.
    if (isWorthLogging(resolution.reason)) {
      console.warn(`[deep-link] unparseable link, reason=${resolution.reason}`);
    }
  }, []);

  useEffect(() => {
    if (port === null) return undefined;

    let cancelled = false;

    void port.getInitialURL().then((url) => {
      if (cancelled || url === null) return;
      consider(url);
    });

    const unsubscribe = port.addEventListener((url) => {
      if (!cancelled) consider(url);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [port, consider]);

  const clear = useCallback(() => {
    setTarget(null);
  }, []);

  return { target, clear };
}
