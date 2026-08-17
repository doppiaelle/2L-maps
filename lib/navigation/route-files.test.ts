import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Everything under `app/` is a route, including the things nobody meant as one.
 *
 * Expo Router does not read the directory looking for screens. It compiles a
 * `require.context` over the whole of `app/` — `node_modules/expo-router/_ctx.*.js`
 * — matching every `.ts`/`.tsx` file that is not an `+api`, `+html` or
 * `+middleware` entry. There is no ignore list, no `.testPathIgnorePatterns`
 * equivalent and nothing that knows what a test is.
 *
 * So a file named `sign-in.test.tsx` sitting next to `sign-in.tsx` is not a test
 * beside its source. It is **a route** — and, worse, a route that imports
 * `@testing-library/react-native`, which pulls `console`, `util` and the rest of
 * Node into the production dependency graph. Jest never notices, because Jest
 * transforms only what a test imports; typecheck never notices, because the file
 * is valid TypeScript. Metro is the first thing in the pipeline that walks the
 * whole graph, so the failure surfaces as a red release bundle and a red Gradle
 * build with nothing in either message about test placement.
 *
 * That is exactly what happened on 2026-08-17, and this is the test that would
 * have caught it in milliseconds (`CLAUDE.md` §5 — a bug fix begins with a
 * failing test).
 *
 * **The rule this enforces is already in the constitution.** `app/` is
 * composition only (`CLAUDE.md` §1); a screen with state and a test to prove it
 * belongs in `features/`, and the route file is the three lines that mount it.
 */

const APP_DIR = join(__dirname, '..', '..', 'app');

/** Every file Expo Router's `require.context` would sweep up, recursively. */
function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return /\.[jt]sx?$/.test(entry.name) ? [relative(APP_DIR, path)] : [];
  });
}

describe('the route tree', () => {
  it('has files in it at all, so an empty glob cannot pass this vacuously', () => {
    // A recursive walk that finds nothing satisfies every assertion below.
    expect(routeFiles(APP_DIR).length).toBeGreaterThan(0);
  });

  it('contains no test files, because a test file under app/ is a route', () => {
    // Nothing here is a preference about tidiness: a `.test.tsx` in this tree
    // reaches Metro's graph, and the devDependencies it imports are not
    // bundleable. The suite stays green while the release build dies.
    const tests = routeFiles(APP_DIR).filter((path) => /\.(test|spec)\.[jt]sx?$/.test(path));

    expect(tests).toEqual([]);
  });
});
