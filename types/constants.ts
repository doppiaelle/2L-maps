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

/**
 * Address search is the largest single COGS line.
 *
 * The minimum length is the only client-side gate left, and it is enforced
 * server-side too: below it Google answers with noise, and we would have paid a
 * round trip to be told what we already knew.
 *
 * **There is no debounce constant any more.** There was — 300 ms — and it bounded
 * requests per *pause in typing* rather than per address, so a single street name
 * cost four or five calls out of a monthly allowance of ten. The trigger moved to
 * an explicit press instead ([ADR-0019](../docs/adr/0019-explicit-address-search.md)),
 * which bounds it at one, and a debounce on a button nobody presses twice is a
 * number with nothing to do.
 */
export const AUTOCOMPLETE_MIN_CHARACTERS = 3;

// ─── Rendering ───────────────────────────────────────────────────────────────
// docs/24_PERFORMANCE.md

/** Above this many markers, clustering is mandatory to hold 60 fps. */
export const MARKER_CLUSTER_THRESHOLD = 15;

/** Above this many rows, virtualisation is mandatory. */
export const LIST_VIRTUALISATION_THRESHOLD = 20;

/**
 * How long an undo stays available after a destructive action
 * (docs/06_UX_GUIDELINES.md P8).
 *
 * Long enough to read the toast, understand what happened and reach the control
 * one-handed; short enough that it is gone before the next action. The window
 * **pauses while the app is backgrounded**, so this is six seconds of the user's
 * attention rather than six seconds of wall clock — an interruption is exactly
 * when they most need the undo still to be there.
 */
export const UNDO_WINDOW_MS = 6000;

// ─── Subscription ────────────────────────────────────────────────────────────
// ADR-0002 · ADR-0015 · docs/20_SUBSCRIPTIONS.md

/** The introductory period, at €0, metered exactly like a paid subscription. */
export const TRIAL_DURATION_DAYS = 7;

/** A day pass buys this many hours of Pro. Consumable, server-held balance. */
export const DAY_PASS_DURATION_HOURS = 24;

// ─── Plan allowances ─────────────────────────────────────────────────────────
// ADR-0015 · docs/20_SUBSCRIPTIONS.md · docs/31_COST_MODEL.md
//
// **These are display fallbacks, not the rule.** The server decides access and
// sends the live numbers on `/usage-quota` (ADR-0011); these exist so the app
// can render a sensible allowance bar before that response arrives, and offline.
// A client that gates a feature on these has moved the paywall to the one
// machine the user controls.
//
// Free is capped on address search, not on stops: autocomplete is 78% of COGS
// and a route costs $0.01 whether it has 8 stops or 25 (docs/31_COST_MODEL.md §8).
// Being stingy about stops would save nothing and make the free tier feel mean
// at exactly the moment a user is deciding whether the product works.

/** Generous on purpose, and free of marginal cost. */
export const FREE_MAX_STOPS = 15;

/** T1 optimizations per month on free. Past this the app degrades to T0, which
 *  costs nothing and needs no network — a free user is never locked out, only
 *  labelled (ADR-0003, ADR-0015). */
export const FREE_OPTIMIZATIONS_PER_MONTH = 15;

/** The real limit. ~$0.02 a session is where the free tier's money goes. */
export const FREE_AUTOCOMPLETE_SESSIONS_PER_MONTH = 10;

/** Free keeps a handful of routes; history is something Pro sells. */
export const FREE_SAVED_ROUTES = 3;
