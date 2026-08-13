import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

import type { NavigationProviderId } from '@/types';

/**
 * User preferences.
 *
 * Small on purpose. Everything here is a choice the user made explicitly and
 * would be annoyed to make twice, which is the test for whether something
 * belongs in this store at all.
 *
 * **Nothing here is a domain rule.** The preferred navigation provider is a
 * preference; whether that provider can carry nine waypoints is a capability,
 * and lives in `lib/handoff`. Storing a capability here would let a stale
 * persisted value outlive a code change that corrected it.
 */

/** `null` means follow the system, which is the default and the right one:
 *  a user who has set their phone to dark at night meant it. */
export type ThemePreference = 'light' | 'dark' | null;

/** `null` follows the device locale (`lib/format/units` does the deriving).
 *  Explicit only when the user overrode it — a British user in Italy. */
export type UnitPreference = 'metric' | 'imperial' | null;

export interface Preferences {
  /** The navigator selected in the single settings surface. */
  readonly navigationProvider: NavigationProviderId;
  readonly theme: ThemePreference;
  readonly units: UnitPreference;
}

export const DEFAULT_PREFERENCES: Preferences = {
  navigationProvider: 'google-maps',
  theme: null,
  units: null,
};

export type PreferencesStorage = PersistStorage<{ preferences: Preferences }>;

export const PREFERENCES_STORAGE_KEY = '2l-maps.preferences';

export interface PreferencesStore {
  readonly preferences: Preferences;

  chooseNavigationProvider: (provider: NavigationProviderId) => void;
  chooseTheme: (theme: ThemePreference) => void;
  chooseUnits: (units: UnitPreference) => void;
}

export function createPreferencesStore(storage?: PreferencesStorage) {
  return create<PreferencesStore>()(
    persist(
      (set, get) => ({
        preferences: DEFAULT_PREFERENCES,

        chooseNavigationProvider: (provider) => {
          set({
            preferences: {
              ...get().preferences,
              navigationProvider: provider,
            },
          });
        },

        chooseTheme: (theme) => {
          set({ preferences: { ...get().preferences, theme } });
        },

        chooseUnits: (units) => {
          set({ preferences: { ...get().preferences, units } });
        },
      }),
      {
        name: PREFERENCES_STORAGE_KEY,
        ...(storage === undefined ? {} : { storage }),
        partialize: (state) => ({ preferences: state.preferences }),
        // A preference added in a later version must not read as "the user
        // chose false". Merging over the defaults means a new field arrives at
        // its default rather than at whatever JSON.parse produced.
        merge: (persisted, current) => ({
          ...current,
          preferences: {
            ...DEFAULT_PREFERENCES,
            ...(typeof persisted === 'object' && persisted !== null
              ? ((persisted as { preferences?: Partial<Preferences> }).preferences ?? {})
              : {}),
          },
        }),
      },
    ),
  );
}

/** In-memory storage, for tests and for the case where no device storage is
 *  available. Named so its absence of durability is obvious at the call site. */
export function memoryPreferencesStorage(): PreferencesStorage {
  const map = new Map<string, string>();
  return createJSONStorage(() => ({
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  })) as PreferencesStorage;
}
