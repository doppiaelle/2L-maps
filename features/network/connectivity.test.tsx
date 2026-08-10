import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ConnectivityProvider, useConnectivity } from './connectivity-provider';
import type { ConnectivityPort, ConnectivitySnapshot } from '@/lib/network/connectivity';

/**
 * Connectivity is subscribed to rather than fetched, and these tests are about
 * the consequences of that: the first frame, the change that arrives during it,
 * and the build where nothing supplies it at all.
 */

const controllablePort = () => {
  let listener: ((snapshot: ConnectivitySnapshot) => void) | null = null;
  let unsubscribed = false;
  let resolveCurrent: (snapshot: ConnectivitySnapshot) => void = () => undefined;

  const port: ConnectivityPort = {
    subscribe: (next) => {
      listener = next;
      return () => {
        unsubscribed = true;
      };
    },
    current: () =>
      new Promise<ConnectivitySnapshot>((resolve) => {
        resolveCurrent = resolve;
      }),
  };

  return {
    port,
    emit: (snapshot: ConnectivitySnapshot) => listener?.(snapshot),
    settle: (snapshot: ConnectivitySnapshot) => {
      resolveCurrent(snapshot);
    },
    wasUnsubscribed: () => unsubscribed,
  };
};

function Probe(): React.JSX.Element {
  return <Text testID="probe">{useConnectivity()}</Text>;
}

const renderWith = (port: ConnectivityPort | null) =>
  render(
    <ConnectivityProvider port={port}>
      <Probe />
    </ConnectivityProvider>,
  );

describe('reporting connectivity', () => {
  it('starts unknown rather than guessing', async () => {
    const { port } = controllablePort();
    renderWith(port);
    expect(screen.getByTestId('probe').props.children).toBe('unknown');
  });

  it('subscribes before it reads, so nothing lands in the gap', async () => {
    // A change arriving between the subscribe and the first read would be lost
    // if the order were the other way round — the same ordering `SessionProvider`
    // uses, for the same reason.
    const { port, emit } = controllablePort();
    renderWith(port);

    await act(async () => {
      emit({ isConnected: false, isInternetReachable: false });
    });

    expect(screen.getByTestId('probe').props.children).toBe('offline');
  });

  it('follows the radio as it changes', async () => {
    const { port, emit, settle } = controllablePort();
    renderWith(port);

    await act(async () => {
      settle({ isConnected: true, isInternetReachable: true });
    });
    expect(screen.getByTestId('probe').props.children).toBe('online');

    await act(async () => {
      emit({ isConnected: true, isInternetReachable: false });
    });
    // Connected to the café wifi, signed in to nothing.
    expect(screen.getByTestId('probe').props.children).toBe('offline');
  });

  it('assumes online when nothing supplies connectivity', () => {
    // The same optimism the app had before this existed. A build with no port
    // must not disable search for ever.
    renderWith(null);
    expect(screen.getByTestId('probe').props.children).toBe('online');
  });

  it('unsubscribes when it goes away', () => {
    const { port, wasUnsubscribed } = controllablePort();
    const { unmount } = renderWith(port);

    unmount();
    expect(wasUnsubscribed()).toBe(true);
  });
});
