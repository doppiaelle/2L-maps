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
-- Set the email below to the account you sign in with on the device. The
-- deletion is scoped to that one user: a bare `delete from usage_events` would
-- reset every tester at once, including whoever is mid-way through checking
-- that the *exhausted* state renders correctly.

begin;

-- ─── Who ─────────────────────────────────────────────────────────────────────
-- Change this, and nothing else in the file.
create temporary table _target on commit drop as
select id
from auth.users
where email = 'lorenzocarovillano@gmail.com';

-- Fails loudly rather than deleting nothing and reporting success. A typo in the
-- address above is the likeliest thing to go wrong here, and a silent no-op sends
-- the tester back to the device to find the allowance still exhausted.
do $$
begin
  if not exists (select 1 from _target) then
    raise exception 'No account matches that email. Check the address in the temporary table above.';
  end if;
end;
$$;

-- ─── What ────────────────────────────────────────────────────────────────────
-- Everything in the current window. Older rows are left alone: they are outside
-- the window the quota reader counts, so deleting them changes no allowance and
-- only destroys history.
delete from usage_events
where user_id in (select id from _target)
  and occurred_at >= date_trunc('month', now() at time zone 'utc');

-- What is left, so the result is visible rather than assumed.
select
  endpoint,
  count(*) as remaining_events_this_month
from usage_events
where user_id in (select id from _target)
  and occurred_at >= date_trunc('month', now() at time zone 'utc')
group by endpoint
order by endpoint;

commit;

-- ─── A day pass instead, when the allowances themselves are what you are testing ──
--
-- Deleting usage tests the *free* allowances again. To test what a paying user
-- sees, grant a day pass rather than clearing the counter — the plan resolver
-- reads `day_pass_expires_at` against the clock and needs no webhook
-- (`resolvePlan` in `supabase/functions/_shared/plans.ts`):
--
--   insert into user_entitlements (user_id, status, plan, day_pass_expires_at)
--   select id, 'none', 'day-pass', now() + interval '24 hours'
--   from auth.users where email = 'lorenzocarovillano@gmail.com'
--   on conflict (user_id) do update
--     set plan = 'day-pass', day_pass_expires_at = excluded.day_pass_expires_at;
