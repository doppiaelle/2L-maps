/**
 * The domain vocabulary, fixed by the glossary in docs/00_PROJECT_OVERVIEW.md §8.
 *
 * These names are binding. A stop is a `Stop` — never a Location, Point,
 * Destination or Address (CLAUDE.md §2). Renaming a concept here means updating
 * the glossary first.
 */

/** Google's stable place identifier. Storable indefinitely, and the durable key
 *  for every location in the system (ADR-0007). */
export type PlaceId = string;

/**
 * Latitude, longitude and formatted address derived from Google.
 *
 * Deletable after 30 days by platform terms, so this is **always** nullable at
 * every read. `stop.coordinate!` is a compliance bug wearing a syntax costume
 * (CLAUDE.md §3).
 */
export interface CoordinateCache {
  readonly latitude: number;
  readonly longitude: number;
  readonly formattedAddress: string;
  /** When these coordinates were last refreshed from Google. Drives expiry. */
  readonly refreshedAt: string;
}

/** One place the user intends to visit. Not the same as a waypoint. */
export interface Stop {
  readonly id: string;
  readonly placeId: PlaceId;
  /** User-authored. User content, stored indefinitely. */
  readonly label: string | null;
  readonly note: string | null;
  /** Zero-based position in the route as it currently stands. After an
   *  optimization this is the optimized order. */
  readonly position: number;
  /**
   * Zero-based position as the user originally entered it, preserved across
   * optimization.
   *
   * Mirrors `stops.entry_order` in the schema (docs/12_DATABASE.md), which has
   * always had both. Without it nothing can distinguish an order the user typed
   * from one the optimizer produced — and that distinction is what "Already the
   * fastest order" and the renumbering animation both rest on.
   */
  readonly entryOrder: number;
  /** Null whenever the cache has expired or was never populated (ADR-0007). */
  readonly coordinate: CoordinateCache | null;
  readonly isCompleted: boolean;
}

/** The segment between two consecutive stops. */
export interface Leg {
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  /** Encoded polyline. Decoded once, at receipt, then memoised. */
  readonly polyline: string;
}

/** Whether a route returns to its origin. */
export type RouteShape = 'round-trip' | 'one-way';

/** Which engine served an optimization (ADR-0003). */
export type Tier = 'T0' | 'T1' | 'T2' | 'T3';

/** An ordered set of stops with its computed legs. The unit the user saves. */
export interface Route {
  readonly id: string;
  readonly name: string | null;
  readonly shape: RouteShape;
  readonly stops: readonly Stop[];
  readonly legs: readonly Leg[];
  readonly createdAt: string;
}

/**
 * The outcome of an optimization.
 *
 * A discriminated union rather than one type with optional fields (CLAUDE.md §3):
 * a degraded result and a traffic-aware result differ in what they can promise,
 * and a shared shape with `eta?: number` loses exactly that distinction.
 */
export type OptimizationResult =
  | {
      readonly tier: 'T0';
      /** Always true for T0. Ignores road network and traffic, and is labelled
       *  as such wherever it appears (CLAUDE.md §7 rule 6). */
      readonly isDegraded: true;
      readonly orderedStopIds: readonly string[];
      readonly totalDistanceMeters: number;
    }
  | {
      readonly tier: 'T1' | 'T2' | 'T3';
      readonly isDegraded: false;
      readonly orderedStopIds: readonly string[];
      readonly legs: readonly Leg[];
      readonly totalDistanceMeters: number;
      readonly totalDurationSeconds: number;
      /** Stops the engine could not reach. Reported, never silently dropped. */
      readonly unreachableStopIds: readonly string[];
    };

/** An external application we hand navigation off to. The app never navigates. */
export type NavigationProviderId = 'google-maps' | 'waze' | 'apple-maps';

/**
 * What a navigation provider can accept.
 *
 * A provider that cannot do chunked handoff reports it here; it does not throw
 * (CLAUDE.md §1, Liskov). Only Google Maps accepts multiple stops at once.
 */
export interface ProviderCapabilities {
  readonly id: NavigationProviderId;
  readonly canChunkHandoff: boolean;
  /** Nominal waypoints per handoff. The URL length ceiling is the real limit. */
  readonly maxWaypointsPerHandoff: number;
}

/** The server-held fact that a user may use metered features (ADR-0011). */
export type EntitlementStatus = 'trial' | 'active' | 'lapsed' | 'none';

/**
 * Which rung of the monetisation ladder a user is on (ADR-0015).
 *
 * This is not a synonym for `EntitlementStatus`. The two answer different
 * questions and can legitimately disagree: a `lapsed` subscriber is on the
 * `free` plan, and a `free` user is entitled to everything the free allowances
 * cover. Collapsing them into one value is what makes a lapsed user look
 * locked out of a product that still works for them.
 */
export type PlanTier = 'free' | 'day-pass' | 'pro';

/**
 * What a plan may do, per period.
 *
 * **The server is the source of these numbers** ([ADR-0011](../docs/adr/0011-server-side-quota-enforcement.md)).
 * They arrive on `/usage-quota` and move without an app release, which is the
 * control that keeps the ad-supported free tier cost-neutral. The constants in
 * `types/constants.ts` are the offline display fallback and nothing more —
 * a client that decides access from them has re-implemented the paywall in the
 * one place an attacker owns.
 */
export interface PlanAllowances {
  readonly plan: PlanTier;
  readonly maxStopsPerRoute: number;
  readonly optimizationsPerPeriod: number;
  readonly autocompleteSessionsPerPeriod: number;
  /** Kept route history. Free keeps a handful; Pro sells the rest (ADR-0015). */
  readonly savedRoutes: number;
  readonly showsAds: boolean;
}

/** What a user has actually consumed this period, as the server counts it. */
export interface PlanUsage {
  readonly optimizations: number;
  readonly autocompleteSessions: number;
}
