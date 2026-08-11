import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { HistoryView } from './HistoryView';
import { useOpenRoute } from './use-open-route';
import { useRouteSync } from './use-route-sync';
import { useSavedRoutes } from './use-saved-routes';
import { ServicesProvider } from '@/features/api/services-provider';
import { SessionProvider } from '@/features/auth/session-provider';
import { useDraftRouteStore, useRouteProgressStore } from '@/features/stores';
import type { AuthProvider } from '@/lib/providers/types';
import type { RouteStatus, SavedRouteSummary } from '@/lib/route/persistence';
import type { RoutesProvider, SaveOutcome } from '@/lib/supabase/routes-adapter';
import type { Stop } from '@/types';

/**
 * Route persistence, from the screen down.
 *
 * The properties worth protecting are the ones a user only discovers by losing
 * something: a route that reaches History, a route that comes back with the
 * progress it had, an error that is reported as an error rather than as an empty
 * list, and a write that does not fire on every keystroke.
 */

const SESSION = { userId: 'user-1', accessToken: 'jwt' };

const auth: AuthProvider = {
  currentSession: () => Promise.resolve(SESSION),
  subscribe: () => () => undefined,
  signIn: () => Promise.resolve({ ok: true }),
  signOut: () => Promise.resolve(),
};

const summary = (overrides: Partial<SavedRouteSummary> = {}): SavedRouteSummary => ({
  routeId: 'route-1',
  name: null,
  status: 'completed' as RouteStatus,
  stopCount: 12,
  isDegraded: false,
  distanceMeters: 42_000,
  durationSeconds: 3_600,
  updatedAt: '2026-08-04T09:30:00.000Z',
  ...overrides,
});

const stop = (id: string, position: number): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  placeText: null,
  note: null,
  position,
  entryOrder: position,
  coordinate: null,
  isCompleted: false,
});

const fakeRoutes = (overrides: Partial<RoutesProvider> = {}) => {
  const saves: unknown[] = [];
  const provider: RoutesProvider = {
    save: async (write) => {
      saves.push(write);
      return { ok: true } as SaveOutcome;
    },
    list: async () => [],
    load: async () => null,
    advance: async () => ({ ok: true }) as SaveOutcome,
    ...overrides,
  };
  return { provider, saves };
};

let queryClient: QueryClient | null = null;

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
  useDraftRouteStore.getState().reset('draft');
  useRouteProgressStore.getState().abandon();
});

const renderWithServices = async (routes: RoutesProvider, ui: React.ReactElement) => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider auth={auth}>
        <ServicesProvider
          baseUrl="https://example.test/functions/v1"
          routes={routes}
          favourites={{ list: async () => null, recordUse: async () => undefined }}
        >
          {ui}
        </ServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

  // Twice: the session resolves, then the queries it unblocked do.
  await act(async () => undefined);
  await act(async () => undefined);
  return result;
};

// ─── The list ────────────────────────────────────────────────────────────────

