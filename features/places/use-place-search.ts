import { useCallback, useEffect, useRef, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import type { PlaceOption, SearchFailure } from '@/lib/places/search';
import { shouldRotateSessionToken, shouldSearch } from '@/lib/places/search';
import type { GeocodingFailure } from '@/lib/providers/types';
import { AUTOCOMPLETE_DEBOUNCE_MS } from '@/types';

/**
 * Address autocomplete: debounced, session-tokened, cancellable.
 *
 * Three cost rules meet here, and each one is invisible if it is missing
 * ([`docs/31_COST_MODEL.md`](../../docs/31_COST_MODEL.md), `CLAUDE.md` §6 rule 1):
 *
 * **The debounce is a spend control before it is a performance one.** Every
 * keystroke that reaches the network is billed, and "Via Giuseppe Garibaldi" is
 * twenty-five of them.
 *
 * **The session token spans the search and rotates after the selection.** Google
 * bills a session as one unit; rotating per keystroke pays per keystroke and
 * looks identical from the outside.
 *
 * **A superseded request is cancelled**, not merely ignored. Ignoring the answer
 * still pays for it.
 *
 * Not a React Query hook, deliberately. This is a keystroke stream with a
 * lifecycle — a token that must not rotate mid-search, and a request that must
 * be aborted rather than left to resolve into a cache nobody will read. Query's
 * model would fight all three.
 */

export interface PlaceSearch {
  readonly query: string;
  setQuery: (query: string) => void;
  readonly results: readonly PlaceOption[];
  readonly isSearching: boolean;
  /**
   * Why the last attempt failed, or null.
   *
   * This used to be dropped on the floor: the outcome was read only for its
   * suggestions and a failure became an empty list, indistinguishable on screen
   * from an address Google has never heard of. Every network fault, expired
   * session, exhausted quota and undeployed function looked identical, and the
   * only thing the user could do about it was retype the address.
   */
  readonly failure: SearchFailure | null;
  /** Ends the session, so the next search starts a new billed one. Called by
   *  the screen when a suggestion is chosen. */
  endSession: () => void;
  /** Re-runs the current query after a failure. The session token is kept: the
   *  failed attempt did not consume the session, so paying for a new one would
   *  charge the user for our outage. */
  retry: () => void;
}

/** Injected so a test controls the tokens rather than matching random strings.
 *  Production passes nothing. */
export interface PlaceSearchOptions {
  readonly debounceMs?: number;
  readonly newSessionToken?: () => string;
  /** Where suggestions are biased towards — the map's centre, when there is one. */
  readonly bias?: { readonly latitude: number; readonly longitude: number } | null;
}

const randomToken = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function usePlaceSearch(options: PlaceSearchOptions = {}): PlaceSearch {
  const {
    debounceMs = AUTOCOMPLETE_DEBOUNCE_MS,
    newSessionToken = randomToken,
    bias = null,
  } = options;

  const services = useServices();
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<readonly PlaceOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  /** Bumped by `retry` to re-run the effect on an unchanged query. */
  const [attempt, setAttempt] = useState(0);

  const sessionToken = useRef(newSessionToken());
  const inFlight = useRef<AbortController | null>(null);

  // Typing deliberately does nothing to the token: one search is one billed
  // session, and `shouldRotateSessionToken` says so for every event this hook
  // handles. The rotation happens in `endSession`, which is the only moment a
  // session actually ends.
  const setQuery = setQueryState;

  const endSession = useCallback(() => {
    if (shouldRotateSessionToken('selected')) sessionToken.current = newSessionToken();
    setQueryState('');
    setResults([]);
    setFailure(null);
  }, [newSessionToken]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (services === null || !shouldSearch(query, false)) {
      // Below the minimum there is nothing in flight worth keeping, and leaving
      // stale results under a shortened query would show answers to a question
      // the user has already changed.
      inFlight.current?.abort();
      setResults([]);
      setIsSearching(false);
      // The failure belonged to a query that no longer exists. Keeping it would
      // leave an error sitting over an empty field.
      setFailure(null);
      return undefined;
    }

    const timer = setTimeout(() => {
      // Cancelled, not merely ignored: ignoring the answer still pays for it.
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setIsSearching(true);
      void services.geocoding
        .suggest(query, sessionToken.current, bias === null ? {} : { bias })
        .then((outcome) => {
          if (controller.signal.aborted) return;
          setIsSearching(false);

          if (outcome.ok) {
            setResults(outcome.suggestions);
            setFailure(null);
            return;
          }

          // Kept, not swallowed. The screen decides what to say about it; this
          // hook's job is to stop pretending the answer was "nothing found".
          setResults([]);
          setFailure(toSearchFailure(outcome.failure));
        });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, services, debounceMs, bias, attempt]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  return { query, setQuery, results, isSearching, failure, endSession, retry };
}

/**
 * The transport's taxonomy, reduced to the four things a user can do about it.
 *
 * `upstream-unavailable` covers a wide range on purpose — a missing server key,
 * an undeployed function, a Google outage, a malformed response. They differ
 * enormously to us and not at all to the person holding the phone, whose next
 * action is the same in every case.
 */
function toSearchFailure(failure: GeocodingFailure): SearchFailure {
  switch (failure.kind) {
    case 'offline':
      return 'offline';
    case 'quota-exhausted':
      return 'quota-exhausted';
    case 'no-entitlement':
      return 'no-entitlement';
    default:
      return 'unavailable';
  }
}
