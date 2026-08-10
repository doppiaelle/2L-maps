import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

import { isRouteId, newRouteId } from '@/lib/route/route-id';
import {
  addStop,
  applyOptimizedOrder,
  applyResolvedCoordinates,
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
import type { ResolvedPlace } from '@/lib/route/plan-rows';
import type { OptimizationResult, RouteShape, Stop } from '@/types';

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
  /**
   * The last optimization result, **held in memory only**.
   *
   * Deliberately outside `partialize`. It carries Google-derived geometry — the
   * encoded polyline and per-leg figures — and a client-side store has no expiry
   * mechanism to hold it under the thirty-day rule
   * ([ADR-0007](../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
   * The server keeps it with a purge job; here it is re-read rather than cached,
   * which costs a request after a cold start and removes the whole question.
   *
   * Cleared by every structural edit, because the geometry described an order
   * that no longer exists.
   */
  readonly result: OptimizationResult | null;

  // Actions
  reset: (routeId: string) => void;
  /**
   * Replace the draft wholesale with one loaded from the server.
   *
   * The one action that takes a whole `DraftRoute` rather than an intent, and it
   * earns the exception: it is not an edit but a *restoration*, and there is no
   * smaller vocabulary for "this is now a different route". The invariants still
   * hold because the value came out of `fromRows`, which builds them.
   *
   * The result is cleared with it — the geometry described a different route.
   */
  replaceDraft: (draft: DraftRoute) => void;
  addStopToDraft: (stop: Stop) => void;
  removeStopById: (stopId: string) => void;
  undoRemove: () => void;
  moveStopTo: (fromIndex: number, toIndex: number) => void;
  setStopLabel: (stopId: string, label: string | null) => void;
  setRouteShape: (shape: RouteShape) => void;
  setOrigin: (placeId: string | null, isCurrentLocation: boolean) => void;
  applyResult: (result: OptimizationResult) => void;
  /**
   * Keep the coordinates a lookup just returned.
   *
   * The one write that stops a stop's address and marker depending on a live
   * round trip every time the screen renders (`applyResolvedCoordinates`).
   * Called by the screen when the places query lands, not by the query itself:
   * `lib/` decides, the store holds, and a query that reached into a store would
   * be server state writing into client state — the mistake `docs/11` §4 is about.
   */
  applyResolvedCoordinates: (resolved: ReadonlyMap<string, ResolvedPlace>, now: Date) => void;
  clearRefusal: () => void;

  // Derived, exposed so components never recompute domain rules themselves
  canOptimize: () => boolean;
  remainingCapacity: () => number;
}

export const DRAFT_ROUTE_STORAGE_KEY = 'draft-route';

/** Injected so a test drives persistence without a device, and so the production
 *  storage is chosen once, at composition, rather than imported here. */
export type DraftStorage = PersistStorage<Pick<DraftRouteState, 'draft'>>;

/**
 * Bumped whenever the persisted draft's shape changes.
 *
 * Version 1 adds `entryOrder` to each stop and `isOptimized` to the draft. A
 * stored draft written before them is not corrupt — it is simply short of two
 * fields, and reading it without filling them would sort stops by `undefined`
 * and claim an order nobody optimized.
 */
export const DRAFT_SCHEMA_VERSION = 1;

/**
 * Fill in what an older stored draft is missing.
 *
 * Returns `unknown` in, typed state out, and validates as it goes: persisted
 * data is a boundary like any other (`CLAUDE.md` §3), and this one is under the
 * user's own filesystem rather than ours. Anything unreadable falls back to an
 * empty draft — losing an old draft is bad, and restoring a broken one into the
 * screen the user works in is worse.
 */
export function migrateDraft(persisted: unknown, _version: number): { draft: DraftRoute } {
  const draft = (persisted as { draft?: unknown } | null)?.draft;
  // A fresh, valid id: the store's initial value is one too, and the literal
  // 'draft' it used to be is
  // replaced by `reset` the moment a real route is opened, and inventing a
  // different one here would make an unreadable draft look like a saved route.
  if (draft === null || typeof draft !== 'object') return { draft: emptyDraft(newRouteId()) };

  const shaped = draft as Partial<DraftRoute> & { stops?: unknown };
  const stops = Array.isArray(shaped.stops) ? (shaped.stops as Partial<Stop>[]) : [];

  return {
    draft: {
      // A draft stored before route ids were real carries the literal 'draft',
      // which `/optimize` refuses as a non-UUID. Migrated rather than preserved:
      // keeping it faithfully would carry the defect forward into a 400 the user
      // cannot act on.
      routeId: isRouteId(shaped.routeId) ? shaped.routeId : newRouteId(),
      originPlaceId: typeof shaped.originPlaceId === 'string' ? shaped.originPlaceId : null,
      originIsCurrentLocation: shaped.originIsCurrentLocation !== false,
      shape: shaped.shape === 'round-trip' ? 'round-trip' : 'one-way',
      // A draft written before `entryOrder` existed had exactly one order, so
      // its current positions *are* its entry order. Defaulting to the index is
      // the only answer that cannot invent history.
      stops: stops.map((stop, index) => ({
        ...(stop as Stop),
        position: index,
        entryOrder: typeof stop.entryOrder === 'number' ? stop.entryOrder : index,
      })),
      // Never assumed true: an old draft cannot prove an optimization produced
      // its order, and claiming one would put "Already the fastest order" on a
      // list the user typed themselves.
      isOptimized: shaped.isOptimized === true,
      isDegraded: shaped.isDegraded === true,
    },
  };
}

export function createDraftRouteStore(storage?: DraftStorage) {
  return create<DraftRouteState>()(
    persist(
      (set, get) => ({
        // A real UUID from the first render. `/optimize` validates this field as
        // a UUID and nothing ever called `reset` with one, so every new install
        // would have had its first optimization refused with 400.
        draft: emptyDraft(newRouteId()),
        lastRefusal: null,
        undoable: null,
        result: null,

        reset: (routeId) => {
          set({ draft: emptyDraft(routeId), lastRefusal: null, undoable: null, result: null });
        },

        replaceDraft: (draft) => {
          set({ draft, lastRefusal: null, undoable: null, result: null });
        },

        addStopToDraft: (stop) => {
          const result = addStop(get().draft, stop);
          set(
            result.ok
              ? { draft: result.draft, lastRefusal: null, result: null }
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
                  // The geometry described an order that no longer exists.
                  result: null,
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
              ? { draft: result.draft, lastRefusal: null, result: null }
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
          set({ draft: setShape(get().draft, shape), result: null });
        },

        setOrigin: (placeId, isCurrentLocation) => {
          const draft = get().draft;
          set({
            draft: {
              ...draft,
              originPlaceId: placeId,
              originIsCurrentLocation: isCurrentLocation,
              // A new origin invalidates the order: which stop is nearest depends
              // on where the user starts. Both flags go, not just the label.
              isOptimized: false,
              isDegraded: false,
            },
            result: null,
          });
        },

        applyResolvedCoordinates: (resolved, now) => {
          const draft = applyResolvedCoordinates(get().draft, resolved, now);
          // Identity is the signal: `applyResolvedCoordinates` returns the same
          // object when nothing needed writing, so an unchanged draft costs no
          // render and no persistence write.
          if (draft !== get().draft) set({ draft });
        },

        applyResult: (result) => {
          set({
            draft: applyOptimizedOrder(get().draft, result.orderedStopIds, result.isDegraded),
            result,
          });
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
        version: DRAFT_SCHEMA_VERSION,
        migrate: migrateDraft,
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
