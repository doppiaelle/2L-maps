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

/**
 * What Google called this place, kept so a row can be read without buying it again.
 *
 * **The absence of this was the whole of "Address needs refreshing".** Autocomplete
 * returns the two lines a row displays — "Via Roma 12" / "Torino, TO, Italia" —
 * and the app threw them away at the moment of choosing, then made every row
 * depend on a second, billed `/place-details` round trip to recover text it had
 * already been given. A stop whose lookup had not landed showed a placeholder;
 * offline, it showed it for ever.
 *
 * **Not `label`.** That field is documented as user-authored and stored
 * indefinitely. This is Google-derived, so it perishes at thirty days on exactly
 * the same clock as a coordinate
 * ([ADR-0007](../docs/adr/0007-place-id-durable-coordinates-perishable.md)) —
 * which is why it carries its own `refreshedAt` rather than borrowing the
 * coordinate's, and why it is a separate field rather than a convenient string.
 */
export interface PlaceTextCache {
  /** The first line: the street and number, or the place's name. */
  readonly primaryText: string;
  /** The second: town, province, country. May be empty — some places have none. */
  readonly secondaryText: string;
  /** When Google last told us this. Drives expiry, same as a coordinate's. */
  readonly refreshedAt: string;
}

/** One place the user intends to visit. Not the same as a waypoint. */
export interface Stop {
  readonly id: string;
  readonly placeId: PlaceId;
  /** User-authored. User content, stored indefinitely. */
  readonly label: string | null;
  /** Google's own words for this place, perishable. Null when it was never
   *  captured — an older draft, or a stop typed by hand. */
  readonly placeText: PlaceTextCache | null;
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
  // `isCompleted` used to live here. It was the driver's answer to the Done
  // button, and both are gone: the drive happens inside a navigation app, so
  // nobody is in this one to say a stop is finished
  // ([ADR-0027](../docs/adr/0027-the-drive-happens-elsewhere.md)). The column
  // survives in the schema and is read back through `readStopState`.
}

/**
 * The segment between two consecutive waypoints.
 *
 * **Both ends are nullable, and each null means something specific.** A route
 * can begin somewhere that is not a stop — a saved starting place, or the
 * device's own position, which has no `place_id` and never will — so the first
 * leg has no stop to have come *from*. `null` says that, rather than naming a
 * stop the driver did not start at.
 *
 * The second reason is rarer and worse: if the upstream returns a different
 * number of legs than the journey has hops, every id after the discrepancy would
 * be attributed to the wrong segment. In that case all of them are null. A leg
 * that admits it does not know which stops it joins is recoverable; one that
 * confidently names the wrong pair is not.
 */
export interface Leg {
  readonly fromStopId: string | null;
  readonly toStopId: string | null;
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
 * Which rung of the monetisation ladder a user is on (ADR-0029).
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
 * control that keeps the free tier inside its measured acquisition budget.
 * The constants in `types/constants.ts` are the offline display fallback and nothing more —
 * a client that decides access from them has re-implemented the paywall in the
 * one place an attacker owns.
 */
export interface PlanAllowances {
  readonly plan: PlanTier;
  readonly maxStopsPerRoute: number;
  readonly optimizationsPerPeriod: number;
  readonly autocompleteSessionsPerPeriod: number;
}

/** What a user has actually consumed this period, as the server counts it. */
export interface PlanUsage {
  readonly optimizations: number;
  readonly autocompleteSessions: number;
}