describe('what History shows', () => {
  const noop = () => undefined;

  const renderHistory = (props: Partial<Parameters<typeof HistoryView>[0]> = {}) =>
    render(
      <HistoryView
        routes={[summary()]}
        locked={[]}
        isLoading={false}
        isUnavailable={false}
        onOpen={noop}
        onRetry={noop}
        onUpgrade={noop}
        onDismiss={noop}
        theme="light"
        {...props}
      />,
    );

  it('names a route nobody named by the day it was worked', () => {
    renderHistory();
    expect(screen.getByText(/4 Aug · 12 stops/)).toBeTruthy();
  });

  it('keeps a T0 route labelled degraded for ever', () => {
    // `is_degraded` is stored rather than derived precisely so a degraded result
    // never comes back from History looking like a traffic-aware one.
    renderHistory({ routes: [summary({ isDegraded: true })] });
    // The chip's own text is hidden from the accessibility tree — it announces
    // as one utterance through its container — so it has to be asked for
    // explicitly here.
    expect(
      screen.getByText('Estimated without traffic', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('distinguishes a failed read from an empty history', () => {
    // "You have never saved a route" is a lie the user cannot argue with, and
    // only one of the two states has anything to retry.
    renderHistory({ routes: [], isUnavailable: true });
    expect(screen.getByTestId('history-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('history-empty')).toBeNull();
  });

  it('offers an empty history a way back rather than a dead end', () => {
    renderHistory({ routes: [] });
    expect(screen.getByTestId('history-empty')).toBeTruthy();
    expect(screen.getByTestId('state-action')).toBeTruthy();
  });

  it('shows routes over the allowance as locked rather than hiding them', () => {
    // They are the user's own work. Hiding them would be the product deleting a
    // driver's records in order to sell them back (ADR-0015).
    renderHistory({ locked: [summary({ routeId: 'route-2' }), summary({ routeId: 'route-3' })] });
    expect(screen.getByTestId('history-locked')).toBeTruthy();
    expect(screen.getByText(/2 older routes are saved/)).toBeTruthy();
  });

  it('says nothing about locked routes when there are none', () => {
    renderHistory();
    expect(screen.queryByTestId('history-locked')).toBeNull();
  });

  it('announces a row as one thing, not as three', () => {
    // A screen reader walking a name, a distance and a duration separately
    // cannot tell where one route ends and the next begins.
    renderHistory({ routes: [summary({ isDegraded: true })] });
    const row = screen.getByTestId('history-row');
    expect(row.props.accessibilityLabel).toContain('estimated without traffic');
    expect(row.props.accessibilityLabel).toContain('12 stops');
  });

  it('reports which route was opened', () => {
    let opened: string | null = null;
    renderHistory({
      onOpen: (routeId) => {
        opened = routeId;
      },
    });

    fireEvent.press(screen.getByTestId('history-row'));
    expect(opened).toBe('route-1');
  });

  it('shows a skeleton shaped like the row it replaces', () => {
    renderHistory({ isLoading: true });
    expect(screen.getByTestId('history-loading')).toBeTruthy();
    expect(screen.queryByTestId('history-list')).toBeNull();
  });
});

// ─── Reading ─────────────────────────────────────────────────────────────────

function SavedRoutesProbe(): React.JSX.Element {
  const saved = useSavedRoutes();
  return (
    <Text testID="probe">
      {JSON.stringify({
        visible: saved.visible.length,
        locked: saved.locked.length,
        unavailable: saved.isUnavailable,
      })}
    </Text>
  );
}

describe('reading saved routes', () => {
  it('reports an unreadable answer as unavailable rather than as none', async () => {
    const { provider } = fakeRoutes({ list: async () => null });
    await renderWithServices(provider, <SavedRoutesProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toContain('"unavailable":true');
    });
  });

  it('splits at the free allowance rather than truncating', async () => {
    // Free keeps three; the rest are locked and still there.
    const { provider } = fakeRoutes({
      list: async () => [1, 2, 3, 4, 5].map((n) => summary({ routeId: `route-${n}` })),
    });
    await renderWithServices(provider, <SavedRoutesProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toContain('"visible":3');
    });
    expect(screen.getByTestId('probe').props.children).toContain('"locked":2');
  });
});

// ─── Opening ─────────────────────────────────────────────────────────────────

function OpenProbe({ routeId }: { routeId: string }): React.JSX.Element {
  const { open, failure } = useOpenRoute();
  const draft = useDraftRouteStore((store) => store.draft);
  const progress = useRouteProgressStore((store) => store.progress);

  return (
    <Text
      testID="probe"
      onPress={() => {
        void open(routeId);
      }}
    >
      {JSON.stringify({
        routeId: draft.routeId,
        stops: draft.stops.length,
        marks: progress === null ? null : Object.keys(progress.states).length,
        failure,
      })}
    </Text>
  );
}

describe('opening a saved route', () => {
  it('restores the route and its progress together', async () => {
    // A route restored without its progress puts a driver back at stop one on a
    // day they are halfway through — data loss arrived at differently.
    const { provider } = fakeRoutes({
      load: async () => ({
        draft: {
          routeId: 'route-9',
          originPlaceId: null,
          originIsCurrentLocation: true,
          shape: 'one-way',
          stops: [stop('a', 0), stop('b', 1)],
          isOptimized: true,
          isDegraded: false,
        },
        status: 'in_progress' as RouteStatus,
        progress: { routeId: 'route-9', states: { a: 'completed' as const } },
      }),
    });

    await renderWithServices(provider, <OpenProbe routeId="route-9" />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe'));
    });

    const state = screen.getByTestId('probe').props.children as string;
    expect(state).toContain('"routeId":"route-9"');
    expect(state).toContain('"stops":2');
    expect(state).toContain('"marks":1');
  });

  it('reports a route it cannot see as not found, without saying whose it is', async () => {
    // RLS returns nothing for a deleted route and for somebody else's alike.
    // Distinguishing them would be an ownership oracle.
    const { provider } = fakeRoutes({ load: async () => null });

    await renderWithServices(provider, <OpenProbe routeId="route-9" />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe'));
    });

    expect(screen.getByTestId('probe').props.children).toContain('"failure":"not-found"');
  });
});

// ─── Writing ─────────────────────────────────────────────────────────────────

function SyncProbe(): React.JSX.Element {
  useRouteSync();
  const addStop = useDraftRouteStore((store) => store.addStopToDraft);
  const label = useDraftRouteStore((store) => store.setStopLabel);
  const applyResult = useDraftRouteStore((store) => store.applyResult);

  return (
    <>
      <Text
        testID="add"
        onPress={() => {
          addStop(stop('a', 0));
        }}
      >
        add
      </Text>
      <Text
        testID="label"
        onPress={() => {
          label('a', 'Back entrance');
        }}
      >
        label
      </Text>
      <Text
        testID="optimize"
        onPress={() => {
          applyResult({
            tier: 'T1',
            isDegraded: false,
            orderedStopIds: ['a'],
            legs: [],
            totalDistanceMeters: 1_000,
            totalDurationSeconds: 300,
            unreachableStopIds: [],
          });
        }}
      >
        optimize
      </Text>
    </>
  );
}

describe('when a route is written', () => {
  it('does not write a draft nobody has optimized', async () => {
    // A sketch. The local store already holds it, and a History full of
    // two-stop sketches is a History nobody scrolls.
    const { provider, saves } = fakeRoutes();
    await renderWithServices(provider, <SyncProbe />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add'));
    });

    expect(saves).toHaveLength(0);
  });

  it('writes once the route has been optimized', async () => {
    const { provider, saves } = fakeRoutes();
    await renderWithServices(provider, <SyncProbe />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('optimize'));
    });

    await waitFor(() => {
      expect(saves.length).toBeGreaterThan(0);
    });
  });

  it('does not write again for a label the user typed', async () => {
    // A write per keystroke is a request per keystroke, and nothing is at risk
    // between writes — the draft is persisted locally and never evicted.
    const { provider, saves } = fakeRoutes();
    await renderWithServices(provider, <SyncProbe />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('optimize'));
    });
    await waitFor(() => {
      expect(saves.length).toBeGreaterThan(0);
    });

    const afterOptimize = saves.length;
    await act(async () => {
      fireEvent.press(screen.getByTestId('label'));
    });

    expect(saves).toHaveLength(afterOptimize);
  });

  it('writes no coordinate, ever', async () => {
    // `stops` has no expiry mechanism, so a coordinate written there is a terms
    // breach nothing would ever clean up (ADR-0007).
    const { provider, saves } = fakeRoutes();
    await renderWithServices(provider, <SyncProbe />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('optimize'));
    });
    await waitFor(() => {
      expect(saves.length).toBeGreaterThan(0);
    });

    expect(JSON.stringify(saves)).not.toContain('coordinate');
    expect(JSON.stringify(saves)).not.toContain('latitude');
  });
});
