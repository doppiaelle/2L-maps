import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LocationProvider, useLocation } from './location-provider';
import type {
  DeviceLocation,
  LocationPermission,
  LocationPort,
} from '@/lib/location/current-location';

/**
 * When the device is asked where it is, and when it is not.
 *
 * The rule with a real consequence is the one about *not* asking: first launch
 * requests nothing ([`docs/18_PERMISSIONS.md`](../../docs/18_PERMISSIONS.md) §4),
 * because a permission dialog over an app the user has not evaluated is how a
 * denial becomes permanent — and a permanent denial cannot be undone from inside
 * the app on either platform.
 */

const now = new Date('2026-08-10T09:00:00.000Z');

const fix = (overrides: Partial<DeviceLocation> = {}): DeviceLocation => ({
  coordinate: { latitude: 45.6983, longitude: 9.6773 },
  headingDegrees: null,
  accuracyMeters: 12,
  at: now.getTime(),
  ...overrides,
});

interface Fake extends LocationPort {
  readonly calls: string[];
  emit: (location: DeviceLocation) => void;
  readonly isWatching: () => boolean;
}

const fakePort = (answers: { check: LocationPermission; request?: LocationPermission }): Fake => {
  const calls: string[] = [];
  let listener: ((location: DeviceLocation) => void) | null = null;

  return {
    calls,
    isWatching: () => listener !== null,
    emit: (location) => {
      listener?.(location);
    },
    check: () => {
      calls.push('check');
      return Promise.resolve(answers.check);
    },
    request: () => {
      calls.push('request');
      return Promise.resolve(answers.request ?? 'denied');
    },
    watch: (onChange) => {
      calls.push('watch');
      listener = onChange;
      return () => {
        listener = null;
      };
    },
  };
};

function Probe(): React.JSX.Element {
  const location = useLocation();
  return (
    <>
      <Text testID="kind">{location.state.kind}</Text>
      <Text testID="permission">{location.permission}</Text>
    </>
  );
}

const renderProbe = (port: LocationPort | null) =>
  render(
    <LocationProvider port={port} now={() => now}>
      <Probe />
    </LocationProvider>,
  );

describe('what happens without a user action', () => {
  it('never prompts on mount', async () => {
    const port = fakePort({ check: 'undetermined' });
    renderProbe(port);

    await waitFor(() => {
      expect(screen.getByTestId('permission').props.children).toBe('undetermined');
    });
    // `check` reads; `request` asks. Only the first may happen on its own.
    expect(port.calls).toContain('check');
    expect(port.calls).not.toContain('request');
  });

  it('follows a permission that was already granted', async () => {
    // Honouring an answer the user gave last time is not a request, and it is
    // what makes the map open on where they are from the second launch onwards.
    const port = fakePort({ check: 'granted' });
    renderProbe(port);

    await waitFor(() => {
      expect(port.isWatching()).toBe(true);
    });
    expect(port.calls).not.toContain('request');
  });

  it('reports locating until a usable fix arrives', async () => {
    const port = fakePort({ check: 'granted' });
    renderProbe(port);

    await waitFor(() => {
      expect(screen.getByTestId('kind').props.children).toBe('locating');
    });

    act(() => {
      port.emit(fix());
    });
    expect(screen.getByTestId('kind').props.children).toBe('ready');
  });

  it('holds back a fix too vague to route from', async () => {
    // The first reading after a cold start is routinely a kilometre out.
    const port = fakePort({ check: 'granted' });
    renderProbe(port);
    await waitFor(() => expect(port.isWatching()).toBe(true));

    act(() => {
      port.emit(fix({ accuracyMeters: 4_000 }));
    });
    expect(screen.getByTestId('kind').props.children).toBe('locating');
  });
});

describe('enabling it', () => {
  it('prompts and starts following when the answer is yes', async () => {
    const port = fakePort({ check: 'undetermined', request: 'granted' });
    let started: boolean | null = null;

    function Enabler(): React.JSX.Element {
      const location = useLocation();
      return (
        <Text testID="go" onPress={() => void location.enable().then((ok) => (started = ok))} />
      );
    }

    render(
      <LocationProvider port={port} now={() => now}>
        <Enabler />
      </LocationProvider>,
    );

    await act(async () => {
      screen.getByTestId('go').props.onPress();
    });

    await waitFor(() => expect(started).toBe(true));
    expect(port.calls).toContain('request');
  });

  it('reports a refusal as an answer rather than throwing', async () => {
    // Every journey has to work without it, so the caller is told plainly and
    // shows the row that explains itself (`CLAUDE.md` §0 rule 5).
    const port = fakePort({ check: 'undetermined', request: 'denied' });
    let started: boolean | null = null;

    function Enabler(): React.JSX.Element {
      const location = useLocation();
      return (
        <Text testID="go" onPress={() => void location.enable().then((ok) => (started = ok))} />
      );
    }

    render(
      <LocationProvider port={port} now={() => now}>
        <Enabler />
      </LocationProvider>,
    );

    await act(async () => {
      screen.getByTestId('go').props.onPress();
    });

    await waitFor(() => expect(started).toBe(false));
    expect(port.isWatching()).toBe(false);
  });
});

describe('a build with no location capability at all', () => {
  it('renders as permanently unavailable rather than failing', async () => {
    renderProbe(null);
    await waitFor(() => {
      expect(screen.getByTestId('kind').props.children).toBe('available');
    });
  });

  it('answers no to enable without anything to ask', async () => {
    let started: boolean | null = null;

    function Enabler(): React.JSX.Element {
      const location = useLocation();
      return (
        <Text testID="go" onPress={() => void location.enable().then((ok) => (started = ok))} />
      );
    }

    render(
      <LocationProvider port={null} now={() => now}>
        <Enabler />
      </LocationProvider>,
    );

    await act(async () => {
      screen.getByTestId('go').props.onPress();
    });

    expect(started).toBe(false);
  });
});

describe('a screen rendered outside the provider', () => {
  it('gets a location that is absent, not an exception', () => {
    // This is an enhancement to every screen that reads it. A component in a
    // test without the provider should render without a marker, not fail.
    render(<Probe />);
    expect(screen.getByTestId('kind').props.children).toBe('denied');
  });
});

describe('the subscription', () => {
  it('is released when the tree unmounts, so the receiver sleeps', async () => {
    const port = fakePort({ check: 'granted' });
    const { unmount } = renderProbe(port);
    await waitFor(() => expect(port.isWatching()).toBe(true));

    unmount();
    expect(port.isWatching()).toBe(false);
  });
});
