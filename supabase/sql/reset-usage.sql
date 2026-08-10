-- Reset the metered allowance for one account, for testing.
--
-- Quota is counted server-side and only server-side (ADR-0011): every metered
-- call writes a row into `usage_events`, and `/usage-quota` answers by counting
-- the rows in the current window (`supabase/functions/_shared/plans.ts`). There
-- is no counter to zero and no flag to flip — deleting the rows *is* the reset,
-- and it is the only reset there is.
--
-- ## When this is the right tool
--
-- Exercising the app against the free allowances burns them for real: the free
-- tier covers 10 `/places-autocomplete` calls and 15 `/optimize` calls a
-- calendar month (docs/20_SUBSCRIPTIONS.md §6), which is a fortnight of ordinary
-- use and about ten minutes of testing. Waiting for the first of the month is
-- not a development workflow.
--
-- ## When it is the wrong one
--
-- **Never against production data.** These rows are the billing record and the
-- input to the cost model (docs/31_COST_MODEL.md); deleting them does not
-- un-spend the money, it only removes the evidence that it was spent. Run this
-- against a development or staging project.
--
-- ## How to run it
--
--   Supabase dashboard → SQL Editor → paste → Run.
--
-- **Each block below is one statement, and that is deliberate.** The editor
-- runs statements over a pooled connection, so anything that leaves state
-- behind — a temporary table, a session variable — may not survive to the next
-- one. Everything each block needs, it establishes itself.

-- ─── 1. Which account? ───────────────────────────────────────────────────────
--
-- Run this first if you are not certain which address you signed in with. An
-- account created through Google carries whatever address Google returned, which
-- is not necessarily the one you would have typed.

select
  u.email,
  u.created_at,
  count(e.id) filter (
    where e.occurred_at >= date_trunc('month', now() at time zone 'utc')
  ) as calls_this_month
from auth.users u
left join usage_events e on e.user_id = u.id
group by u.id, u.email, u.created_at
order by u.created_at;

-- ─── 2. The reset ────────────────────────────────────────────────────────────
--
-- Change the address on the marked line, and nothing else.
--
-- One statement, so the lookup and the deletion cannot land on different
-- connections. It reports `accounts_matched` alongside the count: **zero there
-- means the address did not match and nothing was deleted**, which is the one
-- failure worth catching — a silent no-op sends you back to the device to find
-- the allowance still exhausted and no idea why.
--
-- Scoped to one user on purpose. A bare `delete from usage_events` would reset
-- every tester at once, including whoever is part-way through checking that the
-- *exhausted* state renders correctly.
--
-- Only the current window is touched. Older rows sit outside the period the
-- quota reader counts, so removing them would free no allowance and destroy
-- history for nothing.

with target as (
  select id
  from auth.users
  where email = 'doppiaelletech@gmail.com' -- ← change this
),
cleared as (
  delete from usage_events
  where user_id in (select id from target)
    and occurred_at >= date_trunc('month', now() at time zone 'utc')
  returning endpoint
)
select
  (select count(*) from target) as accounts_matched,
  (select count(*) from cleared) as rows_cleared;

-- ─── 3. A day pass instead, when the allowances themselves are what you test ──
--
-- Deleting usage tests the *free* allowances again. To see what a paying user
-- sees, grant a day pass rather than clearing the counter — `resolvePlan` in
-- `supabase/functions/_shared/plans.ts` reads `day_pass_expires_at` against the
-- clock and needs no webhook.

-- insert into user_entitlements (user_id, status, plan, day_pass_expires_at)
-- select id, 'none', 'day-pass', now() + interval '24 hours'
-- from auth.users
-- where email = 'doppiaelletech@gmail.com' -- ← and here
-- on conflict (user_id) do update
--   set plan = 'day-pass',
--       day_pass_expires_at = excluded.day_pass_expires_at;
