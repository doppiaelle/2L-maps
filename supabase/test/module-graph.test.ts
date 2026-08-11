import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The Edge Functions resolve under Deno, and nothing else in this repository
 * proves it.
 *
 * `tsconfig.json` excludes `supabase/functions/*​/index.ts` because those files
 * reference Deno globals, so `tsc` never opens the five entry points. The Jest
 * suites import `_shared/*` through Node's resolver, which is happy to guess an
 * extension. Between them, every module specifier in the backend was checked by
 * a resolver whose rules are looser than the one that actually runs it — and the
 * first deploy failed on 82 relative imports with no `.ts` extension, every one
 * of them in a file the suite had already exercised and passed.
 *
 * This test walks the real graph from the real entry points under Deno's rules:
 *
 * - a relative specifier is a **path**, not a hint — no extension is inferred,
 *   no `index.ts` is implied, and the file has to be there;
 * - a bare specifier must be in `functions/deno.json`, or Deno has nothing to
 *   resolve it against.
 *
 * It is offline and takes milliseconds, which is the point: `deno check` in CI
 * catches the same thing one push later, and one push later is after the deploy
 * that the user was waiting on.
 */

const FUNCTIONS_DIR = resolve(__dirname, '..', 'functions');

/** Specifiers Deno resolves without an import map. */
const BUILT_IN_SCHEMES = ['npm:', 'jsr:', 'node:', 'http:', 'https:', 'data:'];

interface Specifier {
  readonly raw: string;
  /** The file it was written in, for a failure message that names the line. */
  readonly importer: string;
}

describe('Edge Function module graph', () => {
  const entryPoints = readdirSync(FUNCTIONS_DIR)
    .filter((name) => statSync(join(FUNCTIONS_DIR, name)).isDirectory())
    .filter((name) => !name.startsWith('_'))
    .map((name) => join(FUNCTIONS_DIR, name, 'index.ts'));

  it('has an entry point per deployed function', () => {
    // Guards the guard: a glob that silently matches nothing would make every
    // assertion below vacuously true, which is the failure mode of this kind of
    // test.
    expect(entryPoints.length).toBeGreaterThan(0);
    for (const entry of entryPoints) {
      expect(existsSync(entry)).toBe(true);
    }
  });

  const graph = walk(entryPoints);

  it('reaches the shared modules from the entry points', () => {
    // If the walker stopped at the first file it would still report zero
    // unresolved imports. It has to have gone somewhere.
    expect(graph.visited.length).toBeGreaterThan(entryPoints.length);
  });

  it('resolves every relative import as a literal path', () => {
    const broken = graph.relative.filter(({ raw, importer }) => {
      const target = resolve(dirname(importer), raw);
      return !existsSync(target) || statSync(target).isDirectory();
    });

    expect(broken.map(describeSpecifier)).toEqual([]);
  });

  it('gives every relative import an explicit extension', () => {
    // Separate from the assertion above so the message says *why*: on a
    // case-insensitive checkout a missing extension and a missing file look
    // identical, and only one of them is fixed by adding `.ts`.
    const bare = graph.relative.filter(({ raw }) => !/\.(ts|json)$/.test(raw));

    expect(bare.map(describeSpecifier)).toEqual([]);
  });

  it('maps every bare import in functions/deno.json', () => {
    const importMap = JSON.parse(readFileSync(join(FUNCTIONS_DIR, 'deno.json'), 'utf8')) as {
      imports?: Record<string, string>;
    };
    const mapped = Object.keys(importMap.imports ?? {});

    const unmapped = graph.bare.filter(
      ({ raw }) =>
        !BUILT_IN_SCHEMES.some((scheme) => raw.startsWith(scheme)) &&
        !mapped.some((key) => raw === key || raw.startsWith(`${key}/`)),
    );

    expect(unmapped.map(describeSpecifier)).toEqual([]);
  });
});

interface Graph {
  readonly visited: readonly string[];
  readonly relative: readonly Specifier[];
  readonly bare: readonly Specifier[];
}

/**
 * Follow the graph from the entry points, collecting every specifier on the way.
 *
 * Traversal only descends through relative imports that exist. An import that
 * does not resolve is collected and not followed — the assertions report all of
 * them at once rather than stopping at the first, because 82 broken imports
 * discovered one deploy at a time is how this got here.
 */
function walk(entryPoints: readonly string[]): Graph {
  const visited = new Set<string>();
  const relative: Specifier[] = [];
  const bare: Specifier[] = [];
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file) || !existsSync(file)) continue;
    visited.add(file);

    for (const raw of specifiersIn(readFileSync(file, 'utf8'))) {
      const specifier: Specifier = { raw, importer: file };

      if (!raw.startsWith('./') && !raw.startsWith('../')) {
        bare.push(specifier);
        continue;
      }

      relative.push(specifier);
      const target = resolve(dirname(file), raw);
      if (target.endsWith('.ts') && existsSync(target)) queue.push(target);
    }
  }

  return { visited: [...visited], relative, bare };
}

/**
 * Every module specifier in a source file.
 *
 * Both forms that create an edge: `… from '…'` covers imports, type-only
 * imports and re-exports; the bare `import '…'` covers side-effect imports.
 * Deliberately textual — a parser would be more precise about a specifier
 * mentioned inside a comment, and the cost of that precision is a dependency
 * whose own resolution rules differ again from Deno's.
 */
function specifiersIn(source: string): string[] {
  const found = new Set<string>();
  // **Comments first.** These are regexes, not a parser, and a doc comment
  // containing the words `from "where I am"` is indistinguishable from an
  // import to one. That is not hypothetical: a prose line describing the cache
  // key reflowed onto one line and this suite reported a missing import map
  // entry for a phrase in English.
  const code = withoutComments(source);

  for (const match of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  for (const match of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    if (match[1] !== undefined) found.add(match[1]);
  }

  return [...found];
}

/**
 * Strip block and line comments.
 *
 * Crude on purpose — it does not need to survive a comment marker inside a
 * string literal, because a specifier is what comes *after* `from`, and this
 * only has to stop prose being read as code.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** A path relative to the repository root, so a failure is clickable. */
function describeSpecifier({ raw, importer }: Specifier): string {
  return `${importer.slice(resolve(__dirname, '..', '..').length + 1)} → ${raw}`;
}
