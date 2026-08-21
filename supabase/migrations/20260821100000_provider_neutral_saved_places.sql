-- Provider-neutral saved places and bounded HERE retention (ADR-0030).
--
-- Existing Google-shaped routes remain readable while the Flutter client adopts
-- internal UUIDs. User-authored text lives separately from provider material.

create table saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  address_text text not null check (length(btrim(address_text)) > 0),
  label text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index saved_places_user_recent_idx
  on saved_places (user_id, updated_at desc);

create trigger saved_places_set_updated_at
  before update on saved_places
  for each row execute function set_updated_at();

create table saved_place_coordinates (
  saved_place_id uuid primary key references saved_places (id) on delete cascade,
  provider text not null check (provider = 'here'),
  provider_place_id text,
  provider_formatted_address text,
  provider_raw_payload jsonb,
  lat double precision,
  lng double precision,
  provider_fetched_at timestamptz,
  provider_expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint saved_place_coordinates_complete check (
    (lat is null and lng is null
      and provider_fetched_at is null and provider_expires_at is null)
    or
    (lat is not null and lng is not null
      and provider_fetched_at is not null and provider_expires_at is not null)
  ),
  constraint saved_place_coordinates_latitude check (lat between -90 and 90),
  constraint saved_place_coordinates_longitude check (lng between -180 and 180),
  constraint saved_place_coordinates_ttl check (
    provider_expires_at > provider_fetched_at
    and provider_expires_at <= provider_fetched_at + coordinate_max_age()
  )
);

create index saved_place_coordinates_expiry_idx
  on saved_place_coordinates (provider_expires_at)
  where provider_expires_at is not null;

alter table saved_places enable row level security;
alter table saved_place_coordinates enable row level security;

create policy saved_places_select_own on saved_places
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_places_insert_own on saved_places
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy saved_places_update_own on saved_places
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saved_places_delete_own on saved_places
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy saved_place_coordinates_select_own on saved_place_coordinates
  for select to authenticated
  using (
    exists (
      select 1
        from saved_places
       where saved_places.id = saved_place_coordinates.saved_place_id
         and saved_places.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on table saved_places to authenticated;
grant select on table saved_place_coordinates to authenticated;

alter table routes
  add column origin_saved_place_id uuid,
  add constraint routes_origin_saved_place_owner_fkey
    foreign key (origin_saved_place_id, user_id)
    references saved_places (id, user_id),
  add constraint routes_one_origin_reference
    check (num_nonnulls(origin_place_id, origin_saved_place_id) <= 1);

alter table stops
  alter column place_id drop not null,
  add column saved_place_id uuid references saved_places (id),
  add constraint stops_exactly_one_place
    check (num_nonnulls(place_id, saved_place_id) = 1);

create index stops_saved_place_idx on stops (saved_place_id)
  where saved_place_id is not null;

alter table favourites
  alter column place_id drop not null,
  add column saved_place_id uuid,
  add constraint favourites_saved_place_owner_fkey
    foreign key (saved_place_id, user_id)
    references saved_places (id, user_id),
  add constraint favourites_exactly_one_place
    check (num_nonnulls(place_id, saved_place_id) = 1);

create unique index favourites_user_saved_place_idx
  on favourites (user_id, saved_place_id)
  where saved_place_id is not null;

-- Stops inherit ownership from routes. A foreign key alone cannot ensure that a
-- private saved place belongs to that same route owner.
create function assert_stop_saved_place_owner() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.saved_place_id is not null and not exists (
    select 1
      from routes
      join saved_places
        on saved_places.id = new.saved_place_id
       and saved_places.user_id = routes.user_id
     where routes.id = new.route_id
  ) then
    raise exception 'saved place must belong to the route owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stops_assert_saved_place_owner
  before insert or update of route_id, saved_place_id on stops
  for each row execute function assert_stop_saved_place_owner();

-- Preserve the existing cron schedule, monitoring table and public function
-- contract, while applying the same deadline to legacy and HERE-derived data.
create or replace function purge_expired_coordinates() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  operation_count integer;
begin
  update places_cache
     set lat = null,
         lng = null,
         formatted_address = null,
         coords_refreshed_at = null
   where coords_refreshed_at is not null
     and coords_refreshed_at < now() - coordinate_max_age();

  get diagnostics operation_count = row_count;
  affected := affected + operation_count;

  update saved_place_coordinates
     set provider_place_id = null,
         provider_formatted_address = null,
         provider_raw_payload = null,
         lat = null,
         lng = null,
         provider_fetched_at = null,
         provider_expires_at = null
   where provider_expires_at is not null
     and provider_expires_at <= now();

  get diagnostics operation_count = row_count;
  affected := affected + operation_count;

  update routes
     set polyline = null,
         eta = null,
         total_distance_m = null,
         total_duration_s = null
   where optimized_at is not null
     and optimized_at <= now() - coordinate_max_age()
     and (
       polyline is not null
       or eta is not null
       or total_distance_m is not null
       or total_duration_s is not null
     );

  get diagnostics operation_count = row_count;
  affected := affected + operation_count;

  update stops
     set leg_distance_m = null,
         leg_duration_s = null
    from routes
   where routes.id = stops.route_id
     and routes.optimized_at is not null
     and routes.optimized_at <= now() - coordinate_max_age()
     and (stops.leg_distance_m is not null or stops.leg_duration_s is not null);

  get diagnostics operation_count = row_count;
  affected := affected + operation_count;

  delete from optimization_cache where expires_at <= now();
  get diagnostics operation_count = row_count;
  affected := affected + operation_count;

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

comment on table saved_places is
  'Private user-authored addresses and labels; internal UUIDs are durable.';

comment on table saved_place_coordinates is
  'Server-written HERE material; every provider-derived value expires within 30 days.';

comment on function purge_expired_coordinates() is
  'Daily, observable and idempotent: expires legacy/HERE coordinates, route geometry and optimization cache.';
