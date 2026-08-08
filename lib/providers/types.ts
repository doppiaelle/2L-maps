import type { LatLng } from '@/lib/geo/haversine';
import type {
  EntitlementStatus,
  Leg,
  NavigationProviderId,
  OptimizationResult,
  PlaceId,
  ProviderCapabilities,
  RouteShape,
} from '@/types';

/**
 * The facade interfaces.
 *
 * Five external capabilities are wrapped, with no exceptions (CLAUDE.md §1).
 * These interfaces are the seam that makes [ADR-0012] — migrating off Google to
 * MapLibre and Valhalla — a migration rather than a rewrite. Everything above
 * them speaks the product's vocabulary; everything below is replaceable.
 *
 * Two rules shape every signature here.
 *
 * **They expose the product's vocabulary, never the library's.** A method named
 * after an SDK method is a pass-through, and a pass-through facade is not doing
 * its job — it defers the coupling without removing it.
 *
 * **They return outcomes, not exceptions, for expected failures.** Every failure
 * listed below is a condition a user can be told about and act on, so it belongs
 * in the type rather than in a catch block a caller can forget to write
 * (CLAUDE.md §0 rule 5).
 */

// ─── Routing ─────────────────────────────────────────────────────────────────

export interface RoutingRequest {
  readonly routeId: string;
  readonly originPlaceId: PlaceId | null;
  readonly originCoordinate: LatLng | null;
  readonly stopPlaceIds: readonly PlaceId[];
  readonly shape: RouteShape;
  readonly departureTime: Date | null;
  /** Makes a retry after a timeout free rather than a second billed call. */
  readonly idempotencyKey: string;
}

export type RoutingFailure =
  | { readonly kind: 'no-entitlement' }
  | { readonly kind: 'quota-exhausted'; readonly resetsAt: string }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number }
  /** Upstream failed or timed out. `canDegrade` says whether T0 is worth offering,
   *  so the caller does not have to re-derive the stop-count rule. */
  | { readonly kind: 'upstream-unavailable'; readonly canDegrade: boolean }
  | { readonly kind: 'offline'; readonly canDegrade: boolean }
  | { readonly kind: 'invalid-route'; readonly reason: 'too-few-stops' | 'too-many-stops' };

export type RoutingOutcome =
  | { readonly ok: true; readonly result: OptimizationResult }
  /** T2 above the async threshold: the work continues server-side and the caller
   *  subscribes to the job rather than waiting on this call. */
  | { readonly ok: 'pending'; readonly jobId: string }
  | { readonly ok: false; readonly failure: RoutingFailure };

/**
 * Ordering stops into a route.
 *
 * The tier is deliberately absent from the request: it is chosen server-side and
 * the caller cannot influence it (ADR-0003). The result reports which tier
 * served it only so a degraded outcome can be labelled — never so the client can
 * ask for one.
 */
export interface RoutingProvider {
  optimize: (request: RoutingRequest) => Promise<RoutingOutcome>;
  /** Watch an asynchronous job to completion. Resolves once, with the outcome. */
  awaitJob: (jobId: string, signal?: AbortSignal) => Promise<RoutingOutcome>;
}

// ─── Geocoding ───────────────────────────────────────────────────────────────

export interface PlaceSuggestion {
  readonly placeId: PlaceId;
  readonly primaryText: string;
  readonly secondaryText: string;
}

export interface ResolvedPlace {
  readonly placeId: PlaceId;
  readonly formattedAddress: string;
  readonly coordinate: LatLng;
}

export type GeocodingFailure =
  | { readonly kind: 'no-entitlement' }
  | { readonly kind: 'quota-exhausted'; readonly resetsAt: string }
  | { readonly kind: 'offline' }
  | { readonly kind: 'upstream-unavailable' };

/**
 * Turning what a user typed into a place.
 *
 * `suggest` is the largest single cost line in the product, which is why the
 * session token is part of the signature rather than an implementation detail:
 * a caller that forgets it does not fail, it silently bills every keystroke
 * separately (docs/31_COST_MODEL.md).
 *
 * `resolveBatch` reports resolved and unresolved separately, so an import of
 * thirty addresses is not thrown away because two lines were unparseable.
 */
export interface GeocodingProvider {
  suggest: (
    input: string,
    sessionToken: string,
    options?: { readonly bias?: LatLng; readonly locale?: string },
  ) => Promise<
    | { readonly ok: true; readonly suggestions: readonly PlaceSuggestion[] }
    | { readonly ok: false; readonly failure: GeocodingFailure }
  >;

