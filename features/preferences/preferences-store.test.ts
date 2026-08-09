import {
  createPreferencesStore,
  DEFAULT_PREFERENCES,
  memoryPreferencesStorage,
} from './preferences-store';
import { createUiStore } from '../ui/ui-store';

/**
 * Two stores, opposite decisions about persistence, tested together because the
 * contrast is the point: preferences must survive a reinstall-shaped gap, and
 * interface state must not survive at all.
 */

describe('preferences default to following the system', () => {
  it('starts with no override for theme or units', () => {
    // Null means follow the device. A user who set their phone to dark at night
    // meant it, and a default of 'light' would override that silently.
    const store = createPreferencesStore(memoryPreferencesStorage());
    expect(store.getState().preferences).toEqual(DEFAULT_PREFERENCES);
    expect(store.getState().preferences.theme).toBeNull();
    expect(store.getState().preferences.units).toBeNull();
  });

  it('does not decide a navigation provider for the user up front', () => {
    const store = createPreferencesStore(memoryPreferencesStorage());
    expect(store.getState().preferences.navigationProvider).toBeNull();
    expect(store.getState().preferences.alwaysUsePreferredProvider).toBe(false);
  });
});

describe('the remembered navigation provider', () => {
  it('is only remembered when the user asked for it to be', () => {
    const store = createPreferencesStore(memoryPreferencesStorage());
    store.getState().chooseNavigationProvider('waze', false);

    expect(store.getState().preferences.navigationProvider).toBe('waze');
    expect(store.getState().preferences.alwaysUsePreferredProvider).toBe(false);
  });

  it('clears the choice and the always-flag together', () => {
    // Remembering "always use my choice" while having forgotten the choice
    // would skip the chooser and then hand off to nothing.
    const store = createPreferencesStore(memoryPreferencesStorage());
    store.getState().chooseNavigationProvider('waze', true);

    store.getState().forgetNavigationProvider();
    expect(store.getState().preferences.navigationProvider).toBeNull();
    expect(store.getState().preferences.alwaysUsePreferredProvider).toBe(false);
  });

  it('survives a restart', async () => {
    const storage = memoryPreferencesStorage();
    const before = createPreferencesStore(storage);
    before.getState().chooseNavigationProvider('google-maps', true);
    before.getState().chooseTheme('dark');

    const after = createPreferencesStore(storage);
    await after.persist.rehydrate();

    expect(after.getState().preferences.navigationProvider).toBe('google-maps');
    expect(after.getState().preferences.theme).toBe('dark');
  });

  it('gives a field added in a later version its default, not a parsed absence', async () => {
    // The upgrade case: stored JSON from an older build has no
    // `alwaysUsePreferredProvider`. Merging over the defaults means it arrives
    // as `false` because that is the default, not because JSON.parse said so.
    const storage = memoryPreferencesStorage();
    await storage.setItem('2l-maps.preferences', {
      state: { preferences: { navigationProvider: 'waze' } },
      version: 0,
    } as never);

    const store = createPreferencesStore(storage);
    await store.persist.rehydrate();

    expect(store.getState().preferences.navigationProvider).toBe('waze');
    expect(store.getState().preferences.alwaysUsePreferredProvider).toBe(false);
    expect(store.getState().preferences.units).toBeNull();
  });
});

describe('interface state is deliberately not persisted', () => {
  it('starts fresh every time', () => {
    // Restoring a detent, a selection and a camera would drop the user into a
    // view they have no memory of choosing — over a city they have left.
    const store = createUiStore();
    expect(store.getState().detent).toBe('half');
    expect(store.getState().selectedStopId).toBeNull();
    expect(store.getState().camera).toBeNull();
    expect(store.getState().isOptimizing).toBe(false);
  });

  it('has no persistence attached at all', () => {
    // Not "persists nothing" — genuinely has no persist middleware, so a later
    // change cannot accidentally start storing it.
    const store = createUiStore() as unknown as { persist?: unknown };
    expect(store.persist).toBeUndefined();
  });

  it('raises the sheet when a stop is selected from a collapsed sheet', () => {
    // A selection the user cannot see is not a selection.
    const store = createUiStore();
    store.getState().setDetent('collapsed');
    store.getState().selectStop('stop-1');

    expect(store.getState().selectedStopId).toBe('stop-1');
    expect(store.getState().detent).toBe('half');
  });

  it('leaves an already-open sheet where the user put it', () => {
    const store = createUiStore();
    store.getState().setDetent('expanded');
    store.getState().selectStop('stop-1');

    expect(store.getState().detent).toBe('expanded');
  });
});
