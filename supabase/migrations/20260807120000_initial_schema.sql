-- Initial schema.
--
-- The central idea is the durability boundary (ADR-0007): `place_id` is Google's
-- stable identifier and may be stored indefinitely, while latitude, longitude and
-- the formatted address derived from it may be kept for at most 30 consecutive
-- days. Every coordinate column here is therefore nullable, and NULL is the
-- normal post-purge state rather than an error.
--
-- Specification: docs/12_DATABASE.md, which is the single source for this schema.

-- ─── places_cache — the durability boundary in one table ─────────────────────
--
-- Shared across all users and carrying no ownership column, because a place_id is
-- public Google data: one user's lookup benefits everyone, which is a material
-- cost saving (docs/31_COST_MODEL.md). Nothing here records who looked it up —
-- that association lives in `stops` and `favourites`, which are owned.

create table places_cache (
  place_id            text primary key,
  formatted_address   text,
  lat                 double precision,
  lng                 double precision,
  coords_refreshed_at timestamptz,
  created_at          timestamptz not null default now()
);

-- Partial: the purge job never needs to scan rows already purged.
create index places_cache_refreshed_idx
  on places_cache (coords_refreshed_at)
  where coords_refreshed_at is not null;

comment on column places_cache.lat is
  'Nullable by design. NULL after the 30-day purge (ADR-0007); re-hydrate from place_id.';

-- ─── routes ──────────────────────────────────────────────────────────────────

create type route_status as enum ('draft', 'optimized', 'in_progress', 'completed', 'archived');

create table routes (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users (id) on delete cascade,
  name                       text,
  status                     route_status not null default 'draft',
  is_round_trip              boolean not null default false,
  origin_place_id            text references places_cache (place_id),
  origin_is_current_location boolean not null default true,

  -- Optimization result. All of it is perishable or derivable.
  optimized_at        timestamptz,
  optimization_tier   text check (optimization_tier in ('T0', 'T1', 'T2', 'T3')),
  is_degraded         boolean not null default false,
  total_distance_m    integer,
  total_duration_s    integer,
  eta                 timestamptz,
  polyline            text,

  -- The duration of the user's own entry order, which is what makes the
  -- "time saved" figure a measurement rather than an estimate.
  baseline_duration_s integer,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at   timestamptz
);

create index routes_user_status_idx
  on routes (user_id, status, updated_at desc)
  where deleted_at is null;

comment on column routes.is_degraded is
  'Stored rather than derived, so a T0 result stays labelled in history forever.';
comment on column routes.deleted_at is
  'Soft delete. A delete performed offline must be reconcilable, and a hard delete cannot be.';

-- ─── stops ───────────────────────────────────────────────────────────────────

create type stop_state as enum ('pending', 'completed', 'skipped', 'unreachable');

create table stops (
  id       uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes (id) on delete cascade,
  place_id text not null references places_cache (place_id),

  -- User-authored content: durable, never purged.
  label text,
  note  text,

  entry_order     integer not null,
  optimized_order integer,
  is_pinned       boolean not null default false,

  state        stop_state not null default 'pending',
  completed_at timestamptz,

  -- The leg arriving at this stop. Perishable, like the rest of the result.
  leg_distance_m integer,
  leg_duration_s integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliberately NOT unique on (route_id, place_id): visiting the same address
-- twice in a day is legitimate — a morning delivery and an afternoon collection.
create index stops_route_order_idx on stops (route_id, optimized_order nulls last, entry_order);
create index stops_place_idx on stops (place_id);

comment on column stops.entry_order is
  'The order the user added them. Kept alongside optimized_order so the time saved can be stated and the original arrangement restored if the result is rejected.';

-- ─── favourites — the address book, and the primary cost lever ───────────────
--
-- Every stop added from here is a Places call not made (docs/31_COST_MODEL.md).

create table favourites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  place_id     text not null references places_cache (place_id),
  label        text,
  use_count    integer not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, place_id)
);

create index favourites_user_recent_idx
  on favourites (user_id, last_used_at desc nulls last);

-- ─── user_entitlements ───────────────────────────────────────────────────────
--
-- Written ONLY by the RevenueCat webhook handler, never by the client
-- (ADR-0011). The client's own billing state drives the interface and never
-- access; the two can legitimately disagree, and when they do this table wins.

create type entitlement_status as enum ('none', 'trial', 'active', 'grace', 'expired');

create table user_entitlements (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  status                 entitlement_status not null default 'none',
  product_id             text,
  trial_ends_at          timestamptz,
  renews_at              timestamptz,
  revenuecat_customer_id text,
  updated_at             timestamptz not null default now(),
  updated_by             text not null default 'webhook'
);

comment on column user_entitlements.updated_by is
  'Records the write source so an anomalous write is traceable.';

-- ─── usage_events ────────────────────────────────────────────────────────────
--
-- Makes docs/31_COST_MODEL.md verifiable rather than theoretical. Carries no
-- addresses, no coordinates and no place_id — only what was called and what it
-- cost (docs/21_ANALYTICS.md).

create table usage_events (
  id                 bigserial primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  endpoint           text not null,
  tier               text,
  cache_hit          boolean not null default false,
  units              integer not null default 1,
  estimated_cost_usd numeric(10, 6),
  occurred_at        timestamptz not null default now()
);

create index usage_events_user_month_idx on usage_events (user_id, occurred_at desc);
create index usage_events_reporting_idx on usage_events (occurred_at, endpoint);

comment on column usage_events.units is
  'Stops for T2, which bills per stop; requests for every other tier.';

-- ─── optimization_cache ──────────────────────────────────────────────────────
--
-- Shared across users and keyed by content. The key hashes public place
-- identifiers and carries no personal data, which is what makes cross-user
-- sharing acceptable — and it is the main lever against COGS for a segment whose
-- routes repeat.

create table optimization_cache (
  cache_key  text primary key,
  result     jsonb not null,
  tier       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index optimization_cache_expiry_idx on optimization_cache (expires_at);

comment on table optimization_cache is
  'result holds Google-derived geometry, so expires_at stays well inside the 30-day rule — in practice far shorter, since traffic staleness matters first.';

-- ─── optimization_jobs ───────────────────────────────────────────────────────
--
-- T2 above the async threshold returns a job id immediately and completes in the
-- background. Realtime is enabled below so the client subscribes to its own job
-- rather than polling.

create type job_status as enum ('queued', 'running', 'succeeded', 'failed');

create table optimization_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  route_id   uuid not null references routes (id) on delete cascade,
  status     job_status not null default 'queued',
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index optimization_jobs_user_idx on optimization_jobs (user_id, created_at desc);

alter publication supabase_realtime add table optimization_jobs;

-- ─── updated_at maintenance ──────────────────────────────────────────────────
--
-- A trigger rather than application code: every writer must maintain it, and one
-- that forgets produces a row that looks older than it is, which then breaks
-- offline reconciliation in a way that is very hard to trace back here.

create function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger routes_set_updated_at
  before update on routes
  for each row execute function set_updated_at();

create trigger stops_set_updated_at
  before update on stops
  for each row execute function set_updated_at();

create trigger optimization_jobs_set_updated_at
  before update on optimization_jobs
  for each row execute function set_updated_at();
