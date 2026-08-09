import { createContext, useContext } from 'react';

import { usePendingDeepLink } from './use-pending-deep-link';
import type { DeepLinkPort, PendingDeepLink } from './use-pending-deep-link';

/**
 * The held deep link, shared by the layouts that have to honour it.
 *
 * It lives in the root layout because that is the only place that outlives the
 * group swap: a link arriving while signed out has to survive sign-in and
 * resolve afterwards ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md)
 * §6), and a hook called inside `(auth)` would unmount along with it.
 */

const DeepLinkContext = createContext<PendingDeepLink | null>(null);

export interface DeepLinkProviderProps {
  readonly port: DeepLinkPort | null;
  readonly children: React.ReactNode;
}

export function DeepLinkProvider({ port, children }: DeepLinkProviderProps): React.JSX.Element {
  const pending = usePendingDeepLink(port);
  return <DeepLinkContext.Provider value={pending}>{children}</DeepLinkContext.Provider>;
}

export function usePendingDeepLinkContext(): PendingDeepLink {
  const value = useContext(DeepLinkContext);
  if (value === null) throw new Error('usePendingDeepLinkContext needs a DeepLinkProvider');
  return value;
}
