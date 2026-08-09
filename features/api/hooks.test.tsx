import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ServicesProvider } from './services-provider';
import { SessionProvider } from '@/features/auth/session-provider';
import { useResolvedPlaces } from '@/features/places/use-resolved-places';
import { useOptimizeAvailability, useUsageQuota } from '@/features/quota/use-usage-quota';
import type { AuthProvider } from '@/lib/providers/types';

/**
 * The hooks that talk to an Edge Function, including their failure paths
 * (`CLAUDE.md` §5).
 *
 * The network is substituted at the `fetchImpl` seam the client already accepts,
 * rather than by patching a global: the substitution is then visible in the call
 * signature, and [`22_TESTING.md`](../../docs/22_TESTING.md) records why MSW is
 * not used here.
 *
 * What is asserted is mostly what happens when the server is *not* helpful —
 * unreachable, half an answer, a shape the contract does not describe. Those are
 * the paths a user meets and a demo never does.
 */

const SESSION = { userId: 'user-1', accessToken: 'jwt' };

const auth: AuthProvider = {
  currentSession: () => Promise.resolve(SESSION),
  subscribe: () => () => undefined,
  signIn: () => Promise.resolve({ ok: true }),
  signOut: () => Promise.resolve(),
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Held so it can be cleared between tests.
 *
 * React Query keeps a garbage-collection timer per cached query, and this
 * product's retention is deliberately long — twenty-four hours for saved data,
 * because that retention *is* the offline story (ADR-0008). Left behind, those
 * timers hold the whole suite open long after the assertions have passed.
 */
let queryClient: QueryClient | null = null;

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

/**
 * Saved routes go over PostgREST rather than the Edge Functions, so they are not
 * driven by `fetchImpl` and none of the tests in this file touch them. A stub
 * that refuses everything is honest about that — a real one would let a test
 * pass by accident on a path it never meant to exercise.
 */
const stubFavourites = { list: async () => null, recordUse: async () => undefined };

const stubRoutes = {
  save: async () => ({ ok: false, failure: { kind: 'failed' } }) as const,
  list: async () => null,
  load: async () => null,
  advance: async () => ({ ok: false, failure: { kind: 'failed' } }) as const,
};

function renderWithServices(fetchImpl: typeof fetch, ui: React.ReactElement) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider auth={auth}>
        <ServicesProvider
          baseUrl="https://example.test/functions/v1"
          routes={stubRoutes}
          favourites={stubFavourites}
          fetchImpl={fetchImpl}
        >
          {ui}
        </ServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

  return result;
}

/**
 * Let the session and the query that follows it resolve.
 *
 * `SessionProvider` reads the persisted session in a microtask; the services
 * appear once it has, and the query runs after that. A test asserting the first
 * frame has to drain both, or it leaves a state update outside `act` and carries
 * a warning for something it caused itself — the kind of noise that trains
 * everyone to ignore the warnings that matter.
 */
async function settleSession(): Promise<void> {
  await act(async () => undefined);
  await act(async () => undefined);
}

// ─── Quota ───────────────────────────────────────────────────────────────────

function QuotaProbe({ stopCount = 5 }: { stopCount?: number }): React.JSX.Element {
  const snapshot = useUsageQuota();
  const availability = useOptimizeAvailability(stopCount, snapshot);

  return (
    <>
      <Text testID="plan">{snapshot.allowances.plan}</Text>
      <Text testID="max-stops">{String(snapshot.allowances.maxStopsPerRoute)}</Text>
      <Text testID="availability">{availability.kind}</Text>
    </>
  );
}

const quotaBody = (overrides: Record<string, unknown> = {}) => ({
  period: { from: '2026-08-01', to: '2026-08-31' },
  plan: 'pro',
  status: 'active',
  trialEndsAt: null,
  renewsAt: null,
  dayPassExpiresAt: null,
  limits: [
    { name: 'optimizations', used: 2, limit: 500 },
    { name: 'autocompleteSessions', used: 4, limit: 500 },
  ],
  ...overrides,
});

