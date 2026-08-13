import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { ServicesProvider, useServices } from '@/features/api/services-provider';
import { SessionProvider } from '@/features/auth/session-provider';
import { useDraftRouteStore, useRouteProgressStore } from '@/features/stores';
import { useSavedRoutes } from './use-saved-routes';
import { useOpenRoute } from './use-open-route';
import { useRouteSync } from './use-route-sync';
import type { AuthProvider } from '@/lib/providers/types';
import type { RoutesProvider, SaveOutcome } from '@/lib/supabase/routes-adapter';

const auth: AuthProvider = {
  currentSession: () => Promise.resolve({ userId: 'user-1', accessToken: 'jwt' }),
  subscribe: () => () => undefined,
  signIn: () => Promise.resolve({ ok: true }),
  signOut: () => Promise.resolve(),
};

function renderWithServices(routes: RoutesProvider, ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
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
}

function SavedRoutesProbe(): React.JSX.Element {
  const saved = useSavedRoutes();
  return <Text testID="saved-routes">{saved.routes.length}</Text>;
}

function SyncProbe(): React.JSX.Element {
  const routeSync = useRouteSync();
  return (
    <Pressable
      testID="sync-probe"
      onPress={() => {
        void routeSync.sync();
      }}
    >
      <Text>sync</Text>
    </Pressable>
  );
}

function OpenProbe(): React.JSX.Element {
  const route = useOpenRoute();
  const services = useServices();
  return (
    <>
      <Text testID="open-ready">{services === null ? 'waiting' : 'ready'}</Text>
      <Pressable
        testID="open-probe"
        onPress={() => {
          void route.open('saved-route');
        }}
      >
        <Text>open</Text>
      </Pressable>
    </>
  );
}

describe('route persistence', () => {
  beforeEach(() => {
    useDraftRouteStore.getState().reset('draft');
    useRouteProgressStore.getState().abandon();
  });

  it('loads confirmed routes for History', async () => {
    const routes: RoutesProvider = {
      save: async () => ({ ok: true }) as SaveOutcome,
      list: async () => [
        {
          routeId: 'route-1',
          name: null,
          status: 'completed',
          stopCount: 2,
          isRoundTrip: false,
          stops: [],
          isDegraded: false,
          distanceMeters: 12_000,
          durationSeconds: 900,
          updatedAt: '2026-08-04T09:30:00.000Z',
        },
      ],
      load: async () => null,
      advance: async () => ({ ok: true }) as SaveOutcome,
    };
    renderWithServices(routes, <SavedRoutesProbe />);
    await waitFor(() => expect(screen.getByTestId('saved-routes').props.children).toBe(1));
  });

  it('saves an optimized route to the backend', async () => {
    const saves: unknown[] = [];
    const routes: RoutesProvider = {
      save: async (write) => {
        saves.push(write);
        return { ok: true } as SaveOutcome;
      },
      list: async () => [],
      load: async () => null,
      advance: async () => ({ ok: true }) as SaveOutcome,
    };
    renderWithServices(routes, <SyncProbe />);
    await act(async () => undefined);
    await act(async () => {
      useDraftRouteStore.setState((state) => ({
        ...state,
        draft: {
          ...state.draft,
          isOptimized: true,
          stops: [
            {
              id: 'stop-1',
              placeId: 'place-1',
              label: null,
              placeText: null,
              note: null,
              position: 0,
              entryOrder: 0,
              coordinate: null,
            },
          ],
        },
      }));
    });
    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
  });

  it('persists in_progress before Confirm backgrounds the app', async () => {
    const statuses: string[] = [];
    const routes: RoutesProvider = {
      save: async (write) => {
        statuses.push(write.route.status);
        return { ok: true } as SaveOutcome;
      },
      list: async () => [],
      load: async () => null,
      advance: async () => ({ ok: true }) as SaveOutcome,
    };
    renderWithServices(routes, <SyncProbe />);

    await act(async () => {
      useDraftRouteStore.setState((state) => ({
        ...state,
        draft: {
          ...state.draft,
          routeId: 'route-confirmed',
          isOptimized: true,
          stops: [
            {
              id: 'stop-1',
              placeId: 'place-1',
              label: null,
              placeText: null,
              note: null,
              position: 0,
              entryOrder: 0,
              coordinate: null,
            },
          ],
        },
      }));
    });
    await waitFor(() => expect(statuses).toContain('optimized'));

    await act(async () => {
      useRouteProgressStore.getState().begin('route-confirmed');
      fireEvent.press(screen.getByTestId('sync-probe'));
    });

    await waitFor(() => expect(statuses.at(-1)).toBe('in_progress'));
  });

  it('reopens the optimized order from History without optimizing again', async () => {
    const savedDraft = {
      ...useDraftRouteStore.getState().draft,
      routeId: 'saved-route',
      isOptimized: true,
      stops: [
        {
          id: 'stop-b',
          placeId: 'place-b',
          label: null,
          placeText: null,
          note: null,
          position: 0,
          entryOrder: 1,
          coordinate: null,
        },
        {
          id: 'stop-a',
          placeId: 'place-a',
          label: null,
          placeText: null,
          note: null,
          position: 1,
          entryOrder: 0,
          coordinate: null,
        },
      ],
    };
    const routes: RoutesProvider = {
      save: async () => ({ ok: true }) as SaveOutcome,
      list: async () => [],
      load: async () => ({ draft: savedDraft, status: 'optimized', progress: null }),
      advance: async () => ({ ok: true }) as SaveOutcome,
    };

    renderWithServices(routes, <OpenProbe />);
    await waitFor(() => expect(screen.getByTestId('open-ready').props.children).toBe('ready'));
    fireEvent.press(screen.getByTestId('open-probe'));

    await waitFor(() => expect(useDraftRouteStore.getState().draft.routeId).toBe('saved-route'));
    expect(useDraftRouteStore.getState().draft.isOptimized).toBe(true);
    expect(useDraftRouteStore.getState().draft.stops.map((stop) => stop.id)).toEqual([
      'stop-b',
      'stop-a',
    ]);
    // Reopening restores the server's optimized order directly. There is no
    // OptimizationResult to fetch and no call to the paid optimizer.
    expect(useDraftRouteStore.getState().result).toBeNull();
  });
});
