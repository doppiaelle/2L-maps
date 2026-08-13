import { useCallback, useMemo, useState } from 'react';

import { usePreferencesStore, useRouteProgressStore } from '@/features/stores';
import { requiresCoordinates } from '@/lib/handoff/capabilities';
import { planHandoff } from '@/lib/handoff/chunking';
import type { HandoffPlace } from '@/lib/handoff/urls';
import type { LatLng } from '@/lib/geo/haversine';
import type { NavigationProviderId, Stop } from '@/types';

/**
 * Handing the route to a navigation app.
 *
 * This is the moment the product exists for and the moment it stops being in
 * control ([ADR-0004](../../docs/adr/0004-external-navigation-handoff.md)): the
 * user leaves for Google Maps or Waze and may not come back for an hour, or at
 * all on this launch.
 *
 * **Progress is persisted before the handoff, never after.** The app may be
 * killed while the other one is in the foreground, and state that was going to
 * be written on return is state that is simply lost
 * ([`docs/16_INTERNAL_NAVIGATION.md`](../../docs/16_INTERNAL_NAVIGATION.md)).
 * So the route is marked underway *before* the URL is opened.
 *
 * **Nothing is marked completed here.** Departing is not arriving. The stop is
 * marked when the driver taps Done, which is the only moment anyone knows they
 * got there — marking on departure would show a route finished by a driver still
 * in the van.
 *
 * **A provider that cannot take the whole route is not an error.** Only Google
 * Maps accepts multiple waypoints, and even it stops at the URL ceiling, so the
 * route is chunked and the count is reported — the user learns there are three
 * hops now rather than discovering it at the second one.
 */

export type HandoffOutcome =
  | { readonly kind: 'handed-off'; readonly chunkCount: number }
  /** Waze takes coordinates and has no address form, so an expired cache blocks
   *  the handoff outright rather than degrading it (ADR-0007). */
  | { readonly kind: 'needs-coordinates'; readonly stopIds: readonly string[] }
  | { readonly kind: 'route-too-long' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'no-route' };

export interface HandoffState {
  start: () => Promise<HandoffOutcome>;
  readonly lastOutcome: HandoffOutcome | null;
  readonly preferredProvider: NavigationProviderId;
}

export interface ResolvedPlace {
  readonly address: string;
  readonly coordinate: LatLng;
}

export interface HandoffOptions {
  /**
   * The route being handed over.
   *
   * **It used to write `stops[0].id` here**, so `progress.routeId` named a stop
   * rather than a route and never matched anything — including the route the
   * lifecycle was about to move to `in_progress`. That is one half of why a
   * started route did not reach History.
   */
  readonly routeId: string;
  readonly stops: readonly Stop[];
  readonly resolved: ReadonlyMap<string, ResolvedPlace>;
  /** Opens a URL, reporting whether the other app came up. Injected so the whole
   *  flow is testable without a device — the same seam `NavigationProvider`
   *  already uses. */
  open: (url: string) => Promise<boolean>;
}

export function useHandoff({ routeId, stops, resolved, open }: HandoffOptions): HandoffState {
  const preferredProvider = usePreferencesStore((store) => store.preferences.navigationProvider);
  const beginAndHandOff = useRouteProgressStore((store) => store.beginAndHandOff);

  const [lastOutcome, setLastOutcome] = useState<HandoffOutcome | null>(null);

  const places = useMemo<readonly HandoffPlace[]>(
    () =>
      stops.map((stop) => {
        const fresh = resolved.get(stop.placeId);
        const cached = stop.coordinate;

        return {
          placeId: stop.placeId,
          coordinate:
            cached === null
              ? (fresh?.coordinate ?? null)
              : { latitude: cached.latitude, longitude: cached.longitude },
          address: cached?.formattedAddress ?? fresh?.address ?? null,
        };
      }),
    [stops, resolved],
  );

  const start = useCallback(async (): Promise<HandoffOutcome> => {
    const record = (outcome: HandoffOutcome): HandoffOutcome => {
      setLastOutcome(outcome);
      return outcome;
    };

    if (places.length < 2) return record({ kind: 'no-route' });
    // Checked before a single URL is built. Waze has no address form, so a stop
    // whose coordinate has expired cannot be handed to it at all — and finding
    // that out halfway through a chunked sequence strands the driver between two
    // apps. The stop ids come from the same index, because `places` mirrors
    // `stops` and `place_id` can legitimately repeat within one route.
    if (requiresCoordinates(preferredProvider)) {
      const missing = places
        .map((place, index) => (place.coordinate === null ? stops[index]?.id : undefined))
        .filter((id): id is string => id !== undefined);

      if (missing.length > 0) return record({ kind: 'needs-coordinates', stopIds: missing });
    }

    const planned = planHandoff(preferredProvider, places);
    if (!planned.ok) {
      return record(
        planned.failure.reason === 'single-leg-too-long'
          ? { kind: 'route-too-long' }
          : { kind: 'failed' },
      );
    }

    const first = planned.plan.chunks[0];
    if (first === undefined) return record({ kind: 'no-route' });

    /**
     * The record is written before the URL opens, and `beginAndHandOff` is what
     * makes that unskippable.
     *
     * A process killed while Google Maps is in the foreground comes back to a
     * route that knows it set off; the other order comes back to a route that
     * never started — and therefore to a History with a day missing from it.
     *
     * **It is written every time, not only the first.** A driver who closes the
     * navigation app at lunch and presses Confirm again in the afternoon is
     * setting off again, and the second departure is the current one.
     */
    let opened = false;
    await beginAndHandOff(routeId, async () => {
      opened = await open(first.url);
    });

    // A refusal is reported, not swallowed. The route stays underway either way
    // — the user did set out — but the screen has to be able to say that the
    // navigation app did not come up.
    return record(
      opened ? { kind: 'handed-off', chunkCount: planned.plan.chunks.length } : { kind: 'failed' },
    );
  }, [places, stops, routeId, preferredProvider, beginAndHandOff, open]);

  return { start, lastOutcome, preferredProvider };
}
