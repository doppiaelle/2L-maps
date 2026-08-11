import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useHandoff, type HandoffOutcome } from './use-handoff';
import { usePreferencesStore, useRouteProgressStore } from '@/features/stores';
import type { NavigationProviderId, Stop } from '@/types';

/**
 * The handoff is the moment the product exists for and the moment it stops
 * being in control: the user leaves for another app and may not come back on
 * this launch (ADR-0004).
 *
 * So the tests are about ordering and about refusals. **Progress must be written
 * before the URL opens** — state written on return is state that is lost when
 * the process is killed with Google Maps in the foreground, which is exactly
 * when the OS is likeliest to do it. And every refusal has to be named, because
 * a handoff that silently does nothing leaves a driver looking at a button they
 * have already pressed twice.
 */

const stop = (id: string, position: number, withCoordinate = true): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  placeText: null,
  note: null,
  position,
  entryOrder: position,
  coordinate: withCoordinate
    ? {
        latitude: 45.7 + position / 100,
        longitude: 9.7,
        formattedAddress: `Via ${id} 1, Bergamo`,
        refreshedAt: new Date().toISOString(),
      }
    : null,
});

interface Harness {
  readonly outcome: HandoffOutcome | null;
  readonly order: readonly string[];
}

let harness: Harness = { outcome: null, order: [] };

function Probe({
  stops,
  open,
  order,
}: {
  stops: readonly Stop[];
  open: (url: string) => Promise<boolean>;
  order: string[];
}): React.JSX.Element {
  const handoff = useHandoff({ routeId: 'route-1', stops, resolved: new Map(), open });

  return (
    <Text
      testID="go"
      onPress={() => {
        void handoff.start().then((outcome) => {
          harness = { outcome, order: [...order] };
        });
      }}
    >
      go
    </Text>
  );
}

const run = async (
  stops: readonly Stop[],
  options: {
    provider?: NavigationProviderId | null;
    opens?: boolean;
  } = {},
) => {
  harness = { outcome: null, order: [] };
  const order: string[] = [];

  useRouteProgressStore.getState().abandon();

  const provider = options.provider === undefined ? 'google-maps' : options.provider;
  if (provider === null) usePreferencesStore.getState().forgetNavigationProvider();
  else usePreferencesStore.getState().chooseNavigationProvider(provider, true);

  const open = async (): Promise<boolean> => {
    // Recorded at the moment the URL is opened, so the assertion can compare it
    // against when progress was written.
    order.push(useRouteProgressStore.getState().progress === null ? 'no-progress' : 'progress');
    order.push('opened');
    return options.opens ?? true;
  };

  render(<Probe stops={stops} open={open} order={order} />);

  await act(async () => {
    fireEvent.press(screen.getByTestId('go'));
  });

  return harness;
};

afterEach(() => {
  useRouteProgressStore.getState().abandon();
});

describe('the ordering that cannot be got wrong', () => {
  it('has already written progress by the time the URL opens', async () => {
    // The rule this hook exists to enforce. A write ordered after the launch is
    // lost exactly when the user has invested the most.
    const { order } = await run([stop('a', 0), stop('b', 1)]);
    expect(order[0]).toBe('progress');
    expect(order[1]).toBe('opened');
  });

  it('records the route it was actually given', async () => {
    // **It used to write `stops[0].id` here**, so the record named a stop and
    // matched no route — including the one the lifecycle was about to move to
    // `in_progress`. That is one half of why a started route never reached
    // History.
    await run([stop('a', 0), stop('b', 1)]);
    expect(useRouteProgressStore.getState().progress?.routeId).toBe('route-1');
  });

  it('leaves the route underway when the other app does not come up', async () => {
    // The user did set out. Un-beginning the route because Waze misbehaved
    // would be the wrong correction, and it would happen while they are driving.
    const { outcome } = await run([stop('a', 0), stop('b', 1)], { opens: false });

    expect(outcome).toEqual({ kind: 'failed' });
    expect(useRouteProgressStore.getState().progress).not.toBeNull();
  });

  it('records a second departure rather than keeping the first', async () => {
    // A driver who closes Google Maps at lunch and presses Confirm again in the
    // afternoon has set off again, and the afternoon is the current departure.
    useRouteProgressStore.getState().begin('route-1', new Date('2026-08-11T05:00:00.000Z'));

    await run([stop('a', 0), stop('b', 1)]);
    expect(useRouteProgressStore.getState().progress?.startedAt).not.toBe(
      '2026-08-11T05:00:00.000Z',
    );
  });
});

describe('what it refuses, and why', () => {
  it('asks which app before guessing one', async () => {
    // A first handoff sending a twelve-stop day to the wrong app is a bad
    // introduction to the one feature the product is for.
    const { outcome } = await run([stop('a', 0), stop('b', 1)], { provider: null });
    expect(outcome).toEqual({ kind: 'needs-provider' });
  });

  it('refuses a route with nothing to route', async () => {
    const { outcome } = await run([stop('a', 0)]);
    expect(outcome).toEqual({ kind: 'no-route' });
  });

  it('names the stops Waze cannot take, before building a single URL', async () => {
    // Waze takes `ll=lat,lng` and has no address form, so an expired coordinate
    // blocks the handoff outright (ADR-0007). Finding that out halfway through
    // a chunked sequence strands the driver between two apps.
    const { outcome } = await run([stop('a', 0), stop('b', 1, false)], { provider: 'waze' });

    expect(outcome).toEqual({ kind: 'needs-coordinates', stopIds: ['b'] });
    // Nothing was opened and nothing was begun: the refusal happened first.
    expect(useRouteProgressStore.getState().progress).toBeNull();
  });

  it('names the missing stops for Waze but not for Google Maps', async () => {
    // The asymmetry is in *which refusal* each provider gets, and it is checked
    // before any URL is built. Waze is told exactly which stops it cannot take;
    // Google Maps is not stopped by that check at all, because it accepts an
    // address — so its failure, when it has one, comes from the plan instead.
    const stops = [stop('a', 0), stop('b', 1, false)];

    const waze = await run(stops, { provider: 'waze' });
    const google = await run(stops, { provider: 'google-maps' });

    expect(waze.outcome).toEqual({ kind: 'needs-coordinates', stopIds: ['b'] });
    expect(google.outcome).not.toMatchObject({ kind: 'needs-coordinates' });
  });

  it('refuses rather than opening a map with nothing on it', async () => {
    // A stop whose coordinates were purged and which nothing re-resolved has
    // neither a point nor a street. Handing that to any provider opens an app
    // pointing at nowhere, which reads as the route having been lost.
    const { outcome } = await run([stop('a', 0, false), stop('b', 1, false)], {
      provider: 'google-maps',
    });
    expect(outcome).toEqual({ kind: 'failed' });
  });
});

describe('what it reports back', () => {
  it('says how many hops the route became', async () => {
    // The user learns there are three now rather than discovering it at the
    // second one.
    const stops = Array.from({ length: 12 }, (_, index) => stop(`s${index}`, index));
    const { outcome } = await run(stops, { provider: 'waze' });

    expect(outcome).toMatchObject({ kind: 'handed-off' });
    if (outcome?.kind === 'handed-off') expect(outcome.chunkCount).toBeGreaterThan(1);
  });
});
