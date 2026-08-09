import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

import { createDraftRouteStore } from './route-planning/draft-route-store';
import { createPreferencesStore } from './preferences/preferences-store';
import { createRouteProgressStore } from './route-progress/route-progress-store';
import { createMutationQueueStore } from './sync/mutation-queue-store';
import { createUiStore } from './ui/ui-store';

/**
 * The application's store instances.
 *
 * Each store is a factory so that a test gets a fresh, isolated one
 * (`CLAUDE.md` §5) — but the app needs exactly one of each, and creating them
 * here rather than in a provider is what stops a remount from silently
 * discarding a route the user is part-way through.
 *
 * They stay small and feature-scoped. There is no single global store, because
 * a store holding unrelated concerns is a god object (`CLAUDE.md` §4).
 */

/**
 * Where persisted state actually goes.
 *
 * **Passing this is not optional, and omitting it is silent.** Each store
 * factory takes its storage and falls back to zustand's default when it is not
 * given one — and that default is `localStorage`, which React Native does not
 * have. The stores were created without it, so every one of them was persisted
 * in name only: `PERSISTED_STORES` was waited on at launch, `partialize` and
 * `migrate` were written and tested, and nothing was ever written to a disk.
 *
 * The failure has no symptom until the app is killed, which is the one moment
 * this product cannot afford it — the draft is the user's unsaved work and
 * route progress is the state it cannot reconstruct
 * (`docs/24_PERFORMANCE.md`, `docs/11_STATE_MANAGEMENT.md` §7).
 *
 * Typed per store because each one persists a different slice.
 */
const deviceStorage = <T>() => createJSONStorage<T>(() => AsyncStorage);

export const useDraftRouteStore = createDraftRouteStore(deviceStorage());
export const useRouteProgressStore = createRouteProgressStore(deviceStorage());
export const usePreferencesStore = createPreferencesStore(deviceStorage());
export const useMutationQueueStore = createMutationQueueStore(deviceStorage());
// Not persisted: which sheet detent is open and which stop is selected are
// moments, not state. Restoring them would reopen a sheet the user closed.
export const useUiStore = createUiStore();

/**
 * Every persisted store, so the launch sequence can wait for all of them.
 *
 * Navigation state and the draft route are restored *together*: restoring one
 * without the other puts the user on the right screen with the wrong contents,
 * which reads as data loss
 * ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md) §5).
 */
export const PERSISTED_STORES = [
  useDraftRouteStore,
  useRouteProgressStore,
  usePreferencesStore,
  useMutationQueueStore,
] as const;
