import { createContext, useContext, useEffect, useState } from 'react';

import {
  connectivityOf,
  type Connectivity,
  type ConnectivityPort,
} from '@/lib/network/connectivity';

/**
 * Whether the network can be reached, held once for the whole tree.
 *
 * Like the session, this is **subscribed to rather than fetched**: signal comes
 * and goes without anyone asking, and a value read once at mount would be wrong
 * by the time a driver reaches the first delivery.
 *
 * Every screen that changes behaviour offline reads it from here rather than
 * asking separately, so the map, the search field and the sheet cannot disagree
 * about whether there is a network — three components each saying something
 * different about the same radio is worse than none of them saying anything.
 */

const ConnectivityContext = createContext<Connectivity>('unknown');

export interface ConnectivityProviderProps {
  /** Null when nothing supplies connectivity — a test that does not care, or a
   *  build where the module is absent. Everything then reads `online`, which is
   *  the same optimism the app had before this existed. */
  readonly port: ConnectivityPort | null;
  readonly children: React.ReactNode;
}

export function ConnectivityProvider({
  port,
  children,
}: ConnectivityProviderProps): React.JSX.Element {
  const [connectivity, setConnectivity] = useState<Connectivity>('unknown');

  useEffect(() => {
    if (port === null) return undefined;

    let cancelled = false;

    // Subscribed *before* the first read, so a change that lands in the gap
    // between the two is not missed — the same ordering `SessionProvider` uses,
    // and for the same reason.
    const unsubscribe = port.subscribe((snapshot) => {
      if (!cancelled) setConnectivity(connectivityOf(snapshot));
    });

    void port.current().then((snapshot) => {
      if (!cancelled) setConnectivity(connectivityOf(snapshot));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [port]);

  return (
    <ConnectivityContext.Provider value={port === null ? 'online' : connectivity}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): Connectivity {
  return useContext(ConnectivityContext);
}
