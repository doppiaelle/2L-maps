import { capabilitiesOf } from '@/lib/handoff/capabilities';
import { buildUrl } from '@/lib/handoff/urls';
import type { HandoffPlace, HandoffSegment } from '@/lib/handoff/urls';
import type { HandoffFailure, HandoffTarget, NavigationProvider } from '@/lib/providers/types';
import { HANDOFF_URL_MAX_LENGTH } from '@/types';
import type { NavigationProviderId } from '@/types';

/**
 * The concrete `NavigationProvider` — the product's exit path.
 *
 * The platform APIs arrive through `LinkingPort` rather than by importing
 * `expo-linking` here. That is not only for tests: `canOpenURL` depends on
 * build-time manifest declarations (`LSApplicationQueriesSchemes` on iOS,
 * `<queries>` on Android), so the honest answer to "is Waze installed" differs
 * between a development build and Expo Go, and a module that reached for the
 * SDK directly would make that difference untestable
 * ([ADR-0014](../../docs/adr/0014-android-first-verification.md)).
 *
 * Every failure here is a state a screen has to render, so none of them throws
 * (`CLAUDE.md` §0 rule 5).
 */

/** The two things this adapter needs from the platform, and nothing more. */
export interface LinkingPort {
  canOpenUrl: (url: string) => Promise<boolean>;
  openUrl: (url: string) => Promise<void>;
}

export interface NavigationAdapterOptions {
  readonly linking: LinkingPort;
  readonly platform: 'ios' | 'android';
}

/** Probe URLs. Deliberately minimal — a probe that carries a destination would
 *  be a different question than "is this app here". */
const PROBE_URL: Readonly<Record<NavigationProviderId, string>> = {
  'google-maps': 'comgooglemaps://',
  waze: 'waze://',
  'apple-maps': 'maps://',
};

export function createNavigationProvider(options: NavigationAdapterOptions): NavigationProvider {
  const { linking, platform } = options;

  return {
    installedProviders: async () => {
      const available: NavigationProviderId[] = [];

      // Always offered. We hand off with the universal link, not the
      // `comgooglemaps://` scheme, and a universal link resolves in the browser
      // when the app is absent — a worse experience, not a dead one. Gating it
      // behind an install check would remove the only provider that carries
      // multiple waypoints, from the users least likely to have alternatives.
      available.push('google-maps');

      // Waze takes coordinates and has no web fallback we can hand a route to.
      // Without the app the link is dead, so it is offered only when present.
      if (await canOpen(linking, PROBE_URL.waze)) {
        available.push('waze');
      }

      // A system app on iOS, and uninstallable there. On Android it cannot
      // exist at all, so asking is a question with a known answer.
      if (platform === 'ios') {
        available.push('apple-maps');
      }

      return available;
    },

    capabilitiesOf,

    open: async (provider, targets) => {
      const segment = toSegment(targets);
      if (segment === null) {
        return { ok: false, failure: { kind: 'route-too-long-for-one-leg' } };
      }

      const built = buildUrl(provider, segment);
      if (!built.ok) {
        return { ok: false, failure: toHandoffFailure(built.reason, provider, targets) };
      }

      // The ceiling is measured, never counted. A nine-waypoint route of short
      // addresses fits; the same count of `c/o Rossi, Via …, int. 2` does not,
      // and the URL still opens while silently dropping the tail
      // (docs/16_INTERNAL_NAVIGATION.md).
      if (built.url.length > HANDOFF_URL_MAX_LENGTH) {
        return { ok: false, failure: { kind: 'route-too-long-for-one-leg' } };
      }

      try {
        await linking.openUrl(built.url);
      } catch {
        // The app was there a moment ago and is not now — uninstalled mid-route,
        // or the scheme was revoked. Reported as not installed because that is
        // what the user has to act on, and it is the truth from here.
        return { ok: false, failure: { kind: 'provider-not-installed', provider } };
      }

      return { ok: true };
    },
  };
}

/** A probe that throws is a probe that answered no. */
async function canOpen(linking: LinkingPort, url: string): Promise<boolean> {
  try {
    return await linking.canOpenUrl(url);
  } catch {
    return false;
  }
}

/** First target is the origin, last the destination, the rest pass through. */
function toSegment(targets: readonly HandoffTarget[]): HandoffSegment | null {
  if (targets.length < 2) return null;

  const places = targets.map(toPlace);
  const origin = places[0];
  const destination = places[places.length - 1];
  if (origin === undefined || destination === undefined) return null;

  return { origin, destination, waypoints: places.slice(1, -1) };
}

const toPlace = (target: HandoffTarget): HandoffPlace => ({
  placeId: target.placeId,
  coordinate: target.coordinate,
  address: target.address,
});

/**
 * Say which stops blocked the handoff, not merely that one did.
 *
 * `coordinates-required` is the Waze case: the coordinate cache expired at 30
 * days and Waze has no address form to fall back to
 * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * Naming the offending stops turns "this didn't work" into "these two need
 * re-entering", which is the difference between an error and an instruction.
 */
function toHandoffFailure(
  reason: 'coordinates-required' | 'place-unresolvable',
  provider: NavigationProviderId,
  targets: readonly HandoffTarget[],
): HandoffFailure {
  if (reason === 'coordinates-required') {
    return {
      kind: 'coordinates-required',
      placeIds: targets.filter((t) => t.coordinate === null).map((t) => t.placeId),
    };
  }

  // Neither a coordinate nor an address survives for some stop. There is
  // nothing to hand any provider, so this is not a provider problem — but
  // `provider-not-installed` is the only shape that lets the screen offer the
  // alternative that might still work.
  return { kind: 'provider-not-installed', provider };
}
