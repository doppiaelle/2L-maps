import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

import { startedRoute, type RouteProgress } from '@/lib/route/progress';

/**
 * Route progress — the store where a lost write costs the most.
 *
 * The app is backgrounded for the entire drive. Between handing the route to a
 * navigation app and the next time anyone looks at the screen, the OS may kill
 * the process to reclaim memory, and it is likeliest to do so precisely while a
 * navigation app is in front. So the ordering rule is not a nicety
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §7):
 *
 * **Progress is written before the handoff, never after.** `beginAndHandOff`
 * exists so that ordering cannot be got wrong by a caller — a screen that wrote
 * progress after `Linking.openURL` would lose it exactly when the user has
 * invested the most, and the bug would only appear on a real drive.
 *
 * **There is far less to hold than there was.** This store used to carry a mark
 * per stop, because the driver returned to the app between every one of them and
 * pressed Done or Skip. They do not: the handoff gives the whole multi-stop day
 * to Google Maps, and the driver comes back when it is over
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)). What is left
 * is one fact — this route was handed over, at this time — which is also the one
 * thing that cannot be reconstructed from anything else.
 */

export type ProgressStorage = PersistStorage<{ progress: RouteProgress | null }>;

export const ROUTE_PROGRESS_STORAGE_KEY = '2l-maps.route-progress';

export interface RouteProgressStore {
  /** Null when no route has been handed over — which is also what tells the ads
   *  layer it may render (ADR-0015 rule 1). */
  readonly progress: RouteProgress | null;

  /** Record that this route has been handed to a navigation app. */
  begin: (routeId: string, at?: Date) => void;

  /** Abandon the current route. Deliberately not called `reset`: it discards
   *  the user's driving day, and the name should say so at the call site. */
  abandon: () => void;

  /**
   * Restore progress loaded from the server, including none.
   *
   * Distinct from `begin`, which stamps a fresh start time. Opening a route
   * another device set off on this morning must keep that morning's timestamp;
   * `begin` would rewrite it to now and make a day look like it had just begun.
   *
   * Null is a legitimate argument: it is what a route that has not been handed
   * over looks like, and passing it clears whatever the previous route left.
   */
  restore: (progress: RouteProgress | null) => void;

  /**
   * Persist the start, then hand off. The ordering is the point.
   *
   * `handOff` is awaited *after* the state write so that a process killed during
   * the launch still comes back to a route that knows it was started. If the
   * handoff itself fails the record stands — deciding whether the user set off
   * is not something an external app's launch failure gets to answer, and the
   * failure has its own visible message.
   */
  beginAndHandOff: (
    routeId: string,
    handOff: () => Promise<void>,
  ) => Promise<{ readonly handedOff: boolean }>;

  isUnderway: () => boolean;
}

export function createRouteProgressStore(storage?: ProgressStorage) {
  return create<RouteProgressStore>()(
    persist(
      (set, get) => ({
        progress: null,

        begin: (routeId, at) => {
          set({ progress: startedRoute(routeId, at ?? new Date()) });
        },

        abandon: () => {
          set({ progress: null });
        },

        restore: (progress) => {
          set({ progress });
        },

        beginAndHandOff: async (routeId, handOff) => {
          // Write first. Everything after this line may not happen.
          set({ progress: startedRoute(routeId, new Date()) });

          try {
            await handOff();
            return { handedOff: true };
          } catch {
            // The record stands. The user asked to set off, and an external app
            // failing to launch is a separate problem with its own message.
            return { handedOff: false };
          }
        },

        isUnderway: () => get().progress !== null,
      }),
      {
        name: ROUTE_PROGRESS_STORAGE_KEY,
        ...(storage === undefined ? {} : { storage }),
        partialize: (state) => ({ progress: state.progress }),
      },
    ),
  );
}

/** In-memory storage, for tests and for the case where no device storage is
 *  available. Named so its absence of durability is obvious at the call site. */
export function memoryProgressStorage(): ProgressStorage {
  const map = new Map<string, string>();
  return createJSONStorage(() => ({
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  })) as ProgressStorage;
}
