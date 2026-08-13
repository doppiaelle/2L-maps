import { useCallback, useEffect, useRef, useState } from 'react';

import { useServices } from '@/features/api/services-provider';
import type { PlaceOption, SearchFailure } from '@/lib/places/search';
import { shouldRotateSessionToken, shouldSearch } from '@/lib/places/search';
import type { GeocodingFailure } from '@/lib/providers/types';

export interface PlaceSearch {
  readonly query: string;
  setQuery: (query: string) => void;
  readonly submittedQuery: string;
  submit: () => void;
  readonly results: readonly PlaceOption[];
  readonly isSearching: boolean;
  readonly failure: SearchFailure | null;
  endSession: () => void;
  retry: () => void;
}

export interface PlaceSearchOptions {
  readonly newSessionToken?: () => string;
  readonly bias?: { readonly latitude: number; readonly longitude: number } | null;
}

const randomToken = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Explicitly submitted autocomplete with one token per chosen place. */
export function usePlaceSearch(options: PlaceSearchOptions = {}): PlaceSearch {
  const { newSessionToken = randomToken, bias = null } = options;
  const services = useServices();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<readonly PlaceOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const token = useRef(newSessionToken());
  const inFlight = useRef<AbortController | null>(null);

  const submit = useCallback(() => {
    const trimmed = query.trim();
    if (!shouldSearch(trimmed, false)) return;
    setFailure(null);
    setSubmittedQuery(trimmed);
  }, [query]);

  const endSession = useCallback(() => {
    if (shouldRotateSessionToken('selected')) token.current = newSessionToken();
    setQuery('');
    setSubmittedQuery('');
    setResults([]);
    setFailure(null);
  }, [newSessionToken]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (services === null || !shouldSearch(submittedQuery, false)) {
      inFlight.current?.abort();
      setResults([]);
      setIsSearching(false);
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setIsSearching(true);

    void services.geocoding
      .suggest(submittedQuery, token.current, bias === null ? {} : { bias })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        setIsSearching(false);
        if (outcome.ok) {
          setResults(outcome.suggestions);
          setFailure(null);
          return;
        }
        setResults([]);
        setFailure(toSearchFailure(outcome.failure));
      });
  }, [submittedQuery, services, bias, attempt]);

  useEffect(() => () => inFlight.current?.abort(), []);

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
