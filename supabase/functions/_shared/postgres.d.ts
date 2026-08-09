/**
 * A local declaration for `postgres`, which is never installed here.
 *
 * The package is resolved by Deno through `supabase/functions/deno.json` and
 * exists only in the Edge runtime. Adding it to `package.json` to satisfy the
 * type-checker would put a Postgres driver in the mobile app's dependency tree,
 * where it would be one careless import away from being bundled — and where
 * `npm audit`, Renovate and every install would treat it as an app dependency.
 *
 * So the surface actually used is described here instead: one function, one
 * method. `CLAUDE.md` §3 allows a local declaration where a third-party type is
 * unavailable, provided it says why. This is why.
 */
declare module 'postgres' {
  interface Sql {
    /** Raw SQL with `$1`-style parameters, which is what `DatabaseClient`
     *  speaks. The tagged-template API is deliberately not described: it would
     *  invite call sites to build queries a different way in a codebase that has
     *  one. */
    unsafe: (query: string, params?: readonly unknown[]) => Promise<unknown[]>;
  }

  interface Options {
    /** The transaction pooler does not support prepared statements, and its
     *  connection string is the one Supabase injects. */
    readonly prepare?: boolean;
    readonly max?: number;
    readonly idle_timeout?: number;
  }

  export default function postgres(connectionString: string, options?: Options): Sql;
}