  /** Re-hydrate coordinates that expired at 30 days (ADR-0007). Batched, because
   *  twenty-five sequential lookups cost twenty-five times one batch. */
  resolveBatch: (placeIds: readonly PlaceId[]) => Promise<
    | {
        readonly ok: true;
        readonly resolved: readonly ResolvedPlace[];
        readonly unresolved: readonly PlaceId[];
      }
    | { readonly ok: false; readonly failure: GeocodingFailure }
  >;

  geocodeAddresses: (addresses: readonly string[]) => Promise<
    | {
        readonly ok: true;
        readonly resolved: readonly ResolvedPlace[];
        readonly unresolved: readonly string[];
      }
    | { readonly ok: false; readonly failure: GeocodingFailure }
  >;
}

// ─── Navigation handoff ──────────────────────────────────────────────────────

export interface HandoffTarget {
  readonly placeId: PlaceId;
  readonly coordinate: LatLng | null;
  readonly address: string | null;
}

export type HandoffFailure =
  | { readonly kind: 'provider-not-installed'; readonly provider: NavigationProviderId }
  /** Waze takes coordinates and has no address form, so an expired cache blocks
   *  the handoff outright rather than degrading it (ADR-0007). */
  | { readonly kind: 'coordinates-required'; readonly placeIds: readonly PlaceId[] }
  | { readonly kind: 'route-too-long-for-one-leg' };

/**
 * Handing navigation to an external app.
 *
 * A provider that cannot chunk reports it through `capabilitiesOf` and does not
 * throw when asked (CLAUDE.md §1, Liskov): every implementation must be
 * substitutable, and one that explodes on a capability it lacks is not.
 */
export interface NavigationProvider {
  /** Which providers are actually installed. iOS needs the schemes declared at
   *  build time, so this can only ever return a subset of what was declared. */
  installedProviders: () => Promise<readonly NavigationProviderId[]>;
  capabilitiesOf: (provider: NavigationProviderId) => ProviderCapabilities;
  /** Open the given leg or chunk. Progress is persisted by the caller *before*
   *  this is invoked, never after (docs/11_STATE_MANAGEMENT.md §7). */
  open: (
    provider: NavigationProviderId,
    targets: readonly HandoffTarget[],
  ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly failure: HandoffFailure }>;
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export interface BillingState {
  /** Drives the interface only. Access is decided server-side and the two can
   *  legitimately disagree — after an offline period, a refund, a family-sharing
   *  change — and when they do, the server is right (ADR-0011). */
  readonly status: EntitlementStatus;
  readonly trialEndsAt: string | null;
  readonly renewsAt: string | null;
}

export type PurchaseOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'cancelled' | 'pending' | 'not-allowed' | 'failed' };

export interface BillingProvider {
  currentState: () => Promise<BillingState>;
  startTrial: (productId: string) => Promise<PurchaseOutcome>;
  /** Re-reads entitlement from the server rather than trusting the local receipt
   *  cache: a reinstalled or handed-over device must converge on the same answer,
   *  and only the server can be right about it. */
  restore: () => Promise<BillingState>;
}

// ─── Map ─────────────────────────────────────────────────────────────────────

export interface MapCamera {
  readonly center: LatLng;
  readonly zoom: number;
}

export interface MapBounds {
  readonly northEast: LatLng;
  readonly southWest: LatLng;
}

/**
 * What the product needs from a map, and nothing more.
 *
 * Interface segregation applied literally: `react-native-maps` offers far more
 * than this, and exposing the surplus would make the MapLibre migration in
 * ADR-0012 a rewrite of every screen instead of one adapter.
 */
export interface AppMapHandle {
  fitToBounds: (bounds: MapBounds, padding: { readonly bottom: number }) => void;
  moveTo: (camera: MapCamera, animated: boolean) => void;
  /** Snapshot for the shareable route preview. Google imagery carries attribution
   *  obligations wherever it appears (risk C14). */
  snapshot: () => Promise<string>;
}

export interface RouteGeometry {
  readonly legs: readonly Leg[];
  /** Decoded once at receipt and memoised; decoding per render is a top cause of
   *  map jank (docs/24_PERFORMANCE.md). */
  readonly decodedPolyline: readonly LatLng[];
  /** A T0 result has an order but no road geometry, so the map draws straight
   *  connectors in a visually distinct style rather than a fake road-following
   *  line (docs/15_ROUTE_OPTIMIZATION.md). */
  readonly isDegraded: boolean;
}
