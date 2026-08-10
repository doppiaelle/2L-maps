import { ApiError } from '../errors.ts';
import { ensurePlaceIds } from '../places-cache.ts';

import type { DatabaseClient } from '../dependencies.ts';
import type { UpstreamOutcome } from '../pipeline.ts';

/**
 * `/places-autocomplete`.
 *
 * **No cache, deliberately.** Places session semantics make a cached suggestion
 * both stale and a billing anomaly, so there is no `readCache` here rather than
 * an empty one ([`docs/13_BACKEND.md`](../../../../docs/13_BACKEND.md) §6).
 *
 * It does one thing besides asking Google, and it is not a cache: it **records
 * the `place_id`s it just handed out**. A suggestion is the first moment the
 * client holds an id, and the moment after that the user can add it as a stop
 * and save the route — while the coordinates are still unresolved, which is a
 * perfectly ordinary state under [ADR-0007](../../../../docs/adr/0007-place-id-durable-coordinates-perishable.md).
 * `stops.place_id` has a foreign key into `places_cache` and the client cannot
 * write there, so without this row the save fails on a stop the user is looking
 * at. The row carries the id and nothing else; coordinates arrive later, from
 * `/place-details`, or never.
 */

export interface AutocompletePort {
  suggest: (
    input: string,
    sessionToken: string,
    options: {
      readonly locale?: string;
      readonly bias?: { readonly lat: number; readonly lng: number };
    },
  ) => Promise<
    | { readonly ok: true; readonly value: readonly { readonly placeId: string }[] }
    | { readonly ok: false }
  >;
}

export interface AutocompleteRequest {
  readonly input: string;
  readonly sessionToken: string;
  readonly locale?: string | null;
  readonly bias?: { readonly latitude: number; readonly longitude: number } | null;
}

export interface AutocompleteResult {
  readonly suggestions: readonly { readonly placeId: string }[];
}

export interface AutocompleteDependencies {
  readonly database: DatabaseClient;
  readonly places: AutocompletePort;
}

export async function autocompleteUpstream(
  request: AutocompleteRequest,
  deps: AutocompleteDependencies,
): Promise<UpstreamOutcome<AutocompleteResult>> {
  const outcome = await deps.places.suggest(request.input, request.sessionToken, {
    ...(request.locale === undefined || request.locale === null ? {} : { locale: request.locale }),
    ...(request.bias === undefined || request.bias === null
      ? {}
      : { bias: { lat: request.bias.latitude, lng: request.bias.longitude } }),
  });

  if (!outcome.ok) {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the address service');
  }

  await ensurePlaceIds(
    deps.database,
    outcome.value.map((suggestion) => suggestion.placeId),
  );

  return {
    result: { suggestions: outcome.value },
    tier: null,
    // One unit per request. Places bills the *session*, not the keystroke, which
    // is what the mandatory session token buys — the quota here is a ceiling on
    // sessions, and the burst limit is what catches a stuck input inside one.
    units: 1,
  };
}
