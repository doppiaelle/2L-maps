import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ImportView } from './ImportView';
import { useImport } from './use-import';
import { ServicesProvider } from '@/features/api/services-provider';
import { SessionProvider } from '@/features/auth/session-provider';
import type { AuthProvider } from '@/lib/providers/types';

/**
 * Import, from the screen down.
 *
 * The property being protected is **partial success**: twenty-eight addresses
 * read and three lines unreadable is a good outcome, and a screen that refuses
 * the batch makes the user retype the twenty-eight they had already given us.
 */

const noop = () => undefined;

const renderView = (props: Partial<Parameters<typeof ImportView>[0]> = {}) =>
  render(
    <ImportView
      text=""
      onTextChange={noop}
      candidates={[
        { index: 0, text: 'Via Roma 1, Bergamo' },
        { index: 1, text: 'Via Milano 22, Bergamo' },
      ]}
      problems={[]}
      canParse={false}
      isParsing={false}
      onParse={noop}
      onEditProblem={noop}
      isResolving={false}
      failure={null}
      onAdd={noop}
      onDismiss={noop}
      theme="light"
      {...props}
    />,
  );

describe('what the screen offers', () => {
  it('counts what it found in the primary action', () => {
    renderView();
    expect(screen.getByText('Add 2 stops')).toBeTruthy();
  });

  it('stays enabled while lines still need a look', () => {
    // The whole point. Blocking on the three bad lines is how a user ends up
    // retyping the twenty-eight good ones.
    renderView({ problems: [{ text: 'Via ??? 4', reason: 'Could not read this as an address' }] });

    expect(screen.getByText('Add 2 stops')).toBeTruthy();
    expect(screen.getByTestId('import-problems')).toBeTruthy();
  });

  it('says why each line needs a look, in the user’s terms', () => {
    renderView({ problems: [{ text: 'Via Roma 1', reason: 'Already in the list' }] });
    expect(screen.getByText('Already in the list')).toBeTruthy();
  });

  it('shows a problem line as the user pasted it, not as a guess', () => {
    // A guess reaches a route with the same confidence as a correct answer.
    renderView({ problems: [{ text: 'via rom 1 brg', reason: 'No match — try adding the town' }] });
    expect(screen.getByTestId('import-problem').props.value).toBe('via rom 1 brg');
  });

  it('refuses to add nothing, and says what is missing', () => {
    renderView({ candidates: [] });
    expect(screen.getByText('Paste a list to get started')).toBeTruthy();
  });

  it('offers the model only when the split was the wrong tool', () => {
    expect(renderView().queryByTestId('import-parse')).toBeNull();
  });

  it('offers it when the paste reads as prose', () => {
    // A metered call, so it is offered rather than run — and offered with the
    // free result already on screen, so the user can see what it replaces.
    renderView({ canParse: true });
    expect(screen.getByTestId('import-parse')).toBeTruthy();
  });

  it('states a failed lookup instead of appearing to ignore the tap', () => {
    renderView({ failure: 'could-not-resolve' });
    expect(screen.getByTestId('import-failure')).toBeTruthy();
  });

  it('tells a screen reader how many lines are still outstanding', () => {
    renderView({ problems: [{ text: 'Via ??? 4', reason: 'Could not read this' }] });
    expect(
      screen.getByLabelText('Add 2 stops to your route. 1 line still need a look'),
    ).toBeTruthy();
  });
});

// ─── The hook ────────────────────────────────────────────────────────────────

const auth: AuthProvider = {
  currentSession: () => Promise.resolve({ userId: 'user-1', accessToken: 'jwt' }),
  subscribe: () => () => undefined,
  signIn: () => Promise.resolve({ ok: true }),
  signOut: () => Promise.resolve(),
};

const stubRoutes = {
  save: async () => ({ ok: false, failure: { kind: 'failed' } }) as const,
  list: async () => null,
  load: async () => null,
  advance: async () => ({ ok: false, failure: { kind: 'failed' } }) as const,
};

/**
 * The network is substituted at the `fetchImpl` seam the client already accepts,
 * rather than by stubbing the facade: `ServicesProvider` builds the real adapter,
 * and replacing it would skip the request shaping and the response validation
 * that are the adapter's whole job.
 */
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let queryClient: QueryClient | null = null;

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

