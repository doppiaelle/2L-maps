import type { ExpoConfig } from 'expo/config';

/**
 * Expo configuration.
 *
 * Only the Maps SDK rendering key is present in the client, restricted by bundle
 * ID and SHA-1 to the Maps SDK alone — see CLAUDE.md §9 and ADR-0006. Every other
 * Google call is made by a Supabase Edge Function and no other Google credential
 * exists in this file, in EAS secrets, or anywhere the bundle can reach.
 *
 * `LSApplicationQueriesSchemes` and the Android `<queries>` element are build-time
 * declarations: a navigation provider that is not listed here is invisible at
 * runtime with no error. See docs/16_INTERNAL_NAVIGATION.md and docs/18_PERMISSIONS.md.
 */

const MAPS_API_KEY_IOS = process.env['EXPO_PUBLIC_MAPS_API_KEY_IOS'] ?? '';
const MAPS_API_KEY_ANDROID = process.env['EXPO_PUBLIC_MAPS_API_KEY_ANDROID'] ?? '';

/** Navigation providers we hand off to. iOS caps this list at 50 and App Review
 *  questions unexplained entries, so it is never widened casually (CLAUDE.md §13). */
const NAVIGATION_URL_SCHEMES = ['comgooglemaps', 'waze', 'maps'] as const;

const config: ExpoConfig = {
  name: '2L Maps',
  slug: '2l-maps',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'twolmaps',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.doppiaelle.twolmaps',
    infoPlist: {
      LSApplicationQueriesSchemes: [...NAVIGATION_URL_SCHEMES],
      ITSAppUsesNonExemptEncryption: false,
    },
    config: {
      googleMapsApiKey: MAPS_API_KEY_IOS,
    },
  },
  android: {
    package: 'com.doppiaelle.twolmaps',
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: MAPS_API_KEY_ANDROID,
      },
    },
  },
  plugins: ['expo-router', 'expo-localization'],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
