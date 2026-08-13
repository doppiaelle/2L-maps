import type { LatLng } from '@/lib/geo/haversine';
import type {
  EntitlementStatus,
  Leg,
  NavigationProviderId,
  OptimizationResult,
  PlaceId,
  PlanTier,
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
  /** Each stop's client id alongside its place id. The result names the order
   *  with these ids, so sending only place ids would collapse two stops at the
   *  same address — two deliveries in one building — into one. */
  readonly stops: readonly { readonly id: string; readonly placeId: PlaceId }[];
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

  /**
   * Pull addresses out of whatever the user gave us — a pasted message, a
   * photographed list, a dictated transcript ([ADR-0016](../../docs/adr/0016-ai-assisted-stop-entry.md)).
   *
   * It lives on this facade rather than a seventh one because it answers the
   * same question as everything else here: turning what the user gave us into
   * places. It is deliberately a *separate step* from `geocodeAddresses` —
   * candidates are shown for review before anything is resolved, because a
   * silently wrong address is a driver at the wrong door.
   *
   * `unparsed` carries the lines it could not read, so the user corrects two
   * rows instead of losing twenty-eight.
   */
  parse: (input: ParseInput) => Promise<
    | {
        readonly ok: true;
        readonly candidates: readonly string[];
        readonly unparsed: readonly string[];
      }
    | { readonly ok: false; readonly failure: GeocodingFailure }
  >;
}

/** Text or an image, never both — the union makes the "never both" structural
 *  rather than a runtime check somebody forgets (docs/33_API_CONTRACTS.md). */
export type ParseInput =
  | { readonly kind: 'text'; readonly text: string; readonly locale?: string }
  | { readonly kind: 'image'; readonly base64: string; readonly locale?: string };

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
  /** Which rung of the ladder the interface should present. Distinct from
   *  `status`: a lapsed subscriber is on `free`, not locked out (ADR-0029). */
  readonly plan: PlanTier;
  readonly trialEndsAt: string | null;
  readonly renewsAt: string | null;
  /** When a day pass expires. Null on every other plan. */
  readonly dayPassExpiresAt: string | null;
}

export type PurchaseOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'cancelled' | 'pending' | 'not-allowed' | 'failed' };

export interface BillingProvider {
  currentState: () => Promise<BillingState>;
  startTrial: (productId: string) => Promise<PurchaseOutcome>;
  /** Buy a day pass. Consumable, so the balance is held server-side and keyed to
   *  the user — a store receipt alone cannot restore it to a second device
   *  (ADR-0029, ADR-0011). */
  buyDayPass: (productId: string) => Promise<PurchaseOutcome>;
  /** Re-reads entitlement from the server rather than trusting the local receipt
   *  cache: a reinstalled or handed-over device must converge on the same answer,
   *  and only the server can be right about it. */
  restore: () => Promise<BillingState>;
}

// ─── Authentication ──────────────────────────────────────────────────────────

/**
 * The session, reduced to what the app actually needs.
 *
 * No email, no display name, no provider identity. Authorisation is decided by
 * RLS from the JWT the server verifies ([`docs/19_SECURITY.md`](../../docs/19_SECURITY.md)
 * §8), so the only thing the client does with a session is attach a token and
 * know whether it has one. Carrying more would be personal data held for no
 * purpose (`CLAUDE.md` §9 rule 7).
 */
export interface Session {
  readonly userId: string;
  readonly accessToken: string;
}

export type SignInMethod = 'apple' | 'google';

export type SignInOutcome =
  | { readonly ok: true }
  /** The user backed out of the provider's sheet. Not an error, and never shown
   *  as one — they simply changed their mind. */
  | { readonly ok: false; readonly reason: 'cancelled' }
  | { readonly ok: false; readonly reason: 'unavailable' | 'failed' };

/**
 * Authentication, behind a facade like every other external capability.
 *
 * `subscribe` exists because the session changes without anyone asking: a token
 * refresh, an expiry, a sign-out on another device. A `getSession()`-only
 * interface would leave the app holding a session that stopped being true, and
 * the first symptom would be a 401 in the middle of a route.
 */
export interface AuthProvider {
  /** Resolves once the persisted session has been read from storage. Null means
   *  signed out, and is a normal answer rather than a failure. */
  currentSession: () => Promise<Session | null>;
  subscribe: (listener: (session: Session | null) => void) => () => void;
  signIn: (method: SignInMethod) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
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

export interface RouteGeometry {
  readonly legs: readonly Leg[];
  /** Decoded once at receipt and memoised; decoding per render is a top cause of
   *  map jank (docs/24_PERFORMANCE.md). */
  readonly decodedPolyline: readonly LatLng[];
  /**
   * The same points, kept per leg rather than joined into one line.
   *
   * `legPaths[i]` is `legs[i]`, so a tap on a hop can be answered with the
   * distance and duration Google already gave us for it — data the field mask
   * already buys and nothing was showing
   * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)). Produced
   * by the same single decode as `decodedPolyline`, not a second one.
   */
  readonly legPaths: readonly (readonly LatLng[])[];
  /** A T0 result has an order but no road geometry, so the map draws straight
   *  connectors in a visually distinct style rather than a fake road-following
   *  line (docs/15_ROUTE_OPTIMIZATION.md). */
  readonly isDegraded: boolean;
}
