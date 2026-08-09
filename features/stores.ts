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

export const useDraftRouteStore = createDraftRouteStore();
export const useRouteProgressStore = createRouteProgressStore();
export const usePreferencesStore = createPreferencesStore();
export const useMutationQueueStore = createMutationQueueStore();
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