function Probe({ paste }: { paste: string }): React.JSX.Element {
  const state = useImport();
  return (
    <>
      <Text
        testID="paste"
        onPress={() => {
          state.setText(paste);
        }}
      >
        paste
      </Text>
      <Text
        testID="resolve"
        onPress={() => {
          void state.resolve();
        }}
      >
        resolve
      </Text>
      <Text testID="probe">
        {JSON.stringify({
          candidates: state.candidates.map((c) => c.text),
          problems: state.problems.map((p) => p.reason),
          canParse: state.canParse,
        })}
      </Text>
    </>
  );
}

const renderProbe = async (
  paste: string,
  fetchImpl: typeof fetch = () => {
    throw new Error('no request expected');
  },
) => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider auth={auth}>
        <ServicesProvider
          baseUrl="https://example.test/functions/v1"
          routes={stubRoutes}
          favourites={{ list: async () => null, recordUse: async () => undefined }}
          fetchImpl={fetchImpl}
        >
          <Probe paste={paste} />
        </ServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

  await act(async () => undefined);
  await act(async () => undefined);
  return result;
};

describe('the free split runs first', () => {
  it('needs no service to turn a clean list into candidates', async () => {
    // A driver's day usually arrives as a list, and a list needs splitting
    // rather than understanding. Paying for inference to do a `split` is the
    // cost this product spends its discipline avoiding.
    await renderProbe('Via Roma 1, Bergamo\nVia Milano 22, Bergamo');

    await act(async () => {
      fireEvent.press(screen.getByTestId('paste'));
    });

    const state = screen.getByTestId('probe').props.children as string;
    expect(state).toContain('Via Roma 1, Bergamo');
    expect(state).toContain('"canParse":false');
  });

  it('offers the model when the paste is prose', async () => {
    await renderProbe(
      [
        'Ciao Marco come stai spero tutto bene volevo chiederti un favore',
        'domani mattina se puoi passare in negozio verso le nove',
        'poi ti mando gli altri indirizzi appena li ho',
        'Via Roma 1, Bergamo',
      ].join('\n'),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('paste'));
    });

    expect(screen.getByTestId('probe').props.children).toContain('"canParse":true');
  });

  it('names a duplicate rather than dropping it silently', async () => {
    await renderProbe('Via Roma 1, Bergamo\nvia roma 1 bergamo');

    await act(async () => {
      fireEvent.press(screen.getByTestId('paste'));
    });

    expect(screen.getByTestId('probe').props.children).toContain('Already in the list');
  });
});

describe('turning candidates into stops', () => {
  it('geocodes before adding, because a stop with no place_id is not a stop', async () => {
    // The durable key is the `place_id` (ADR-0007). A stop added without one
    // could not be saved, handed off or re-resolved, so the import resolves
    // first and adds only what came back with a key.
    const requested: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requested.push(String(input));
      const body = JSON.parse(String(init?.body ?? '{}')) as { addresses?: string[] };
      return jsonResponse({
        resolved: (body.addresses ?? []).map((address, index) => ({
          index,
          placeId: `place-${index}`,
          formattedAddress: address,
          lat: 45.7,
          lng: 9.7,
        })),
        unresolved: [],
      });
    }) as typeof fetch;

    await renderProbe('Via Roma 1, Bergamo\nVia Milano 22, Bergamo', fetchImpl);

    await act(async () => {
      fireEvent.press(screen.getByTestId('paste'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('resolve'));
    });

    expect(requested.some((url) => url.endsWith('/geocode'))).toBe(true);
  });

  it('brings back an address it could not place, rather than losing it', async () => {
    // Usually a missing town rather than a place that does not exist, which is
    // why it returns as a row the user can correct.
    const fetchImpl = (async () =>
      jsonResponse({
        resolved: [],
        unresolved: [{ index: 0, input: 'Via Roma 1, Bergamo' }],
      })) as typeof fetch;

    await renderProbe('Via Roma 1, Bergamo', fetchImpl);

    await act(async () => {
      fireEvent.press(screen.getByTestId('paste'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('resolve'));
    });

    expect(screen.getByTestId('probe').props.children).toContain('No match');
  });
});
