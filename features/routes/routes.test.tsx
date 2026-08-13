import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ServicesProvider } from '@/features/api/services-provider';
import { SessionProvider } from '@/features/auth/session-provider';
import { useDraftRouteStore } from '@/features/stores';
import { useSavedRoutes } from './use-saved-routes';
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
  return <Text testID="saved-routes">{saved.visible.length}</Text>;
}

function SyncProbe(): React.JSX.Element {
  useRouteSync();
  return <Text testID="sync-probe">ready</Text>;
}

describe('route persistence', () => {
  afterEach(() => {
    useDraftRouteStore.getState().reset('draft');
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
    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
  });
});
