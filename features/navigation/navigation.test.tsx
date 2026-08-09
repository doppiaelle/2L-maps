import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DeepLinkProvider, usePendingDeepLinkContext } from './deep-link-provider';
import { useLaunchDestination, useStoresHydrated } from './use-launch-destination';
import type { DeepLinkPort } from './use-pending-deep-link';
import { SessionProvider } from '@/features/auth/session-provider';
import type { AuthProvider, Session } from '@/lib/providers/types';

/**
 * The launch sequence, assembled.
 *
 * `decideLaunch` and `parseDeepLink` are proven as pure functions elsewhere.
 * What is proven here is the wiring around them, and specifically the two things
 * that only exist once React is involved: restoration ordering, and a deep link
 * that has to survive a sign-in it arrived before.
 */

const ROUTE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SESSION: Session = { userId: 'user-1', accessToken: 'jwt' };

/** An auth provider whose restoration the test controls, because the whole
 *  point of `isRestored` is what happens *before* it resolves. */
function deferredAuth(): {
  auth: AuthProvider;
  restore: (session: Session | null) => Promise<void>;
  emit: (session: Session | null) => Promise<void>;
} {
  let resolveSession: ((session: Session | null) => void) | null = null;
  const listeners: ((session: Session | null) => void)[] = [];

  return {
    auth: {
      currentSession: () =>
        new Promise<Session | null>((resolve) => {
          resolveSession = resolve;
        }),
      subscribe: (listener) => {
        listeners.push(listener);
        return () => undefined;
      },
      signIn: () => Promise.resolve({ ok: true }),
      signOut: () => Promise.resolve(),
    },
    // `act` is awaited, not merely called: resolving the promise schedules the
    // state update in a microtask, and a synchronous `act` returns before it
    // runs. The symptom is a passing test with an act warning beside it — the
    // kind of noise that trains everyone to ignore the warnings that matter.
    restore: async (session) => {
      await act(async () => {
        resolveSession?.(session);
      });
    },
    emit: async (session) => {
      await act(async () => {
        for (const listener of listeners) listener(session);
      });
    },
  };
}

const silentPort: DeepLinkPort = {
  getInitialURL: () => Promise.resolve(null),
  addEventListener: () => () => undefined,
};

function Probe({ isStoreHydrated = true }: { isStoreHydrated?: boolean }): React.JSX.Element {
  const pending = usePendingDeepLinkContext();
  const destination = useLaunchDestination({
    isStoreHydrated,
    hasRouteInProgress: false,
    pendingDeepLink: pending.target,
  });

  return (
    <Text testID="destination">
      {destination.kind}
      {destination.kind === 'plan' ? `:${destination.mode}:${destination.routeId ?? '-'}` : ''}
    </Text>
  );
}

const renderLaunch = (
  auth: AuthProvider | null,
  port: DeepLinkPort = silentPort,
  isStoreHydrated = true,
) =>
  render(
    <SessionProvider auth={auth}>
      <DeepLinkProvider port={port}>
        <Probe isStoreHydrated={isStoreHydrated} />
      </DeepLinkProvider>
    </SessionProvider>,
  );

const destinationText = () => screen.getByTestId('destination').props.children.join('');

describe('restoration', () => {
  it('holds the splash until the session has been read', async () => {
    // Rendering an empty Plan and swapping in the restored route afterwards is
    // a flash that reads as data loss (docs/10_NAVIGATION_FLOW.md §4).
    const { auth, restore } = deferredAuth();
    renderLaunch(auth);

    expect(destinationText()).toBe('hold-splash');

    await restore(SESSION);
    await waitFor(() => {
      expect(destinationText()).toBe('plan:draft:-');
    });
  });

  it('holds it while the stores are still loading, even with a session', async () => {
    // Both halves or neither: the session without the stores lands the user on
    // the right screen with the wrong contents (docs/10 §5).
    const { auth, restore } = deferredAuth();
    renderLaunch(auth, silentPort, false);
    await restore(SESSION);

    expect(destinationText()).toBe('hold-splash');
  });

  it('restores immediately when the build has no project configured', () => {
    // A missing configuration must not hang the app on a splash screen waiting
    // for a client that does not exist.
    renderLaunch(null);
    expect(destinationText()).toBe('sign-in');
  });

  it('does not miss a sign-in that completes before the first read returns', async () => {
    // The subscription is registered before `currentSession()` is awaited. The
    // other order leaves the app on sign-in holding a valid session.
    const { auth, emit } = deferredAuth();
    renderLaunch(auth);

    await emit(SESSION);
    await waitFor(() => {
      expect(destinationText()).toBe('plan:draft:-');
    });
  });
});

