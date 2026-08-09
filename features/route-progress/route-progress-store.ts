import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

import {
  emptyProgress,
  hasStarted,
  markStop,
  nextStop,
  pruneToStops,
  stateOf,
  stopsForReoptimization,
  summarise,
  type RouteProgress,
  type StopProgressState,
} from '@/lib/route/progress';
import type { Stop } from '@/types';

/**
 * Route progress — the store where a lost write costs the most.
 *
 * The app is backgrounded for the entire drive. Between marking a stop done and
 * the next time anyone looks at the screen, the OS may kill the process to
 * reclaim memory, and it is likeliest to do so precisely while a navigation app
 * is in front. So the ordering rule is not a nicety
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §7):
 *
 * **Progress is written before the handoff, never after.** `markAndHandOff`
 * exists so that ordering cannot be got wrong by a caller — a screen that wrote
 * progress after `Linking.openURL` would lose it exactly when the user has
 * invested the most, and the bug would only appear on a real drive.
 *
 * All the rules live in `lib/route/progress` as pure functions. This store holds
 * state and sequences effects; it decides nothing (`CLAUDE.md` §1).
 */

export type ProgressStorage = PersistStorage<{ progress: RouteProgress | null }>;

export const ROUTE_PROGRESS_STORAGE_KEY = '2l-maps.route-progress';

export interface RouteProgressStore {
  /** Null when no route is in progress — which is also what tells the ads layer
   *  it may render (ADR-0015 rule 1). */
  readonly progress: RouteProgress | null;

  begin: (routeId: string) => void;
  /** Abandon the current route. Deliberately not called `reset`: it discards
   *  the user's driving day, and the name should say so at the call site. */
  abandon: () => void;

  mark: (stopId: string, state: Exclude<StopProgressState, 'pending'>) => void;

  /**
   * Persist progress, then hand off. The ordering is the point.
   *
   * `handOff` is awaited *after* the state write so that a process killed
   * during the launch still comes back to a route that knows where it was. If
   * the handoff itself fails the mark stands — the user did visit the stop, and
   * un-marking it because an external app misbehaved would be the wrong
   * correction.
   */
  markAndHandOff: (
    stopId: string,
    state: Exclude<StopProgressState, 'pending'>,
    handOff: () => Promise<void>,
  ) => Promise<{ readonly handedOff: boolean }>;

  /** Drop progress for stops that no longer exist, after an edit. */
  pruneTo: (stops: readonly Stop[]) => void;

  stateOfStop: (stopId: string) => StopProgressState;
  next: (orderedStops: readonly Stop[]) => Stop | null;
  summary: (orderedStops: readonly Stop[]) => ReturnType<typeof summarise> | null;
  /** Which stops a mid-route re-optimization should still consider. */
  remainingFor: (orderedStops: readonly Stop[]) => readonly Stop[];
  isUnderway: () => boolean;
}

export function createRouteProgressStore(storage?: ProgressStorage) {
  return create<RouteProgressStore>()(
    persist(
      (set, get) => ({
        progress: null,

        begin: (routeId) => {
          set({ progress: emptyProgress(routeId) });
        },

        abandon: () => {
          set({ progress: null });
        },

        mark: (stopId, state) => {
          const current = get().progress;
          if (current === null) return;
          set({ progress: markStop(current, stopId, state) });
        },

        markAndHandOff: async (stopId, state, handOff) => {
          const current = get().progress;
          if (current === null) return { handedOff: false };

          // Write first. Everything after this line may not happen.
          set({ progress: markStop(current, stopId, state) });

          try {
            await handOff();
            return { handedOff: true };
          } catch {
            // The mark stands. The user did visit the stop; the external app
            // failing to launch is a separate problem with its own message.
            return { handedOff: false };
          }
        },

        pruneTo: (stops) => {
          const current = get().progress;
          if (current === null) return;
          set({ progress: pruneToStops(current, stops) });
        },

        stateOfStop: (stopId) => {
          const current = get().progress;
          return current === null ? 'pending' : stateOf(current, stopId);
        },

        next: (orderedStops) => {
          const current = get().progress;
          return current === null ? null : nextStop(current, orderedStops);
        },

        summary: (orderedStops) => {
          const current = get().progress;
          return current === null ? null : summarise(current, orderedStops);
        },

        remainingFor: (orderedStops) => {
          const current = get().progress;
          return current === null ? orderedStops : stopsForReoptimization(current, orderedStops);
        },

        isUnderway: () => {
          const current = get().progress;
          return current !== null && hasStarted(current);
        },
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
