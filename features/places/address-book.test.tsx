import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useAddressBook } from './use-address-book';
import { ServicesProvider } from '@/features/api/services-provider';
import { SessionProvider } from '@/features/auth/session-provider';
import type { AddressBookEntry } from '@/lib/places/address-book';
import type { AuthProvider } from '@/lib/providers/types';
import type { FavouritesProvider } from '@/lib/supabase/favourites-adapter';

/**
 * The address book is the product's cost lever, and a lever that is never pulled
 * is a lever that is not there. These tests are about the pulling: that a place
 * found by a paid search is remembered, and that remembering never gets in the
 * way of the thing the user was actually doing.
 */

const auth: AuthProvider = {
  currentSession: () => Promise.resolve({ userId: 'user-1', accessToken: 'jwt' }),
  subscribe: () => () => undefined,
  signIn: () => Promise.resolve({ ok: true }),
  signOut: () => Promise.resolve(),
};

const NOW = new Date('2026-08-09T12:00:00.000Z');

const entry = (overrides: Partial<AddressBookEntry> = {}): AddressBookEntry => ({
  placeId: 'place-a',
  label: null,
  formattedAddress: 'Via Borgo Palazzo 137, Bergamo BG',
  useCount: 1,
  lastUsedAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
  ...overrides,
});

const fakeFavourites = (overrides: Partial<FavouritesProvider> = {}) => {
  const recorded: string[] = [];
  const provider: FavouritesProvider = {
    list: async () => [entry()],
    recordUse: async (placeId) => {
      recorded.push(placeId);
    },
    ...overrides,
  };
  return { provider, recorded };
};

const stubRoutes = {
  save: async () => ({ ok: false, failure: { kind: 'failed' } }) as const,
  list: async () => null,
  load: async () => null,
  advance: async () => ({ ok: false, failure: { kind: 'failed' } }) as const,
};

let queryClient: QueryClient | null = null;

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

function Probe(): React.JSX.Element {
  const book = useAddressBook(NOW);
  return (
    <Text
      testID="probe"
      onPress={() => {
        book.record('place-new');
      }}
    >
      {JSON.stringify({
        recent: book.recent.map((option) => option.primaryText),
        saved: book.saved.length,
        loading: book.isLoading,
      })}
    </Text>
  );
}

const renderProbe = async (favourites: FavouritesProvider) => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider auth={auth}>
        <ServicesProvider
          baseUrl="https://example.test/functions/v1"
          routes={stubRoutes}
          favourites={favourites}
        >
          <Probe />
        </ServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

  await act(async () => undefined);
  await act(async () => undefined);
  return result;
};

describe('reading the book', () => {
  it('offers a place used yesterday for free reuse', async () => {
    const { provider } = fakeFavourites();
    await renderProbe(provider);

    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toContain('Via Borgo Palazzo 137');
    });
  });

  it('treats an unreadable answer as an empty book rather than crashing', async () => {
    // Losing the book costs a search. Losing the screen costs the stop.
    const { provider } = fakeFavourites({ list: async () => null });
    await renderProbe(provider);

    await waitFor(() => {
      expect(screen.getByTestId('probe').props.children).toContain('"recent":[]');
    });
  });
});

describe('filling the book', () => {
  it('records a place the user chose, whatever they chose it from', async () => {
    // The lever. A book that only remembers what was already in it never fills
    // up, and a place found by search is the one worth remembering — it has just
    // cost the most it ever will.
    const { provider, recorded } = fakeFavourites();
    await renderProbe(provider);

    await act(async () => {
      fireEvent.press(screen.getByTestId('probe'));
    });

    expect(recorded).toEqual(['place-new']);
  });

  it('does not let a failed write disturb what the user was doing', async () => {
    // They added a stop. Whether we managed to file the address is our problem,
    // and a toast about it mid-route would be the app complaining about itself.
    const { provider } = fakeFavourites({
      recordUse: async () => {
        throw new Error('no');
      },
    });
    await renderProbe(provider);

    await act(async () => {
      fireEvent.press(screen.getByTestId('probe'));
    });

    expect(screen.getByTestId('probe')).toBeTruthy();
  });
});
