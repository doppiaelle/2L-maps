-- The coordinate purge.
--
-- This is what makes ADR-0007 structural rather than procedural. Google's terms
-- allow a place_id to be stored indefinitely and its coordinates for at most 30
-- consecutive days; exceeding that is a terms breach, not a stale cache.
--
-- A rule that depends on someone remembering to delete coordinates is a rule that
-- is already broken on the first busy week. A scheduled job with a monitored last
-- success is not.
--
-- Specification: docs/12_DATABASE.md §8.

-- The window lives in one place. The application's COORDINATE_MAX_AGE_DAYS cites
-- the same document (types/constants.ts), and a test asserts the two agree.
create function coordinate_max_age() returns interval
language sql
immutable
as $$
  select interval '30 days';
$$;

comment on function coordinate_max_age is
  'Google Maps Platform terms: coordinates may be cached for at most 30 consecutive days (ADR-0007). Changing this requires changing docs/12_DATABASE.md first.';

-- Records each run so a silent failure is detectable. A purge that stops running
-- is a continuing terms violation that produces no error anywhere.
create table coordinate_purge_runs (
  id           bigserial primary key,
  ran_at       timestamptz not null default now(),
  purged_rows  integer not null,
  succeeded    boolean not null,
  error        text
);

create index coordinate_purge_runs_recent_idx on coordinate_purge_runs (ran_at desc);

alter table coordinate_purge_runs enable row level security;
-- No policy: server-side only. Operational data, not user data.

-- Nulls the perishable columns and keeps place_id untouched, so every dependent
-- row keeps its foreign key, its user-authored label and its position in the
-- route. Re-hydration then restores the coordinates transparently on next open.
create function purge_expired_coordinates() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update places_cache
     set lat                 = null,
         lng                 = null,
         formatted_address   = null,
         coords_refreshed_at = null
   where coords_refreshed_at is not null
     and coords_refreshed_at < now() - coordinate_max_age();

  get diagnostics affected = row_count;

  insert into coordinate_purge_runs (purged_rows, succeeded)
  values (affected, true);

  return affected;
exception
  when others then
    insert into coordinate_purge_runs (purged_rows, succeeded, error)
    values (0, false, sqlerrm);
    raise;
end;
$$;

comment on function purge_expired_coordinates is
  'Daily. Nulls expired coordinates and keeps place_id. Failure is an alert, not a log line — see coordinate_purge_healthy().';

-- The monitoring predicate. An absence of success within 48 hours pages, rather
-- than the job simply not appearing in a dashboard nobody opens. Two days rather
-- than one leaves room for a single missed run without waking anyone, while
-- staying far inside the 30-day window.
create function coordinate_purge_healthy() returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from coordinate_purge_runs
     where succeeded
       and ran_at > now() - interval '48 hours'
  );
$$;

comment on function coordinate_purge_healthy is
  'False means the purge has not succeeded in 48 hours. This must page: a silently failed purge is a continuing terms violation nobody notices.';

-- Scheduled daily, well inside the window so a missed run is recoverable rather
-- than a breach. pg_cron is a Supabase extension; enabling it here keeps the
-- schedule in version control instead of in a dashboard.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'purge-expired-coordinates',
  '17 3 * * *', -- 03:17 UTC daily, off the hour so it does not contend with everything else
  $$select purge_expired_coordinates()$$
);