describe('a deep link arriving at launch', () => {
  it('is honoured once signed in', async () => {
    const { auth, restore } = deferredAuth();
    renderLaunch(auth, {
      getInitialURL: () => Promise.resolve(`twolmaps://route/${ROUTE_ID}`),
      addEventListener: () => () => undefined,
    });
    await restore(SESSION);

    await waitFor(() => {
      expect(destinationText()).toBe(`plan:opened-route:${ROUTE_ID}`);
    });
  });

  it('survives the sign-in it arrived before', async () => {
    // Discarding it makes the tap that opened the app look ignored (docs/10 §6).
    const { auth, restore, emit } = deferredAuth();
    renderLaunch(auth, {
      getInitialURL: () => Promise.resolve(`twolmaps://route/${ROUTE_ID}`),
      addEventListener: () => () => undefined,
    });

    await restore(null);
    await waitFor(() => {
      expect(destinationText()).toBe('sign-in');
    });

    await emit(SESSION);
    await waitFor(() => {
      expect(destinationText()).toBe(`plan:opened-route:${ROUTE_ID}`);
    });
  });

  it('ignores a link that is not ours', async () => {
    const { auth, restore } = deferredAuth();
    renderLaunch(auth, {
      getInitialURL: () => Promise.resolve('comgooglemaps://?daddr=Milano'),
      addEventListener: () => () => undefined,
    });
    await restore(SESSION);

    await waitFor(() => {
      expect(destinationText()).toBe('plan:draft:-');
    });
  });

  it('honours a link that arrives while the app is already running', async () => {
    let deliver: ((url: string) => void) | null = null;
    const { auth, restore } = deferredAuth();

    renderLaunch(auth, {
      getInitialURL: () => Promise.resolve(null),
      addEventListener: (listener) => {
        deliver = listener;
        return () => undefined;
      },
    });
    await restore(SESSION);

    await waitFor(() => {
      expect(destinationText()).toBe('plan:draft:-');
    });

    if (deliver === null) throw new Error('expected a listener');
    const publish = deliver as (url: string) => void;
    act(() => {
      publish('twolmaps://history');
    });

    await waitFor(() => {
      expect(destinationText()).toBe('history');
    });
  });
});

describe('waiting for the persisted stores', () => {
  const hydratable = (hydrated: boolean) => {
    const listeners: (() => void)[] = [];
    let isHydrated = hydrated;

    return {
      store: {
        persist: {
          hasHydrated: () => isHydrated,
          onFinishHydration: (listener: () => void) => {
            listeners.push(listener);
            return () => undefined;
          },
        },
      },
      finish: () => {
        isHydrated = true;
        act(() => {
          for (const listener of listeners) listener();
        });
      },
    };
  };

  function HydrationProbe({
    stores,
  }: {
    stores: readonly {
      persist: { hasHydrated: () => boolean; onFinishHydration: (l: () => void) => () => void };
    }[];
  }): React.JSX.Element {
    return <Text testID="hydrated">{String(useStoresHydrated(stores))}</Text>;
  }

  it('reports ready only when every store has finished', () => {
    const first = hydratable(false);
    const second = hydratable(false);
    const stores = [first.store, second.store];

    render(<HydrationProbe stores={stores} />);
    expect(screen.getByTestId('hydrated').props.children).toBe('false');

    first.finish();
    expect(screen.getByTestId('hydrated').props.children).toBe('false');

    second.finish();
    expect(screen.getByTestId('hydrated').props.children).toBe('true');
  });

  it('does not wait at all when everything was already loaded', () => {
    // A warm start hydrates in a microtask; adding a frame of splash to it
    // would be a delay bought for nothing (CLAUDE.md §6).
    render(<HydrationProbe stores={[hydratable(true).store]} />);
    expect(screen.getByTestId('hydrated').props.children).toBe('true');
  });
});
