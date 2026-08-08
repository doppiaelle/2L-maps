import {
  HANDOFF_NOMINAL_WAYPOINTS,
  type NavigationProviderId,
  type ProviderCapabilities,
} from '@/types';

/**
 * What each navigation provider can accept.
 *
 * This table is the authoritative one (docs/16_INTERNAL_NAVIGATION.md §4);
 * everything else in the handoff module follows from it. The asymmetry is the
 * whole design problem: **only Google Maps accepts more than one stop**, so a
 * 12-stop route becomes two Google Maps handoffs or twelve Waze ones.
 *
 * A provider that cannot chunk reports that here rather than throwing when asked
 * (CLAUDE.md §1, Liskov). Every implementation must be substitutable; a strategy
 * that explodes on a capability it lacks is not.
 */

const CAPABILITIES: Record<NavigationProviderId, ProviderCapabilities> = {
  'google-maps': {
    id: 'google-maps',
    canChunkHandoff: true,
    maxWaypointsPerHandoff: HANDOFF_NOMINAL_WAYPOINTS,
  },
  waze: {
    // Coordinates only, no address string — so a stop whose coordinates have
    // expired must be re-hydrated before a Waze handoff can even be built
    // (ADR-0007).
    id: 'waze',
    canChunkHandoff: false,
    maxWaypointsPerHandoff: 0,
  },
  'apple-maps': {
    id: 'apple-maps',
    canChunkHandoff: false,
    maxWaypointsPerHandoff: 0,
  },
};

export function capabilitiesOf(provider: NavigationProviderId): ProviderCapabilities {
  return CAPABILITIES[provider];
}

/** Which shape of handoff a provider supports. Named for what the user
 *  experiences, not for the mechanism. */
export type HandoffStrategy = 'chunked' | 'leg-by-leg';

export function strategyFor(provider: NavigationProviderId): HandoffStrategy {
  return capabilitiesOf(provider).canChunkHandoff ? 'chunked' : 'leg-by-leg';
}

/**
 * How many handoffs a route of this length needs with this provider.
 *
 * Advisory only — it answers "roughly how many times will I be interrupted",
 * which is what the UI tells the user before they start. The real chunk count
 * comes from measuring built URLs, because long addresses breach the length
 * ceiling before the waypoint count does.
 */
export function estimatedHandoffCount(
  provider: NavigationProviderId,
  intermediateStopCount: number,
): number {
  if (intermediateStopCount <= 0) return intermediateStopCount === 0 ? 1 : 0;

  const { canChunkHandoff, maxWaypointsPerHandoff } = capabilitiesOf(provider);
  if (!canChunkHandoff) {
    // One handoff per leg: the user returns to the app between each.
    return intermediateStopCount + 1;
  }

  return Math.ceil(intermediateStopCount / maxWaypointsPerHandoff);
}

/**
 * Whether a provider needs coordinates rather than addresses.
 *
 * Waze accepts `ll=lat,lng` and no address string, so an expired coordinate
 * blocks the handoff entirely instead of degrading it. Google Maps and Apple Maps
 * accept a text address, so they still work from a `place_id` alone.
 */
export function requiresCoordinates(provider: NavigationProviderId): boolean {
  return provider === 'waze';
}

export const ALL_PROVIDERS: readonly NavigationProviderId[] = ['google-maps', 'waze', 'apple-maps'];
