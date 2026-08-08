-- Row-level security.
--
-- RLS is enabled on every table without exception (CLAUDE.md §9 rule 3). A table
-- without a policy is then unreachable by design rather than permissive by
-- accident, and that is the intended failure mode: a query returning nothing is
-- debuggable, a query returning another user's rows is a breach.
--
-- Policies are written here, in the same change that creates the tables, rather
-- than once the feature works. A policy added afterwards is written against the
-- queries that happen to exist by then, which is how a table ends up open.
--
-- Specification: docs/12_DATABASE.md §7.

alter table places_cache       enable row level security;
alter table routes             enable row level security;
alter table stops              enable row level security;
alter table favourites         enable row level security;
alter table user_entitlements  enable row level security;
alter table usage_events       enable row level security;
alter table optimization_cache enable row level security;
alter table optimization_jobs  enable row level security;

-- ─── routes — owned ──────────────────────────────────────────────────────────

create policy routes_select_own on routes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy routes_insert_own on routes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy routes_update_own on routes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy routes_delete_own on routes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── stops — ownership inherited through the parent route ────────────────────
--
-- `stops` has no user_id of its own: duplicating it would create a second source
-- of truth for ownership that could drift from the route's.

create policy stops_select_own on stops
  for select to authenticated
  using (
    exists (
      select 1 from routes r
       where r.id = stops.route_id
         and r.user_id = (select auth.uid())
    )
  );

create policy stops_insert_own on stops
  for insert to authenticated
  with check (
    exists (
      select 1 from routes r
       where r.id = stops.route_id
         and r.user_id = (select auth.uid())
    )
  );

create policy stops_update_own on stops
  for update to authenticated
  using (
    exists (
      select 1 from routes r
       where r.id = stops.route_id
         and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from routes r
       where r.id = stops.route_id
         and r.user_id = (select auth.uid())
    )
  );

create policy stops_delete_own on stops
  for delete to authenticated
  using (
    exists (
      select 1 from routes r
       where r.id = stops.route_id
         and r.user_id = (select auth.uid())
    )
  );

-- ─── favourites — owned ──────────────────────────────────────────────────────

create policy favourites_select_own on favourites
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy favourites_insert_own on favourites
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy favourites_update_own on favourites
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy favourites_delete_own on favourites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── user_entitlements — readable by the owner, writable only by the server ──
--
-- No insert, update or delete policy exists for `authenticated` on purpose. The
-- service role bypasses RLS, so the webhook can still write; a client cannot.
-- Granting itself entitlement is the single most valuable thing an attacker
-- could do here (ADR-0011).

create policy entitlements_select_own on user_entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── usage_events — readable by the owner, written only by the server ────────
--
-- The client reads its own usage to show quota state before an action fails. It
-- must never be able to write, or the quota becomes advisory.

create policy usage_events_select_own on usage_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── optimization_jobs — readable by the owner, written only by the server ───
--
-- Read access is what makes the Realtime subscription work: the client watches
-- its own job row rather than polling.

create policy optimization_jobs_select_own on optimization_jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── places_cache — readable by any authenticated user ───────────────────────
--
-- Public Google data, and sharing it is the point: one user's lookup benefits
-- everyone. Writable only by the service role, so a client cannot poison the
-- shared cache with coordinates of its choosing.

create policy places_cache_select_authenticated on places_cache
  for select to authenticated
  using (true);

-- ─── optimization_cache — service role only ──────────────────────────────────
--
-- No policy for `authenticated` at all. The cache key is a hash of public place
-- identifiers, but the cached result is Google-derived geometry under a retention
-- obligation, and there is no product reason for a client to read it directly.
-- Enabling RLS with no policy makes the table unreachable, which is the intent.
