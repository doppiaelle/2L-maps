import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  DeviceLocation,
  LocationPermission,
  LocationPort,
  LocationState,
} from '@/lib/location/current-location';
import { locationStateOf } from '@/lib/location/current-location';

/**
 * The device's location, once, for the whole tree.
 *
 * A context rather than a hook each screen calls, because a second subscriber is
 * a second GPS subscription: the map follows the driver continuously and the
 * add-stop modal needs a single fix, and if those were two independent watchers
 * the receiver would stay awake for both. One subscription, shared.
 *
 * **Nothing is requested at launch.** The permission timeline
 * ([`docs/18_PERMISSIONS.md`](../../docs/18_PERMISSIONS.md) §4) is explicit that
 * first launch requests nothing — the user has not yet seen the product, and a
 * permission dialog over an app they cannot evaluate is how a denial becomes
 * permanent. `enable()` is called by a control the user pressed: the recenter
 * button on the map, or "My location" in the search.
 *
 * The one exception is a permission that has **already** been granted, which is
 * read on mount and starts following immediately. That is not a request; it is
 * honouring an answer the user gave last time, and it is what makes the map open
 * on where they are on the second launch onwards.
 */

export interface Location {
  readonly state: LocationState;
  readonly permission: LocationPermission;
  /**
   * Asks for permission if it has not been asked, and starts following.
   *
   * Resolves to whether following actually started, so a caller can say what
   * happened rather than assuming it worked. A refusal is not an error — it is
   * an answer, and every journey has to work without it.
   */
  enable: () => Promise<boolean>;
}

const LocationContext = createContext<Location | null>(null);

export interface LocationProviderProps {
  /**
   * The port. Null in a build or a test with no location capability, which is a
   * supported state and not a misconfiguration — the whole feature degrades to
   * absent and every journey still completes.
   */
  readonly port: LocationPort | null;
  /** Substituted by tests so staleness is decided against a controlled clock
   *  rather than against whenever the assertion happened to run. */
  readonly now?: () => Date;
  readonly children: React.ReactNode;
}

export function LocationProvider({
  port,
  now = () => new Date(),
  children,
}: LocationProviderProps): React.JSX.Element {
  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  // Held in a ref as well as in state: `enable` must be able to tell whether a
  // subscription already exists without depending on the state that its own
  // call is about to change, which would make the callback identity churn on
  // every fix and re-run every effect that depends on it.
  const stopRef = useRef<(() => void) | null>(null);

  // An answer already given, honoured without asking again. This is the only
  // thing that happens without a user action, and it deliberately does not
  // prompt: `check` reads, `request` asks.
  useEffect(() => {
    if (port === null) return;
    let cancelled = false;
    void port.check().then((answer) => {
      if (cancelled) return;
      setPermission(answer);
      if (answer === 'granted') setIsFollowing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [port]);

  useEffect(() => {
    if (port === null || !isFollowing) return;
    const stop = port.watch(setLocation);
    stopRef.current = stop;
    return () => {
      stop();
      stopRef.current = null;
    };
  }, [port, isFollowing]);

  const enable = useCallback(async () => {
    if (port === null) return false;
    if (stopRef.current !== null) return true;

    const answer = await port.request();
    setPermission(answer);
    if (answer !== 'granted') return false;
    setIsFollowing(true);
    return true;
  }, [port]);

  const value = useMemo<Location>(
    () => ({
      // The clock is read at render rather than captured, so a fix that was
      // fresh when it arrived becomes stale on its own without anything having
      // to invalidate it.
      state: locationStateOf({ permission, location, now: now() }),
      permission,
      enable,
    }),
    // `now` is a function and stable; `location` changing is what re-derives the
    // state, which is the only thing that should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permission, location, enable],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * The device's location.
 *
 * Returns a permanently unavailable location outside a provider rather than
 * throwing: this is an enhancement to every screen that reads it, and a screen
 * that renders in a test without the provider should render without a map
 * marker, not fail to render.
 */
export function useLocation(): Location {
  return (
    useContext(LocationContext) ?? {
      state: { kind: 'denied' },
      permission: 'denied',
      enable: () => Promise.resolve(false),
    }
  );
}
