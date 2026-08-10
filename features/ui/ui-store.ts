import { create } from 'zustand';

import type { LatLng } from '@/lib/geo/haversine';
import type { ActiveSection, DockSection } from '@/lib/ui/dock';

/**
 * Transient interface state.
 *
 * **Deliberately not persisted**, and that is the whole design decision
 * ([`docs/11_STATE_MANAGEMENT.md`](../../docs/11_STATE_MANAGEMENT.md) §7).
 * Restoring an open section, a selected stop and a camera position across a cold
 * start would drop the user back into a view they have no memory of choosing —
 * scrolled to a stop they looked at yesterday, over a city they have left.
 * Everything here should be re-derivable from the route and the device's
 * current location in the first frame.
 *
 * It is also the only store with no counterpart in `lib/`, because none of it
 * is a domain decision. If a rule ever needs to live here, it is in the wrong
 * place.
 */

export interface UiStore {
  /**
   * Which dock section is open, or `null` for the bare map
   * ([ADR-0018](../../docs/adr/0018-bottom-dock-navigation.md)).
   *
   * This replaces `detent`, which described how far a bottom sheet had been
   * dragged. The type also used to be declared twice — once here and once in
   * `lib/ui/sheet.ts` — as two structurally identical types with no relationship
   * to each other. `DockSection` is imported, so there is one.
   */
  readonly activeSection: ActiveSection;
  readonly selectedStopId: string | null;
  readonly camera: LatLng | null;
  /** True from the moment an optimization is requested until a result or a
   *  failure lands. Drives the action control's progress, never a blocking
   *  overlay — the map stays usable while we wait. */
  readonly isOptimizing: boolean;

  openSection: (section: DockSection) => void;
  closeSection: () => void;
  /** Selecting a stop opens the route section, because a selection the user
   *  cannot see is not a selection. Coupling the two here keeps every call site
   *  from having to remember it. */
  selectStop: (stopId: string) => void;
  clearSelection: () => void;
  moveCamera: (camera: LatLng) => void;
  setOptimizing: (isOptimizing: boolean) => void;
}

export const createUiStore = () =>
  create<UiStore>()((set, get) => ({
    // Opens on the map. The route section is one tap away and the map is what
    // orients someone who has just unlocked their phone (ADR-0018).
    activeSection: null,
    selectedStopId: null,
    camera: null,
    isOptimizing: false,

    openSection: (section) => {
      set({ activeSection: section });
    },

    closeSection: () => {
      set({ activeSection: null });
    },

    selectStop: (stopId) => {
      set({
        selectedStopId: stopId,
        // Tapping a marker on the bare map opens the route, so the row that was
        // just selected is somewhere the user can actually see it. A section
        // already open is left alone: they chose it.
        activeSection: get().activeSection ?? 'itinerary',
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
