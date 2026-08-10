import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTestDatabase, createUser, type TestDatabase } from './harness';

/**
 * The allowance reset, executed rather than reviewed.
 *
 * This file exists because the first version of the script did not run. It
 * created a temporary table and read it back in later statements, which is
 * correct SQL and wrong for where it is used: the Supabase SQL Editor sends
 * statements over a pooled connection, so the session that created the table was
 * not necessarily the session that read it. The error the user got —
 * `relation "_target" does not exist` — was the first anyone knew.
 *
 * A script that only ever runs by hand, in a dashboard, is exactly the kind that
 * nobody notices is broken until the moment it is needed. Running it here makes
 * the two properties that matter checkable: **each statement stands alone**, and
 * **an address that matches nothing says so** instead of deleting nothing and
 * reporting success.
 */

const SCRIPT = readFileSync(join(__dirname, '..', 'sql', 'reset-usage.sql'), 'utf8');

/**
 * The script's executable statements, in order.
 *
 * Split on the blank-line-separated blocks the file is written in rather than on
 * semicolons, then anything that is only comment is dropped — that is what
 * leaves the day-pass block out, which is commented for a reason and would
 * otherwise be run by this test and by nothing else.
 */
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

const LISTING = 0;
const RESET = 1;

let database: TestDatabase;
let mine: string;
let theirs: string;

beforeAll(async () => {
  database = await createTestDatabase();
  mine = await createUser(database, 'doppiaelletech@gmail.com');
  theirs = await createUser(database, 'someone.else@example.com');
}, 60_000);

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.asService('delete from usage_events');
  for (const userId of [mine, theirs]) {
    await database.asService(
      `insert into usage_events (user_id, endpoint, occurred_at)
       select $1, '/places-autocomplete', now() from generate_series(1, 6)`,
      [userId],
    );
    await database.asService(
      `insert into usage_events (user_id, endpoint, occurred_at)
       values ($1, '/optimize', now())`,
      [userId],
    );
    // Last month, outside the window the quota reader counts.
    await database.asService(
      `insert into usage_events (user_id, endpoint, occurred_at)
       values ($1, '/optimize', date_trunc('month', now() at time zone 'utc') - interval '3 days')`,
      [userId],
    );
  }
});

describe('the script runs at all', () => {
  it('is made of statements that each stand alone', async () => {
    // The regression. Every block is run on its own, in order, with nothing
    // carried between them — which is the worst case the SQL Editor's pooling
    // can produce.
    for (const statement of statements()) {
      await expect(database.asService(statement)).resolves.toBeDefined();
    }
  });

  it('leaves no temporary object behind for a later statement to need', async () => {
    expect(SCRIPT).not.toMatch(/create\s+(temp|temporary)\s+table/i);
  });
});

describe('what it deletes', () => {
  it('clears this month for the named account', async () => {
    await database.asService(statements()[RESET] as string);

    const result = await database.asService(
      `select count(*)::int as remaining from usage_events
       where user_id = $1
         and occurred_at >= date_trunc('month', now() at time zone 'utc')`,
      [mine],
    );
    expect((result.rows[0] as { remaining: number }).remaining).toBe(0);
  });

  it('reports how many rows went, and that one account matched', async () => {
    const result = await database.asService(statements()[RESET] as string);
    // Seven this month: six searches and one optimization.
    expect(result.rows[0]).toEqual({ accounts_matched: 1, rows_cleared: 7 });
  });

  it('leaves every other tester alone', async () => {
    // A bare `delete from usage_events` would reset whoever is part-way through
    // checking that the exhausted state renders correctly.
    await database.asService(statements()[RESET] as string);

    const result = await database.asService(
      `select count(*)::int as remaining from usage_events where user_id = $1`,
      [theirs],
    );
    expect((result.rows[0] as { remaining: number }).remaining).toBe(8);
  });

  it('leaves last month’s history where it is', async () => {
    // Those rows are outside the window the quota reader counts, so removing
    // them frees no allowance and destroys history for nothing.
    await database.asService(statements()[RESET] as string);

    const result = await database.asService(
      `select count(*)::int as older from usage_events
       where user_id = $1
         and occurred_at < date_trunc('month', now() at time zone 'utc')`,
      [mine],
    );
    expect((result.rows[0] as { older: number }).older).toBe(1);
  });
});

describe('when the address is wrong', () => {
  it('says nothing matched rather than reporting a successful no-op', async () => {
    // The failure worth catching. A silent no-op sends the tester back to the
    // device to find the allowance still exhausted and no idea why.
    const wrong = (statements()[RESET] as string).replace(
      'doppiaelletech@gmail.com',
      'not-an-account@example.com',
    );

    const result = await database.asService(wrong);
    expect(result.rows[0]).toEqual({ accounts_matched: 0, rows_cleared: 0 });
  });

  it('deletes nothing at all in that case', async () => {
    const wrong = (statements()[RESET] as string).replace(
      'doppiaelletech@gmail.com',
      'not-an-account@example.com',
    );
    await database.asService(wrong);

    const result = await database.asService(`select count(*)::int as total from usage_events`);
    expect((result.rows[0] as { total: number }).total).toBe(16);
  });
});

describe('finding the account in the first place', () => {
  it('lists every address with what it has spent this month', async () => {
    // The step that exists because the address you signed in with is not
    // necessarily the one you would have typed — an account created through
    // Google carries whatever Google returned.
    const result = await database.asService(statements()[LISTING] as string);
    const rows = result.rows as { email: string; calls_this_month: number }[];

    expect(rows.map((row) => row.email)).toEqual(
      expect.arrayContaining(['doppiaelletech@gmail.com', 'someone.else@example.com']),
    );
    expect(rows.find((row) => row.email === 'doppiaelletech@gmail.com')?.calls_this_month).toBe(7);
  });
});
