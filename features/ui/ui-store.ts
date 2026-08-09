import { create } from 'zustand';

import type { LatLng } from '@/lib/geo/haversine';

/**
 * Transient interface state.
 *
 * **Deliberately not persisted**, and that is the whole design decision
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §7).
 * Restoring a sheet detent, a selected stop and a camera position across a cold
 * start would drop the user back into a view they have no memory of choosing —
 * scrolled to a stop they looked at yesterday, over a city they have left.
 * Everything here should be re-derivable from the route and the device's
 * current location in the first frame.
 *
 * It is also the only store with no counterpart in `lib/`, because none of it
 * is a domain decision. If a rule ever needs to live here, it is in the wrong
 * place.
 */

/** The stop list is a bottom sheet at every size, never a sidebar
 *  ([ADR-0010](../../docs/adr/0010-mobile-only-scope.md)). */
export type SheetDetent = 'collapsed' | 'half' | 'expanded';

export interface UiStore {
  readonly detent: SheetDetent;
  readonly selectedStopId: string | null;
  readonly camera: LatLng | null;
  /** True from the moment an optimization is requested until a result or a
   *  failure lands. Drives the action control's progress, never a blocking
   *  overlay — the map stays usable while we wait. */
  readonly isOptimizing: boolean;

  setDetent: (detent: SheetDetent) => void;
  /** Selecting a stop raises the sheet, because a selection the user cannot see
   *  is not a selection. Coupling the two here keeps every call site from
   *  having to remember it. */
  selectStop: (stopId: string) => void;
  clearSelection: () => void;
  moveCamera: (camera: LatLng) => void;
  setOptimizing: (isOptimizing: boolean) => void;
}

export const createUiStore = () =>
  create<UiStore>()((set, get) => ({
    detent: 'half',
    selectedStopId: null,
    camera: null,
    isOptimizing: false,

    setDetent: (detent) => {
      set({ detent });
    },

    selectStop: (stopId) => {
      set({
        selectedStopId: stopId,
        detent: get().detent === 'collapsed' ? 'half' : get().detent,
      });
    },

    clearSelection: () => {
      set({ selectedStopId: null });
    },

    moveCamera: (camera) => {
      set({ camera });
    },

    setOptimizing: (isOptimizing) => {
      set({ isOptimizing });
    },
  }));
