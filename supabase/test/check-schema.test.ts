import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTestDatabase, type TestDatabase } from './harness';

/**
 * The schema check, checked against the schema.
 *
 * A diagnostic that is wrong is worse than none: it sends you to look at the
 * database when the database is fine, or clears a project that is actually
 * broken. Both failures are cheap to prevent — the migrations in this repository
 * are the definition of "applied", the harness applies all of them, so **every
 * row must say `ok` here** and a row that does not is either a missing migration
 * or a typo in the script.
 *
 * The other half matters more. The script has to *detect* a missing object, and
 * a query that reports `ok` unconditionally would pass the first test forever.
 * So one test drops a column the pipeline reads and asserts the script names it
 * — which is the exact fault it was written to find: `readEntitlement` selects
 * `plan` and `day_pass_expires_at` by name, and without them every metered
 * endpoint answers 500 and the app says "Search is not responding".
 */

const SCRIPT = readFileSync(join(__dirname, '..', 'sql', 'check-schema.sql'), 'utf8');

/** The executable statements, in order. Comment-only blocks are dropped, which
 *  is what leaves the migration-ledger query out — it reads a schema the CLI
 *  creates and this database does not have. */
function statements(): string[] {
  return SCRIPT.split(/;\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((block) => block.length > 0)
    .map((block) => `${block};`);
}

const CHECK = 0;

interface Row {
  readonly state: string;
  readonly kind: string;
  readonly object: string;
  readonly detail: string;
  readonly needed_by: string;
}

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await database.close();
});

describe('the script runs at all', () => {
  it('is one statement, standing alone', async () => {
    // The SQL Editor pools connections, so nothing may be carried between
    // blocks — the failure that made `reset-usage.sql` unrunnable.
    expect(statements()).toHaveLength(1);
    await expect(database.asService(statements()[CHECK] as string)).resolves.toBeDefined();
  });

  it('leaves no temporary object behind', () => {
    expect(SCRIPT).not.toMatch(/create\s+(temp|temporary)\s+table/i);
  });
});

describe('against a fully migrated database', () => {
  it('reports every capability present', async () => {
    const result = await database.asService(statements()[CHECK] as string);
    const rows = result.rows as Row[];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.state !== 'ok')).toEqual([]);
  });

  it('covers all four kinds of object, so none is checked by accident', async () => {
    const result = await database.asService(statements()[CHECK] as string);
    const rows = result.rows as Row[];

    expect(new Set(rows.map((row) => row.kind))).toEqual(
      new Set(['column', 'table', 'enum', 'function']),
    );
  });

  it('names the five columns step 2 reads by name', async () => {
    // `readEntitlement` selects these in one statement. Any one missing throws
    // before the request reaches Google, and the phone shows an upstream
    // failure that did not happen.
    const result = await database.asService(statements()[CHECK] as string);
    const entitlement = (result.rows as Row[])
      .filter((row) => row.object === 'user_entitlements')
      .map((row) => row.detail);

    expect(entitlement).toEqual(
      expect.arrayContaining([
        'status',
        'plan',
        'trial_ends_at',
        'renews_at',
        'day_pass_expires_at',
      ]),
    );
  });
});

describe('when a migration did not apply', () => {
  it('names the missing column instead of reporting a healthy database', async () => {
    // The whole point. Without this the script is a query that says `ok` and
    // proves nothing.
    await database.asService('alter table user_entitlements drop column day_pass_expires_at');

    try {
      const result = await database.asService(statements()[CHECK] as string);
      const rows = result.rows as Row[];
      const missing = rows.filter((row) => row.state === 'MISSING');

      expect(missing.map((row) => row.detail)).toEqual(['day_pass_expires_at']);
      // Sorted to the top, so a long list does not hide the one row that matters.
      expect(rows[0]?.state).toBe('MISSING');
      // And it says what breaks, not only what is absent.
      expect(missing[0]?.needed_by).toBe('every metered endpoint');
    } finally {
      await database.asService(
        'alter table user_entitlements add column day_pass_expires_at timestamptz',
      );
    }
  });
});
