import Constants from 'expo-constants';

import type { MapIdConfig } from '@/lib/map/style';

/**
 * The Cloud Map IDs, read from the build's configuration.
 *
 * They are identifiers, not credentials — they name a style in the Google Cloud
 * console and grant nothing ([`docs/14_GOOGLE_MAPS_INTEGRATION.md`](../../docs/14_GOOGLE_MAPS_INTEGRATION.md) §6).
 * Set in `app.config.ts` from `EXPO_PUBLIC_MAP_ID_*`, which means unset is a
 * supported state: `mapIdFor` treats the empty string as absent and the map
 * falls back to Google's default style rather than rendering blank. That is the
 * mitigation risk C15 promises.
 *
 * **Validated rather than asserted.** `expoConfig.extra` is typed as loose and
 * is written by a file that can be edited without touching this one — a boundary
 * like any other (`CLAUDE.md` §3), and one where a typo would otherwise reach
 * the SDK as a Map ID that cannot resolve.
 */

const asMapId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export function readMapIds(extra: unknown = Constants.expoConfig?.extra): MapIdConfig {
  const mapIds = (extra as { mapIds?: unknown } | null | undefined)?.mapIds;
  if (mapIds === null || typeof mapIds !== 'object') return { light: null, dark: null };

  const shaped = mapIds as { light?: unknown; dark?: unknown };
  return { light: asMapId(shaped.light), dark: asMapId(shaped.dark) };
}
