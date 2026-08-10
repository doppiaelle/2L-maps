import type { ExpoConfig } from 'expo/config';

/**
 * Expo configuration.
 *
 * **There is now no Google credential in the client at all.** The Maps SDK
 * rendering key was the one exception `CLAUDE.md` §9 rule 1 carved out, and it
 * existed to let `react-native-maps` draw tiles. The preview is drawn from our
 * own geometry ([ADR-0021](docs/adr/0021-drawn-route-preview.md)), there is no
 * SDK left to authorise, and the key, its bundle-ID restriction and its SHA-1
 * restriction are all gone with it. Every Google call is made by a Supabase Edge
 * Function with a server-side key (ADR-0006).
 *
 * The Cloud Map IDs went the same way. They named a style in a console that no
 * longer renders anything for us — which also closes risk C15, since what the
 * preview looks like is now entirely in this repository.
 *
 * `LSApplicationQueriesSchemes` and the Android `<queries>` element are build-time
 * declarations: a navigation provider that is not listed here is invisible at
 * runtime with no error. See docs/16_INTERNAL_NAVIGATION.md and docs/18_PERMISSIONS.md.
 */

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
  },
  android: {
    package: 'com.doppiaelle.twolmaps',
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-localization',
    [
      'expo-location',
      {
        /**
         * The purpose strings, which are the permission dialog's entire text on
         * iOS and are quoted verbatim in App Review.
         *
         * They say what the location is *for* rather than what it is — "to set
         * your starting point" is a reason a driver can weigh; "to access your
         * location" is a request with no argument attached
         * (docs/18_PERMISSIONS.md §4).
         *
         * **Foreground only.** No background permission is declared, and adding
         * one would be a store-review decision rather than a code change: it is
         * the most scrutinised permission in App Review (risk C7), and this
         * product hands navigation off to an app that has its own.
         */
        locationWhenInUsePermission:
          'Used to start your route from where you are and to show your position on the map.',
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
