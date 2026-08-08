import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

import {
  addStop,
  applyOptimizedOrder,
  emptyDraft,
  labelStop,
  moveStop,
  readiness,
  remainingCapacity,
  removeStop,
  restoreStop,
  setShape,
  type DraftRefusal,
  type DraftRoute,
} from '@/lib/route/draft';
import type { RouteShape, Stop } from '@/types';

/**
 * The draft route store.
 *
 * Small and feature-scoped; there is no single global store (CLAUDE.md §4).
 *
 * **Actions, not setters.** `removeStopById(id)` rather than `setStops(array)` —
 * the store owns its invariants, so no caller can leave it in a state the domain
 * forbids. A setter hands that responsibility to every call site, and one of them
 * eventually gets it wrong.
 *
 * The store holds state and decides nothing: every rule lives in `lib/route/draft`
 * as a pure function, tested without mounting anything.
 *
 * **Persisted eagerly and never evicted.** This is the user's unsaved work; under
 * memory pressure the OS may ask for anything back except this
 * (docs/24_PERFORMANCE.md).
 */

/** The last refusal, so the UI can explain rather than appear to ignore a tap. */
export interface LastRefusal {
  readonly action: 'add' | 'remove' | 'move' | 'label';
  readonly refusal: DraftRefusal;
}

/** What undo needs to put a removed stop back exactly where it was. */
interface UndoEntry {
  readonly stop: Stop;
  readonly atIndex: number;
}

export interface DraftRouteState {
  readonly draft: DraftRoute;
  readonly lastRefusal: LastRefusal | null;
  readonly undoable: UndoEntry | null;

  // Actions
  reset: (routeId: string) => void;
  addStopToDraft: (stop: Stop) => void;
  removeStopById: (stopId: string) => void;
  undoRemove: () => void;
  moveStopTo: (fromIndex: number, toIndex: number) => void;
  setStopLabel: (stopId: string, label: string | null) => void;
  setRouteShape: (shape: RouteShape) => void;
  setOrigin: (placeId: string | null, isCurrentLocation: boolean) => void;
  applyResult: (orderedStopIds: readonly string[], isDegraded: boolean) => void;
  clearRefusal: () => void;

  // Derived, exposed so components never recompute domain rules themselves
  canOptimize: () => boolean;
  remainingCapacity: () => number;
}

export const DRAFT_ROUTE_STORAGE_KEY = 'draft-route';

/** Injected so a test drives persistence without a device, and so the production
 *  storage is chosen once, at composition, rather than imported here. */
export type DraftStorage = PersistStorage<Pick<DraftRouteState, 'draft'>>;

export function createDraftRouteStore(storage?: DraftStorage) {
  return create<DraftRouteState>()(
    persist(
      (set, get) => ({
        draft: emptyDraft('draft'),
        lastRefusal: null,
        undoable: null,

        reset: (routeId) => {
          set({ draft: emptyDraft(routeId), lastRefusal: null, undoable: null });
        },

        addStopToDraft: (stop) => {
          const result = addStop(get().draft, stop);
          set(
            result.ok
              ? { draft: result.draft, lastRefusal: null }
              : { lastRefusal: { action: 'add', refusal: result.refusal } },
          );
        },

        removeStopById: (stopId) => {
          const result = removeStop(get().draft, stopId);
          set(
            result.ok
              ? {
                  draft: result.draft,
                  lastRefusal: null,
                  // Held so the toast can offer undo. A destructive action is
                  // undoable, not confirmed (CLAUDE.md §7 rule 7).
                  undoable: { stop: result.removed, atIndex: result.atIndex },
                }
              : { lastRefusal: { action: 'remove', refusal: result.refusal } },
          );
        },

        undoRemove: () => {
          const { undoable, draft } = get();
          if (undoable === null) return;
          set({ draft: restoreStop(draft, undoable.stop, undoable.atIndex), undoable: null });
        },

        moveStopTo: (fromIndex, toIndex) => {
          const result = moveStop(get().draft, fromIndex, toIndex);
          set(
            result.ok
              ? { draft: result.draft, lastRefusal: null }
              : { lastRefusal: { action: 'move', refusal: result.refusal } },
          );
        },

        setStopLabel: (stopId, label) => {
          const result = labelStop(get().draft, stopId, label);
          set(
            result.ok
              ? { draft: result.draft, lastRefusal: null }
              : { lastRefusal: { action: 'label', refusal: result.refusal } },
          );
        },

        setRouteShape: (shape) => {
          set({ draft: setShape(get().draft, shape) });
        },

        setOrigin: (placeId, isCurrentLocation) => {
          const draft = get().draft;
          set({
            draft: {
              ...draft,
              originPlaceId: placeId,
              originIsCurrentLocation: isCurrentLocation,
              // A new origin invalidates the order: which stop is nearest depends
              // on where the user starts.
              isDegraded: false,
            },
          });
        },

        applyResult: (orderedStopIds, isDegraded) => {
          set({ draft: applyOptimizedOrder(get().draft, orderedStopIds, isDegraded) });
        },

        clearRefusal: () => {
          set({ lastRefusal: null });
        },

        canOptimize: () => readiness(get().draft).canOptimize,
        remainingCapacity: () => remainingCapacity(get().draft),
      }),
      {
        name: DRAFT_ROUTE_STORAGE_KEY,
        ...(storage === undefined ? {} : { storage }),
        // Only the draft is persisted. A refusal and an undo offer are moments,
        // not state: restoring them would show the user a toast for something
        // they did before the app was killed.
        partialize: (state) => ({ draft: state.draft }),
      },
    ),
  );
}

/** In-memory storage, for tests and for the case where no device storage is
 *  available. Named so its absence of durability is obvious at the call site. */
export function memoryDraftStorage(): DraftStorage {
  const map = new Map<string, string>();
  return createJSONStorage(() => ({
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  })) as DraftStorage;
}
