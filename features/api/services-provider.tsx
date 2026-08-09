import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { useSession } from '@/features/auth/session-provider';
import { ApiClient } from '@/lib/api/client';
import { createGeocodingProvider } from '@/lib/api/geocoding-adapter';
import { createQuotaProvider } from '@/lib/api/quota-adapter';
import type { QuotaProvider } from '@/lib/api/quota-adapter';
import { createRoutingProvider } from '@/lib/api/routing-adapter';
import type { FavouritesProvider } from '@/lib/supabase/favourites-adapter';
import type { RoutesProvider } from '@/lib/supabase/routes-adapter';
import type { GeocodingProvider, RoutingProvider } from '@/lib/providers/types';

/**
 * The facades, built once and reachable from React.
 *
 * They are constructed here rather than imported as singletons so a test — or a
 * future second environment — substitutes them at one seam. That is the same
 * discipline `lib/` already follows with `fetchImpl` and `LinkingPort`, applied
 * one layer up.
 *
 * **The token is read per request, never captured.** `ApiClient` takes a
 * `getAccessToken` function and calls it on every call, so a refreshed session
 * is picked up without rebuilding anything. Capturing the string instead is how
 * a long-running screen ends up sending an expired JWT and showing the user a
 * sign-in prompt in the middle of a route.
 *
 * **Null until there is a session, as well as when the build has no project.**
 * Every endpoint behind these facades is authenticated, so a client with no
 * token is not a usable service — and saying so here is what stops a query
 * firing during the cold-start gap before the session has been read. That query
 * would come back unauthenticated, cache the answer, and leave a paying user
 * looking at the free allowances until something happened to invalidate it.
 * Null is also the honest answer `createSupabaseAuth` gives for an unconfigured
 * build, for the same reason: the caller must handle it anyway, and a throwing
 * stub moves the failure to whichever screen touches it first.
 */

export interface Services {
  readonly routing: RoutingProvider;
  readonly geocoding: GeocodingProvider;
  readonly quota: QuotaProvider;
  /**
   * Saved routes, over PostgREST rather than an Edge Function.
   *
   * It sits beside the other three because callers should not have to know which
   * of their dependencies goes through a proxy — that is an implementation
   * detail of `lib/`, and ADR-0006 is about Google credentials rather than about
   * our own database.
   *
   * Null when the build has no project, like every other service here, and for
   * the same reason: a caller must handle absence anyway.
   */
  readonly routes: RoutesProvider;
  /** The address book, over PostgREST for the same reason as `routes`. */
  readonly favourites: FavouritesProvider;
}

const ServicesContext = createContext<Services | null>(null);

export interface ServicesProviderProps {
  /** The Edge Function base URL, or null when this build has no project. */
  readonly baseUrl: string | null;
  /**
   * The saved-routes facade, built at the composition root.
   *
   * Passed in rather than constructed here because building it means touching
   * the Supabase SDK, and this file sits in `features/` — where an SDK import
   * would be exactly the violation the facades exist to prevent (`CLAUDE.md`
   * §0 rule 2).
   */
  readonly routes: RoutesProvider | null;
  /** The address book, built at the composition root for the same reason. */
  readonly favourites: FavouritesProvider | null;
  /** Substituted in tests; production passes nothing and uses the real one. */
  readonly fetchImpl?: typeof fetch;
  readonly children: React.ReactNode;
}

export function ServicesProvider({
  baseUrl,
  routes,
  favourites,
  fetchImpl,
  children,
}: ServicesProviderProps): React.JSX.Element {
  const { session } = useSession();

  // The session is deliberately *not* a dependency of the client. Rebuilding it
  // on every token refresh would cancel in-flight requests — including an
  // optimization the user is waiting on — for a change the client reads
  // per-call anyway.
  const sessionRef = useLatest(session?.accessToken ?? null);

  const hasSession = session !== null;

  const services = useMemo<Services | null>(() => {
    if (baseUrl === null || routes === null || favourites === null || !hasSession) return null;

    const client = new ApiClient({
      baseUrl,
      getAccessToken: () => Promise.resolve(sessionRef.current),
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });

    return {
      routing: createRoutingProvider({ client }),
      geocoding: createGeocodingProvider({ client }),
      quota: createQuotaProvider({ client }),
      routes,
      favourites,
    };
  }, [baseUrl, routes, favourites, hasSession, fetchImpl, sessionRef]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** Null when the build has no project configured. Callers show the state rather
 *  than crashing — an unconfigured build is a real thing a developer holds. */
export function useServices(): Services | null {
  return useContext(ServicesContext);
}

/** A ref that always holds the newest value. Used so a changing token does not
 *  become a dependency that rebuilds the client under an in-flight request. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  // Written during render as well as in the effect: the first request of a
  // screen can be issued before effects have run, and it must not carry the
  // previous token.
  ref.current = value;
  return ref;
}
