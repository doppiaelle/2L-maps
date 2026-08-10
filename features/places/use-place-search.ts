import { useCallback, useEffect, useRef, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import type { PlaceOption, SearchFailure } from '@/lib/places/search';
import { shouldRotateSessionToken, shouldSearch } from '@/lib/places/search';
import type { GeocodingFailure } from '@/lib/providers/types';

/**
 * Address search: submitted, session-tokened, cancellable.
 *
 * **The trigger is a press, not a keystroke**
 * ([ADR-0019](../../docs/adr/0019-explicit-address-search.md)). This hook used
 * to debounce the field by 300 ms and search whatever the user had stopped
 * typing, which meant a single address cost several requests: "Via Giuseppe
 * Garibaldi 14" pauses at the street, at the surname and at the number, and each
 * pause was billed. The free tier covers ten `/places-autocomplete` calls a
 * month (docs/20_SUBSCRIPTIONS.md §6), so two addresses could exhaust an
 * allowance meant to last a fortnight — which is exactly what happened in
 * testing.
 *
 * A debounce could only ever make that cheaper by a constant factor. Moving the
 * trigger removes the multiplier: one address, one request, chosen by the person
 * who pays for it.
 *
 * Two cost rules from before survive unchanged
 * ([`docs/31_COST_MODEL.md`](../../docs/31_COST_MODEL.md), `CLAUDE.md` §6):
 *
 * **The session token spans the search and rotates after the selection.** Google
 * bills a session as one unit; rotating per request pays per request and looks
 * identical from the outside. Refining a query and searching again stays inside
 * the same session, which is the case explicit search makes *more* common.
 *
 * **A superseded request is cancelled**, not merely ignored. Ignoring the answer
 * still pays for it.
 *
 * Not a React Query hook, deliberately. This is a field with a lifecycle — a
 * token that must not rotate mid-search, and a request that must be aborted
 * rather than left to resolve into a cache nobody will read.
 */

export interface PlaceSearch {
  readonly query: string;
  setQuery: (query: string) => void;
  /**
   * The text the results on screen belong to. Empty before the first search.
   *
   * Exposed because the screen has to be able to tell "typed but not searched"
   * from "searched and found nothing", and those two look identical from the
   * results array alone.
   */
  readonly submittedQuery: string;
  /** Sends the current text, if it is worth sending. Idempotent for an
   *  unchanged query: pressing twice buys the same answer once. */
  submit: () => void;
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
  /** Re-runs the last submitted query after a failure. The session token is
   *  kept: the failed attempt did not consume the session, so paying for a new
   *  one would charge the user for our outage. */
  retry: () => void;
}

/** Injected so a test controls the tokens rather than matching random strings.
 *  Production passes nothing. */
export interface PlaceSearchOptions {
  readonly newSessionToken?: () => string;
  /** Where suggestions are biased towards — the map's centre, when there is one. */
  readonly bias?: { readonly latitude: number; readonly longitude: number } | null;
}

const randomToken = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function usePlaceSearch(options: PlaceSearchOptions = {}): PlaceSearch {
  const { newSessionToken = randomToken, bias = null } = options;

  const services = useServices();
  const [query, setQueryState] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
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

  const submit = useCallback(() => {
    const trimmed = query.trim();
    if (!shouldSearch(trimmed, false)) return;
    // The failure belonged to the previous attempt. Clearing it here rather than
    // in the effect means the error disappears the instant the user acts, not a
    // frame later when the request has already left.
    setFailure(null);
    setSubmittedQuery(trimmed);
  }, [query]);

  const endSession = useCallback(() => {
    if (shouldRotateSessionToken('selected')) sessionToken.current = newSessionToken();
    setQueryState('');
    setSubmittedQuery('');
    setResults([]);
    setFailure(null);
  }, [newSessionToken]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (services === null || !shouldSearch(submittedQuery, false)) {
      // Nothing has been asked for, so there is nothing in flight worth keeping
      // and nothing on screen worth leaving there. This is also the path
      // `endSession` takes, which is what clears the previous stop's results
      // before the next one is added.
      inFlight.current?.abort();
      setResults([]);
      setIsSearching(false);
      return;
    }

    // Cancelled, not merely ignored: ignoring the answer still pays for it. A
    // second submit can only happen after an edit, but a retry during a slow
    // first attempt can, and that is the case this guards.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setIsSearching(true);
    void services.geocoding
      .suggest(submittedQuery, sessionToken.current, bias === null ? {} : { bias })
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
  }, [submittedQuery, services, bias, attempt]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  return {
    query,
    setQuery,
    submittedQuery,
    submit,
    results,
    isSearching,
    failure,
    endSession,
    retry,
  };
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
