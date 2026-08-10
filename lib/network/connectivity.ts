/**
 * Connectivity, as the product understands it.
 *
 * **"Connected" is not the question.** A phone in a lift, a van in a tunnel, a
 * café portal that has not been signed into — all report a network interface and
 * none of them can reach our server. NetInfo distinguishes `isConnected` from
 * `isInternetReachable` for exactly this, and treating the first as the answer
 * is why offline handling in this class of app usually fails at the moment it
 * matters: parked in a basement car park, holding a phone that says it has
 * signal.
 *
 * So the states here are the product's, not the library's
 * ([ADR-0008](../../docs/adr/0008-offline-scope.md)):
 *
 * - **`online`** — something can be reached. Search may cost money.
 * - **`offline`** — nothing can. Reuse and the local cache carry the screen, and
 *   every affected control says why rather than failing on a tap.
 * - **`unknown`** — not yet determined, which is the first frame after launch.
 *   **It is treated as online**: guessing offline would disable search on a
 *   working connection for as long as the first probe takes, and the request
 *   would have told us the truth anyway.
 */

export type Connectivity = 'online' | 'offline' | 'unknown';

/** What NetInfo reports, described in its own terms so the adapter is the only
 *  thing that knows the library exists (`CLAUDE.md` §0 rule 2). */
export interface ConnectivitySnapshot {
  readonly isConnected: boolean | null;
  /** Null while the reachability probe is still in flight — a real and common
   *  state on a cold start, and not the same as false. */
  readonly isInternetReachable: boolean | null;
}

/** Subscribe to changes and get the current value. Injected, so every state
 *  below is reachable in a test without a radio. */
export interface ConnectivityPort {
  subscribe: (listener: (snapshot: ConnectivitySnapshot) => void) => () => void;
  current: () => Promise<ConnectivitySnapshot>;
}

/**
 * Read a snapshot as one of three answers.
 *
 * Reachability outranks connection, because it is the stricter and more useful
 * claim: a captive portal is connected and unreachable, and the user is offline
 * for every purpose this app has.
 */
export function connectivityOf(snapshot: ConnectivitySnapshot): Connectivity {
  if (snapshot.isConnected === false) return 'offline';
  if (snapshot.isInternetReachable === false) return 'offline';
  if (snapshot.isConnected === null && snapshot.isInternetReachable === null) return 'unknown';
  // Connected, with reachability either confirmed or still being probed. The
  // probe takes a second or two and disabling search for it would be a visible
  // regression on a working connection.
  return 'online';
}

/** Whether to stop the user before they spend a request. `unknown` is not a
 *  refusal: the request itself is the fastest way to find out. */
export function isOffline(connectivity: Connectivity): boolean {
  return connectivity === 'offline';
}
