import type { HandoffTarget } from '@/lib/providers/types';

import { createNavigationProvider } from './navigation-adapter';
import type { LinkingPort } from './navigation-adapter';

/**
 * The handoff is the product's exit path, so these tests are mostly about the
 * asymmetry between providers: only Google Maps carries multiple waypoints,
 * only Waze insists on coordinates, and only Apple Maps cannot exist on
 * Android. A test suite that treated them uniformly would pass while the app
 * silently dropped stops.
 */

const stub = (
  overrides: Partial<LinkingPort> & { opened?: string[] } = {},
): LinkingPort & { opened: string[] } => {
  const opened: string[] = overrides.opened ?? [];
  return {
    opened,
    canOpenUrl: overrides.canOpenUrl ?? (async () => true),
    openUrl:
      overrides.openUrl ??
      (async (url: string) => {
        opened.push(url);
      }),
  };
};

const target = (
  id: string,
  coordinate: { latitude: number; longitude: number } | null = {
    latitude: 45.7,
    longitude: 9.7,
  },
): HandoffTarget => ({
  placeId: id,
  coordinate,
  address: `Via ${id} 1, Bergamo`,
});

describe('which providers are offered', () => {
  it('always offers Google Maps, installed or not', async () => {
    // We hand off with the universal link, which resolves in the browser when
    // the app is absent — worse, not dead. Gating it would remove the only
    // provider that carries waypoints from the users least likely to have
    // an alternative.
    const linking = stub({ canOpenUrl: async () => false });
    const provider = createNavigationProvider({ linking, platform: 'android' });

    expect(await provider.installedProviders()).toContain('google-maps');
  });

  it('offers Waze only when it is actually installed', async () => {
    // Waze takes coordinates and has no web form we can hand a route to, so
    // without the app the link is simply dead.
    const present = createNavigationProvider({
      linking: stub({ canOpenUrl: async (url) => url.startsWith('waze') }),
      platform: 'android',
    });
    expect(await present.installedProviders()).toContain('waze');

    const absent = createNavigationProvider({
      linking: stub({ canOpenUrl: async () => false }),
      platform: 'android',
    });
    expect(await absent.installedProviders()).not.toContain('waze');
  });

  it('never offers Apple Maps on Android, and always on iOS', async () => {
    const android = createNavigationProvider({
      linking: stub({ canOpenUrl: async () => true }),
      platform: 'android',
    });
    expect(await android.installedProviders()).not.toContain('apple-maps');

    const ios = createNavigationProvider({
      // Even with the probe refusing: it is a system app and uninstallable.
      linking: stub({ canOpenUrl: async () => false }),
      platform: 'ios',
    });
    expect(await ios.installedProviders()).toContain('apple-maps');
  });

  it('treats a probe that throws as an absent app', async () => {
    const linking = stub({
      canOpenUrl: async () => {
        throw new Error('scheme not declared');
      },
    });
    const provider = createNavigationProvider({ linking, platform: 'android' });
    expect(await provider.installedProviders()).toEqual(['google-maps']);
  });
});

describe('opening a handoff', () => {
  it('opens one URL for the whole chunk', async () => {
    const linking = stub();
    const provider = createNavigationProvider({ linking, platform: 'android' });

    const result = await provider.open('google-maps', [target('a'), target('b'), target('c')]);
    expect(result).toEqual({ ok: true });
    expect(linking.opened).toHaveLength(1);
  });

  it('refuses a handoff with nothing to navigate between', async () => {
    const linking = stub();
    const provider = createNavigationProvider({ linking, platform: 'android' });

    const result = await provider.open('google-maps', [target('a')]);
    expect(result.ok).toBe(false);
    expect(linking.opened).toHaveLength(0);
  });

  it('reports the app as gone when opening throws', async () => {
    // Uninstalled between the capability check and the tap. Reported as not
    // installed because that is what the user has to act on.
    const linking = stub({
      openUrl: async () => {
        throw new Error('no activity found');
      },
    });
    const provider = createNavigationProvider({ linking, platform: 'android' });

    const result = await provider.open('waze', [target('a'), target('b')]);
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'provider-not-installed', provider: 'waze' },
    });
  });
});

describe('Waze and expired coordinates', () => {
  it('names the stops that need re-entering, not just that it failed', async () => {
    // Waze has no address form, so a coordinate that expired at 30 days blocks
    // the handoff outright (ADR-0007). Naming the stops turns "this didn't
    // work" into "these two need re-entering".
    const linking = stub();
    const provider = createNavigationProvider({ linking, platform: 'android' });

    const result = await provider.open('waze', [
      target('fresh'),
      target('stale-1', null),
      target('stale-2', null),
    ]);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'coordinates-required', placeIds: ['stale-1', 'stale-2'] },
    });
    expect(linking.opened).toHaveLength(0);
  });

  it('does not block Google Maps for the same stops', async () => {
    // Google Maps accepts the address form, so an expired coordinate degrades
    // rather than stopping the handoff. This asymmetry is the whole reason
    // capabilities exist.
    const linking = stub();
    const provider = createNavigationProvider({ linking, platform: 'android' });

    const result = await provider.open('google-maps', [target('a', null), target('b', null)]);
    expect(result).toEqual({ ok: true });
  });
});

describe('the URL ceiling is measured, never counted', () => {
  it('refuses a chunk whose built URL exceeds the ceiling', async () => {
    // A route of long Italian addresses breaches 2,048 characters before the
    // nominal waypoint count is reached, and the URL still opens — silently
    // dropping the tail. That is the failure this check exists to prevent.
    const verbose = (i: number): HandoffTarget => ({
      placeId: `p${i}`,
      coordinate: null,
      address: `c/o Amministrazione Condominiale Palazzo Verdi, Viale della Repubblica Italiana ${i}, interno 12, scala B, 24121 Bergamo BG, Italia`,
    });

    const linking = stub();
    const provider = createNavigationProvider({ linking, platform: 'android' });

    const result = await provider.open(
      'google-maps',
      Array.from({ length: 20 }, (_, i) => verbose(i)),
    );

    expect(result).toEqual({ ok: false, failure: { kind: 'route-too-long-for-one-leg' } });
    expect(linking.opened).toHaveLength(0);
  });
});

describe('capabilities are reported, never thrown about', () => {
  it('says a provider cannot chunk instead of failing when asked', async () => {
    // Liskov, applied literally: every implementation is substitutable, and one
    // that explodes on a capability it lacks is not (CLAUDE.md §1).
    const provider = createNavigationProvider({ linking: stub(), platform: 'ios' });

    expect(provider.capabilitiesOf('waze').canChunkHandoff).toBe(false);
    expect(provider.capabilitiesOf('apple-maps').canChunkHandoff).toBe(false);
    expect(provider.capabilitiesOf('google-maps').canChunkHandoff).toBe(true);
  });
});
