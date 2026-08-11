-- Does the database have what the Edge Functions read from it?
--
-- This exists because a half-applied migration and a broken API key produce the
-- same sentence on the phone. Every metered endpoint runs the same seven-step
-- pipeline (docs/13_BACKEND.md §4), and step 2 reads `user_entitlements` **by
-- column name**:
--
--   select status, plan, trial_ends_at, renews_at, day_pass_expires_at
--     from user_entitlements where user_id = $1
--
-- A column that is not there is not a missing feature — it is an error thrown
-- before the request reaches Google, so `/places-autocomplete` answers 500 and
-- the app says "Search is not responding", which reads like an outage upstream
-- and is not one. `/optimize` says "Could not optimize" for the same reason.
-- Nothing distinguishes the two causes from the device, which is exactly why
-- this is checkable from the dashboard in one paste.
--
-- ## How to run it
--
--   Supabase dashboard → SQL Editor → paste → Run.
--
-- Every row should say `ok`. Any row saying `MISSING` means the migrations in
-- `supabase/migrations/` are not all applied to this project: run
-- `supabase db push` (or the repository's `npm run migrate`) and run this again.
-- Re-running an applied migration is safe — every statement in them is written
-- `if not exists` — so pushing again when in doubt costs nothing.
--
-- **Each block below is one statement**, for the same reason as
-- `reset-usage.sql`: the editor pools connections and nothing may be carried
-- between them.

-- ─── The capabilities the functions depend on ────────────────────────────────
--
-- Listed as facts about the code rather than as a copy of the migrations: each
-- row is somewhere a function names an object, so a row failing here names the
-- endpoint that will fail at runtime. Missing rows sort to the top.

with required (kind, object, detail, needed_by) as (
  values
    -- Step 2 of the pipeline, on every metered call. All five are read by name
    -- in one select, so any one of them missing takes down all of them.
    ('column',   'user_entitlements', 'status',              'every metered endpoint'),
    ('column',   'user_entitlements', 'plan',                'every metered endpoint'),
    ('column',   'user_entitlements', 'trial_ends_at',       'every metered endpoint'),
    ('column',   'user_entitlements', 'renews_at',           'every metered endpoint'),
    ('column',   'user_entitlements', 'day_pass_expires_at', 'every metered endpoint'),
    -- Written by the RevenueCat webhook. Idempotency by event id and ordering by
    -- event time are properties of that upsert, and neither holds without these.
    ('column',   'user_entitlements', 'expires_at',          '/revenuecat-webhook'),
    ('column',   'user_entitlements', 'last_event_id',       '/revenuecat-webhook'),
    ('column',   'user_entitlements', 'occurred_at',         '/revenuecat-webhook'),
    ('enum',     'entitlement_status', 'lapsed',             '/revenuecat-webhook'),
    ('enum',     'entitlement_status', 'day-pass',           '/revenuecat-webhook'),
    -- Steps 3, 4 and 7: the burst limit, the allowance, and the record of use.
    ('column',   'usage_events',      'endpoint',            'every metered endpoint'),
    ('column',   'usage_events',      'units',               'every metered endpoint'),
    ('column',   'usage_events',      'cache_hit',           'every metered endpoint'),
    ('column',   'usage_events',      'occurred_at',         'every metered endpoint'),
    -- A suggestion the user can save the instant they tap it: `stops.place_id`
    -- is a foreign key into this table and the client cannot write to it.
    ('table',    'places_cache',      '',                    '/places-autocomplete'),
    ('column',   'places_cache',      'coords_refreshed_at', '/place-details'),
    ('table',    'favourites',        '',                    'the address book'),
    ('function', 'record_place_use',  '',                    'the address book')
),
found as (
  select
    r.kind,
    r.object,
    r.detail,
    r.needed_by,
    case r.kind
      when 'column' then exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = r.object
          and c.column_name = r.detail
      )
      when 'table' then to_regclass('public.' || r.object) is not null
      when 'enum' then exists (
        select 1 from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = r.object and e.enumlabel = r.detail
      )
      when 'function' then exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = r.object
      )
      else false
    end as present
  from required r
)
select
  case when present then 'ok' else 'MISSING' end as state,
  kind,
  object,
  detail,
  needed_by
from found
order by present, kind, object, detail;

-- ─── The migration ledger, if this project keeps one ─────────────────────────
--
-- Kept commented because it reads a schema the Supabase CLI creates and a
-- database migrated any other way does not have — including the one the tests
-- run against, which would fail on it. Uncomment and run it in the dashboard to
-- see which versions the CLI believes it has applied, and compare the list with
-- the filenames in `supabase/migrations/`.

-- select version, name, executed_at
-- from supabase_migrations.schema_migrations
-- order by version;
