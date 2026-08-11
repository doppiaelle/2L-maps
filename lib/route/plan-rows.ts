import { isCoordinateFresh } from '@/lib/coordinates/staleness';
import { haversineMeters } from '@/lib/geo/haversine';
import type { LatLng } from '@/lib/geo/haversine';
import { stateOf } from '@/lib/route/progress';
import { stopTextOf } from '@/lib/route/stop-text';
import type { StopText } from '@/lib/route/stop-text';
import type { RouteProgress, StopProgressState } from '@/lib/route/progress';
import type { PlaceId, Stop } from '@/types';

/**
 * Turning stored stops into the rows and markers a screen draws.
 *
 * This is the join the product rests on. A stop stores a `place_id` for ever and
 * everything Google-derived beside it — the coordinate *and* the address —
 * perishes at thirty days
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md),
 * [`docs/12_DATABASE.md`](../../docs/12_DATABASE.md)). So what a row shows comes
 * from three places at once: the stop itself, whatever the places query
 * re-resolved, and how far through the route the user is.
 *
 * It lives here rather than in the screen because two of the three rules are
 * domain rules and both are easy to get subtly wrong:
 *
 * **A freshly resolved coordinate beats a stale cached one, and a fresh cached
 * one beats a round trip.** Preferring the query unconditionally would discard a
 * perfectly good local coordinate and make the map wait for the network on every
 * launch; preferring the cache unconditionally would draw a driver's route from
 * month-old data.
 *
 * **Progress decides a stop's state, not the stop's own flag.** `isCompleted` on
 * the stored stop is what the server last saw; the progress store is what
 * happened since, including the marks made with no signal at all.
 */

export interface PlanRow {
  readonly id: string;
  readonly position: number;
  /**
   * The two lines the row draws, already decided.
   *
   * **The row used to decide this itself**, with `label ?? address ??
   * 'Address needs refreshing'` — three sources reconciled inside a component,
   * with no notion of the thirty-day clock and no way to say whether the
   * placeholder meant "expired" or "the second round trip has not landed yet".
   * `stopTextOf` owns the rule now, and it is tested without a renderer.
   */
  readonly text: StopText;
  /** Null when the purge has taken it. Kept alongside `text` because the map
   *  and the handoff need the address itself, not the line a row shows. */
  readonly address: string | null;
  readonly label: string | null;
  readonly state: StopProgressState;
  readonly hasCoordinate: boolean;
  readonly meta: string | null;
}

export interface PlanMarker {
  readonly stopId: string;
  readonly position: number;
  readonly coordinate: LatLng | null;
  readonly state: StopProgressState;
}

export interface ResolvedPlace {
  readonly address: string;
  readonly coordinate: LatLng;
}

export interface PlanRowInputs {
  readonly stops: readonly Stop[];
  readonly resolved: ReadonlyMap<PlaceId, ResolvedPlace>;
  readonly progress: RouteProgress | null;
  readonly now: Date;
}

export interface PlanRows {
  readonly rows: readonly PlanRow[];
  readonly markers: readonly PlanMarker[];
  /** Stops that can be listed but not drawn. Named so the screen can say which,
   *  rather than leaving the user to count pins and find one short. */
  readonly undrawableStopIds: readonly string[];
}

export function buildPlanRows(inputs: PlanRowInputs): PlanRows {
  const rows: PlanRow[] = [];
  const markers: PlanMarker[] = [];
  const undrawableStopIds: string[] = [];

  inputs.stops.forEach((stop, index) => {
    const fresh = inputs.resolved.get(stop.placeId);
    const cached = isCoordinateFresh(stop.coordinate, inputs.now) ? stop.coordinate : null;

    // The cache first when it is still good — a reused coordinate costs nothing
    // and the map draws on the first frame rather than after a round trip.
    const coordinate: LatLng | null =
      cached !== null
        ? { latitude: cached.latitude, longitude: cached.longitude }
        : (fresh?.coordinate ?? null);

    const address = cached?.formattedAddress ?? fresh?.address ?? null;
    const state = inputs.progress === null ? 'pending' : stateOf(inputs.progress, stop.id);

    rows.push({
      id: stop.id,
      position: index + 1,
      text: stopTextOf({ stop, resolvedAddress: fresh?.address ?? null, now: inputs.now }),
      address,
      label: stop.label,
      state,
      hasCoordinate: coordinate !== null,
      meta: null,
    });

    markers.push({ stopId: stop.id, position: index + 1, coordinate, state });
    if (coordinate === null) undrawableStopIds.push(stop.id);
  });

  return { rows, markers, undrawableStopIds };
}

/**
 * The place ids worth asking about.
 *
 * Only the ones whose local copy has expired. Asking for all of them on every
 * launch would be a billed batch for data already held — and `/place-details`
 * is metered like everything else (`docs/31_COST_MODEL.md`).
 */
export function placeIdsToResolve(stops: readonly Stop[], now: Date): readonly PlaceId[] {
  const needed = stops
    .filter((stop) => !isCoordinateFresh(stop.coordinate, now))
    .map((stop) => stop.placeId);

  // Deduplicated: the same address twice in a day is a real working route — a
  // morning delivery and an afternoon collection — and it is one lookup.
  return [...new Set(needed)];
}

/**
 * The straight-line length of the route as it currently stands.
 *
 * Shown on a draft, **labelled as an estimate**, because a number is more useful
 * than a blank and a wrong claim is worse than either
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../docs/08_SCREEN_SPECIFICATIONS.md) §7).
 * It is deliberately not a duration: distance as the crow flies is a real
 * quantity a driver can reason about, whereas a straight-line *time* would be a
 * road estimate we did not make.
 *
 * Stops that cannot be placed are skipped rather than breaking the chain — the
 * line runs past them, exactly as the degraded connectors do.
 */
export function straightLineMeters(markers: readonly PlanMarker[]): number | null {
  const placed = markers
    .map((marker) => marker.coordinate)
    .filter((coordinate): coordinate is LatLng => coordinate !== null);

  if (placed.length < 2) return null;

  let total = 0;
  for (let i = 0; i + 1 < placed.length; i += 1) {
    const from = placed[i];
    const to = placed[i + 1];
    if (from === undefined || to === undefined) continue;
    total += haversineMeters(from, to);
  }
  return total;
}