describe('reading the allowance', () => {
  it('takes the plan the server reports', async () => {
    renderWithServices(() => Promise.resolve(jsonResponse(quotaBody())), <QuotaProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('plan').props.children).toBe('pro');
    });
  });

  it('falls back to free when the server cannot be reached', async () => {
    // Never to the last known paid state: guessing upward gives the product
    // away to anyone who can turn off their radio (ADR-0011).
    renderWithServices(() => Promise.reject(new Error('offline')), <QuotaProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('plan').props.children).toBe('free');
    });
  });

  // A resolving fetch, not a hanging one: the assertion is about the first
  // frame, and a request left in flight holds the suite open behind the
  // client's own ten-second timeout.
  it('shows the free allowances rather than a blank while the first read is in flight', async () => {
    renderWithServices(() => Promise.resolve(jsonResponse(quotaBody())), <QuotaProbe />);
    expect(screen.getByTestId('plan').props.children).toBe('free');
    await settleSession();
  });

  it('lets the server tune one limit without restating the rest', async () => {
    // The free tier's allowances are tuned against realised ad revenue
    // (ADR-0015), and the server should be able to move one number.
    renderWithServices(
      () =>
        Promise.resolve(
          jsonResponse(
            quotaBody({
              plan: 'free',
              limits: [{ name: 'optimizations', used: 0, limit: 40 }],
            }),
          ),
        ),
      <QuotaProbe />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan').props.children).toBe('free');
    });
    // The stop ceiling was not mentioned, so the local fallback still answers
    // for it — reading an unmentioned limit as zero would tell a user they had
    // run out of something.
    expect(Number(screen.getByTestId('max-stops').props.children)).toBeGreaterThan(0);
  });

  it('does not block a user whose quota simply has not been read', async () => {
    // The server is the one that refuses. Pre-emptively blocking here would be
    // the client deciding access.
    renderWithServices(
      () => Promise.resolve(jsonResponse(quotaBody())),
      <QuotaProbe stopCount={5} />,
    );
    expect(screen.getByTestId('availability').props.children).toBe('allowed');
    await settleSession();
  });

  it('refuses a route above the plan’s ceiling before the attempt', async () => {
    renderWithServices(
      () => Promise.resolve(jsonResponse(quotaBody({ plan: 'free' }))),
      <QuotaProbe stopCount={40} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('availability').props.children).toBe('too-many-stops');
    });
  });
});

// ─── Places ──────────────────────────────────────────────────────────────────

function PlacesProbe({ ids }: { ids: readonly string[] }): React.JSX.Element {
  const places = useResolvedPlaces(ids);

  return (
    <>
      <Text testID="resolved">
        {[...places.byPlaceId.values()].map((p) => p.address).join('|')}
      </Text>
      <Text testID="unresolved">{places.unresolved.join('|')}</Text>
    </>
  );
}

describe('re-resolving a saved route’s addresses', () => {
  it('turns place ids back into something a driver can read', async () => {
    renderWithServices(
      () =>
        Promise.resolve(
          jsonResponse({
            resolved: [
              { placeId: 'p1', formattedAddress: 'Via Uno, Bergamo', lat: 45.7, lng: 9.7 },
            ],
            unresolved: [],
          }),
        ),
      <PlacesProbe ids={['p1']} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('resolved').props.children).toBe('Via Uno, Bergamo');
    });
  });

  it('keeps the rows it could resolve and names the ones it could not', async () => {
    // An import of thirty addresses must not be thrown away because two could
    // not be re-resolved (CLAUDE.md §0 rule 5).
    renderWithServices(
      () =>
        Promise.resolve(
          jsonResponse({
            resolved: [
              { placeId: 'p1', formattedAddress: 'Via Uno, Bergamo', lat: 45.7, lng: 9.7 },
            ],
            unresolved: [{ placeId: 'p2' }],
          }),
        ),
      <PlacesProbe ids={['p1', 'p2']} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('resolved').props.children).toBe('Via Uno, Bergamo');
    });
    expect(screen.getByTestId('unresolved').props.children).toBe('p2');
  });

  it('reports every id as unresolved when the request fails', async () => {
    // A failure is not an empty answer. Treating it as one would show a route
    // with no addresses and no explanation.
    renderWithServices(
      () => Promise.reject(new Error('offline')),
      <PlacesProbe ids={['p1', 'p2']} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('unresolved').props.children).toBe('p1|p2');
    });
  });

  it('asks for nothing when there is nothing to ask about', async () => {
    let calls = 0;
    renderWithServices(
      () => {
        calls += 1;
        return Promise.resolve(jsonResponse({ resolved: [], unresolved: [] }));
      },
      <PlacesProbe ids={[]} />,
    );

    expect(calls).toBe(0);
    await settleSession();
  });
});
