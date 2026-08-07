/**
 * Domain constants.
 *
 * Every value here cites the document that owns it. The document is the source;
 * this file is a reference to it (CLAUDE.md §13 rule 9). Changing a number here
 * without changing the document it cites is a defect, and the test beside this
 * file exists to make that disagreement fail rather than ship.
 *
 * These constants are imported by both the Expo client and the Deno Edge
 * Functions, which is why this module holds no runtime dependency of any kind.
 */

// ─── Route size ──────────────────────────────────────────────────────────────
// docs/01_PRODUCT_REQUIREMENTS.md FR-07 · docs/04_FEATURES.md

/** Fewer than two stops is not a route. */
export const MIN_STOPS = 2;

/** The user-facing ceiling, stated before it is reached, never on hitting it. */
export const MAX_STOPS = 25;

// ─── Optimization tiers ──────────────────────────────────────────────────────
// ADR-0003 · docs/15_ROUTE_OPTIMIZATION.md

/** Above this, the local heuristic is no longer offered — its quality falls away
 *  faster than the user's tolerance for a wrong order. */
export const MAX_STOPS_T0 = 8;

/** `optimizeWaypointOrder` accepts at most this many intermediate waypoints.
 *  Above it the server escalates to T2. docs/33_API_CONTRACTS.md CR-05. */
export const MAX_STOPS_T1 = 25;

// ─── Coordinate durability ───────────────────────────────────────────────────
// ADR-0007 · docs/32_LEGAL_COMPLIANCE.md

/** Coordinates may be cached for at most this many consecutive days. This is a
 *  platform-terms obligation, not a tuning parameter: exceeding it is a breach,
 *  not a stale cache. `place_id` is storable indefinitely and is the durable key. */
export const COORDINATE_MAX_AGE_DAYS = 30;

// ─── Handoff ─────────────────────────────────────────────────────────────────
// docs/16_INTERNAL_NAVIGATION.md · ADR-0004

/** Google Maps universal links stop working beyond this URL length. Chunks are
 *  sized by measuring the built URL, never by counting stops — long Italian
 *  addresses breach the ceiling before the nominal stop count is reached. */
export const HANDOFF_URL_MAX_LENGTH = 2048;

/** The nominal number of waypoints a Google Maps handoff carries. Advisory: the
 *  URL length above is the real limit. */
export const HANDOFF_NOMINAL_WAYPOINTS = 9;

// ─── Cost control ────────────────────────────────────────────────────────────
// docs/31_COST_MODEL.md · docs/24_PERFORMANCE.md

/** Autocomplete is the largest single COGS line. Both of these serve cost and
 *  perceived performance at once, which is why neither is tuned for feel alone. */
export const AUTOCOMPLETE_DEBOUNCE_MS = 300;
export const AUTOCOMPLETE_MIN_CHARACTERS = 3;

// ─── Rendering ───────────────────────────────────────────────────────────────
// docs/24_PERFORMANCE.md

/** Above this many markers, clustering is mandatory to hold 60 fps. */
export const MARKER_CLUSTER_THRESHOLD = 15;

/** Above this many rows, virtualisation is mandatory. */
export const LIST_VIRTUALISATION_THRESHOLD = 20;

// ─── Subscription ────────────────────────────────────────────────────────────
// ADR-0002 · docs/20_SUBSCRIPTIONS.md

/** The introductory period, at €0, metered exactly like a paid subscription. */
export const TRIAL_DURATION_DAYS = 7;
