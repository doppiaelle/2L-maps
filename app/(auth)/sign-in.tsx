import { SignInScreen } from '@/features/auth/SignInScreen';

/**
 * The `(auth)/sign-in` route.
 *
 * Composition only, which is all a file in `app/` may ever be (`CLAUDE.md` §1) —
 * and here that rule has teeth beyond layering. Expo Router compiles a
 * `require.context` over the whole of this directory, so **every** `.tsx` under
 * `app/` becomes a route and enters Metro's graph. A screen that lives here
 * cannot have a test beside it: the test file would be swept up as a route, and
 * the testing library it imports would be pulled into the release bundle.
 *
 * That is not hypothetical. It is what red-lit `verify` and `android-preview` on
 * 2026-08-17, and `lib/navigation/route-files.test.ts` is what now catches it in
 * milliseconds instead of four minutes into a Gradle build.
 *
 * The screen and its twenty tests live in `features/auth/`, where a feature
 * module owns its screens.
 */
export default SignInScreen;
