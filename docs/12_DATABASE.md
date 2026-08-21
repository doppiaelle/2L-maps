# 12 — Database

> **Migration update — provider-neutral HERE persistence:** The forward-only migration
> `20260821100000_provider_neutral_saved_places.sql` adds private `saved_places` and
> server-written `saved_place_coordinates` without breaking the active Expo/Google schema.
> User-authored `address_text`, labels, notes and internal UUIDs are permanent. HERE place
> identifiers, formatted addresses, raw payloads and coordinates are perishable and carry
> `provider_fetched_at` plus `provider_expires_at <= fetched_at + 30 days`.
> Existing `routes`, `stops` and `favourites` accept either one legacy Google place ID or
> one owned internal saved-place UUID. RLS isolates each user's private address book, and
> only server-side code may write provider coordinates. The existing monitored daily purge
> clears expired legacy/HERE values, route geometry, leg metrics and optimization-cache rows.
> The remaining sections describe the legacy shape until the final migration cutover.


> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md) · [`13_BACKEND.md`](13_BACKEND.md) · [`19_SECURITY.md`](19_SECURITY.md)

---

## 1. Purpose

This document is the single source of truth for the data model: every table, column, index,
relationship and row-level security policy, plus the migration and retention machinery.

The schema is shaped by one external constraint that overrides normal design instinct:
**Google-derived coordinates may be cached for at most 30 consecutive days**, while
`place_id` may be kept indefinitely. This makes the natural schema — store lat/lng with each
stop, forever — a terms violation. The design here makes compliance structural rather than
procedural.

## 2. Goals

1. Make the 30-day coordinate rule impossible to violate by accident.
2. Keep user-authored content — labels, notes, order — durable and unaffected by expiry.
3. Enforce ownership at the database, not in application code.
4. Support the offline mutation queue without conflict pathology.
5. Make cost measurable by recording every metered call.

**Non-goals.** No API shapes ([`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)), no client caching
([`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Schema and migrations | Architecture | Versioned, forward-only |
| RLS policies | Architecture | Every table, no exceptions |
| Coordinate purge | Scheduled job | **Failure is an alert, not a log line** |
| Type generation | CI | Regenerated after every migration |

---

## 4. Text diagrams

### Entity relationships

```
   auth.users (Supabase)
        │ 1
        ├──────────────┬────────────────┬──────────────────┐
        │ n            │ n              │ 1                │ n
   ┌────▼─────┐   ┌────▼──────┐   ┌─────▼──────────┐  ┌───▼────────────┐
   │ routes   │   │ favourites│   │user_entitlements│ │ usage_events   │
   └────┬─────┘   └────┬──────┘   └────────────────┘  └────────────────┘
        │ 1            │ n
        │ n            │
   ┌────▼─────┐        │
   │ stops    │        │
   └────┬─────┘        │
        │ n            │
        │              │
        ▼ 1            ▼ 1
   ┌──────────────────────────┐
   │ places_cache             │  ◀── shared across all users
   │ place_id  PK  durable    │      no ownership, no RLS restriction
   │ lat/lng       perishable │      on read
   │ coords_refreshed_at      │
   └──────────────────────────┘

   ┌──────────────────┐        ┌──────────────────────┐
   │ optimization_jobs│        │ optimization_cache   │
   │ async T2 jobs    │        │ content-keyed, shared│
   └──────────────────┘        └──────────────────────┘
```

### The durability boundary — the schema's central idea

```
  ┌─────────────────────────── DURABLE ───────────────────────────┐
  │  place_id            Google permits indefinite storage         │
  │  user labels         the user wrote it; it is theirs           │
  │  notes               same                                      │
  │  stop order          derived by us, not from Google            │
  │  route metadata      name, created_at, completed_at            │
  └────────────────────────────────────────────────────────────────┘
                                  │
  ┌───────────────────────── PERISHABLE ──────────────────────────┐
  │  lat / lng           30-day maximum, then NULL                 │
  │  formatted_address   Google-derived, same rule                 │
  │  polyline            Google-derived route geometry             │
  │  computed ETA        stale within hours anyway                 │
  └────────────────────────────────────────────────────────────────┘

  A saved route opened after 60 days still has every stop, every
  label and the exact order. It re-resolves coordinates on open.
  Nothing the user created is ever lost to expiry.
```

---

## 5. Flows

**A coordinate's life.** This is the flow the terms constrain, and the one the schema is shaped
around.

```
  place_id resolved  ──▶  coordinates cached with coords_refreshed_at = now
                                     │
                          ≤ 30 days  │  used directly
                                     │
                          > 30 days  ▼
                          purge job NULLs the coordinates, keeps the place_id
                                     │
                          route opened ──▶ re-hydrated from place_id, batched
                                     │
                                     ▼
                          coords_refreshed_at reset; the row was never lost
```

The `place_id` survives; only the coordinates expire. That is why the durable key and the
perishable cache are different columns rather than one nullable pair.

**A migration's life.** Forward-only, versioned, reviewed as a contract change: a migration
that alters a stored shape is a `MAJOR` version under
[`25_DEPLOYMENT.md`](25_DEPLOYMENT.md). Types are regenerated in the same change — a
hand-edited database type is a lie that typechecks.

**A read's life.** Every read passes row-level security. A table without a policy is
unreachable, which is the intended failure mode: a query that returns nothing is debuggable, a
query that returns another user's rows is a breach.

## 6. Schema

### `places_cache` — the durability boundary in one table

```sql
create table places_cache (
  place_id            text primary key,
  formatted_address   text,
  lat                 double precision,
  lng                 double precision,
  coords_refreshed_at timestamptz,
  created_at          timestamptz not null default now()
);

create index places_cache_refreshed_idx
  on places_cache (coords_refreshed_at)
  where coords_refreshed_at is not null;
```

**`lat`, `lng`, `formatted_address` and `coords_refreshed_at` are all nullable, deliberately.**
NULL is the normal post-expiry state, not an error. The partial index supports the purge job
without scanning already-purged rows.

The table is **shared across users and contains no ownership column**. A `place_id` is public
Google data, and sharing it means one user's lookup benefits everyone — a material cost saving
([`31_COST_MODEL.md`](31_COST_MODEL.md)). Nothing here identifies who looked it up; that
association lives in `stops` and `favourites`, which are owned and protected.

### `routes`

```sql
create type route_status as enum ('draft', 'optimized', 'in_progress', 'completed', 'archived');

create table routes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text,
  status            route_status not null default 'draft',
  is_round_trip     boolean not null default false,
  origin_place_id   text references places_cache (place_id),
  origin_is_current_location boolean not null default true,

  -- optimization result, all perishable or derivable
  optimized_at      timestamptz,
  optimization_tier text check (optimization_tier in ('T0','T1','T2','T3')),
  is_degraded       boolean not null default false,
  total_distance_m  integer,
  total_duration_s  integer,
  eta               timestamptz,
  polyline          text,

  -- Reserved. Held the duration of the user's own entry order, which is what
  -- would make a time-saved figure a measurement rather than an estimate.
  -- Nothing writes it: measuring it honestly costs a third computeRoutes
  -- request per optimization, and the product owner declined that trade
  -- (ADR-0027). The column stays so reversing the decision is one upstream call
  -- rather than a migration.
  baseline_duration_s integer,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  deleted_at        timestamptz
);

create index routes_user_status_idx on routes (user_id, status, updated_at desc)
  where deleted_at is null;
```

`is_degraded` is stored, not derived, so a T0 result stays labelled in history forever
([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)).

`baseline_duration_s` is **reserved and unused**. It was to hold the duration of the user's
original entry order, which is what would make a time-saved figure a real measurement rather
than an estimate — and the specification forbade an estimate. Obtaining it honestly costs a
third `computeRoutes` request per optimization, over the entry order at the same routing
preference or the two numbers are not comparable, and the product owner declined that trade
([ADR-0027](adr/0027-the-drive-happens-elsewhere.md), [`31_COST_MODEL.md`](31_COST_MODEL.md)).
The column stays rather than being dropped: reversing the decision is then one upstream call,
where dropping it would make reversal a `MAJOR` change to a stored shape.

`stop_state` still carries `completed` and `skipped` for the same reason. Nothing writes them
after ADR-0027 — the drive happens inside a navigation app and nobody is here to mark a stop —
but routes driven before it still hold them, and the client parses the full enum and narrows on
read. A migration that removed the values would fail to parse the first old route anyone
opened.

Soft deletion via `deleted_at` supports the offline mutation queue: a delete performed offline
must be reconcilable, and a hard delete cannot be.

### `stops`

```sql
create type stop_state as enum ('pending', 'completed', 'skipped', 'unreachable');

create table stops (
  id             uuid primary key default gen_random_uuid(),
  route_id       uuid not null references routes (id) on delete cascade,
  place_id       text not null references places_cache (place_id),

  -- user-authored: durable, never purged
  label          text,
  note           text,

  entry_order    integer not null,      -- as the user added them; what "already the fastest order" is measured against
  optimized_order integer,              -- null until optimized
  is_pinned      boolean not null default false,

  state          stop_state not null default 'pending',
  completed_at   timestamptz,

  -- leg from the previous stop, perishable
  leg_distance_m integer,
  leg_duration_s integer,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index stops_route_order_idx on stops (route_id, optimized_order nulls last, entry_order);
create index stops_place_idx on stops (place_id);
```

**There is deliberately no unique constraint on `(route_id, place_id)`.** Visiting the same
address twice in a day is legitimate — a morning delivery and an afternoon collection — and the
schema must not forbid it ([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md) edge case 4).

Keeping both `entry_order` and `optimized_order` is what allows the product to state how much
time the optimization saved, and to restore the user's original arrangement if they reject the
result.

### `favourites`

```sql
create table favourites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  place_id   text not null references places_cache (place_id),
  label      text,                       -- user-authored, durable
  use_count  integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index favourites_user_recent_idx on favourites (user_id, last_used_at desc nulls last);
```

This table is the address book, and therefore the primary cost-reduction mechanism: every stop
added from here is a Places call not made. `use_count` and `last_used_at` order the suggestions
so the most useful entries surface first.

### `user_entitlements`

```sql
create type entitlement_status as enum ('none', 'trial', 'active', 'grace', 'expired');

create table user_entitlements (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  status         entitlement_status not null default 'none',
  product_id     text,
  trial_ends_at  timestamptz,
  renews_at      timestamptz,
  revenuecat_customer_id text,
  updated_at     timestamptz not null default now(),
  updated_by     text not null default 'webhook'
);
```

**Written only by the RevenueCat webhook handler**, never by the client
([ADR-0011](adr/0011-server-side-quota-enforcement.md)). `updated_by` records the source so an
anomalous write is traceable.

### `usage_events`

```sql
create table usage_events (
  id            bigserial primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  endpoint      text not null,
  tier          text,
  cache_hit     boolean not null default false,
  units         integer not null default 1,     -- stops for T2, requests otherwise
  estimated_cost_usd numeric(10,6),
  occurred_at   timestamptz not null default now()
);

create index usage_events_user_month_idx on usage_events (user_id, occurred_at desc);
create index usage_events_reporting_idx on usage_events (occurred_at, endpoint);
```

This table makes [`31_COST_MODEL.md`](31_COST_MODEL.md) verifiable rather than theoretical. It
carries **no addresses, no coordinates and no `place_id`** — only what was called and what it
cost.

### `optimization_cache`

```sql
create table optimization_cache (
  cache_key     text primary key,      -- hash(ordered place_id set, origin, round trip, time bucket)
  result        jsonb not null,
  tier          text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index optimization_cache_expiry_idx on optimization_cache (expires_at);
```

**Shared across users, keyed by content.** The key is a hash of public place identifiers and
carries no personal data, which is what makes cross-user sharing acceptable. Two users
optimizing the same stop set in the same time bucket share one upstream call.

Because `result` contains Google-derived geometry, `expires_at` is bounded well inside the
30-day rule — in practice much shorter, since traffic staleness matters first.

### `optimization_jobs`

```sql
create type job_status as enum ('queued', 'running', 'succeeded', 'failed');

create table optimization_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  route_id    uuid not null references routes (id) on delete cascade,
  status      job_status not null default 'queued',
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Realtime is enabled on this table so the client subscribes to its own job rather than polling
([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md) tier T2).

---

## 7. Row-level security

**RLS is enabled on every table without exception.** A table without a policy is unreachable by
design rather than by accident.

| Table | Read | Write |
|---|---|---|
| `routes` | `user_id = auth.uid()` | Owner only |
| `stops` | Via the parent route's owner | Owner only |
| `favourites` | `user_id = auth.uid()` | Owner only |
| `user_entitlements` | `user_id = auth.uid()` | **Service role only** — never the client |
| `usage_events` | `user_id = auth.uid()` | Service role only |
| `optimization_jobs` | `user_id = auth.uid()` | Service role only |
| `places_cache` | Any authenticated user | Service role only |
| `optimization_cache` | Service role only | Service role only |

```sql
alter table routes enable row level security;

create policy routes_select_own on routes
  for select using (user_id = auth.uid());

create policy routes_modify_own on routes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- stops inherit ownership through their route
create policy stops_select_own on stops
  for select using (
    exists (select 1 from routes r where r.id = stops.route_id and r.user_id = auth.uid())
  );

-- entitlements: readable by the owner, writable only by the service role
create policy entitlements_select_own on user_entitlements
  for select using (user_id = auth.uid());
```

`places_cache` is readable by any authenticated user because it holds public Google data and
sharing it is the point. It is writable only by the service role, so a client cannot poison the
shared cache.

---

## 8. The coordinate purge

The mechanism that makes [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)
structural.

```sql
-- Runs daily via pg_cron, well inside the 30-day window
update places_cache
   set lat = null,
       lng = null,
       formatted_address = null,
       coords_refreshed_at = null
 where coords_refreshed_at is not null
   and coords_refreshed_at < now() - interval '30 days';
```

`place_id` is never touched. Every dependent row keeps its foreign key, its label and its
order.

**Failure of this job is an alert, not a log line.** A silently failed purge is a continuing
terms violation that nobody notices. The job records its last successful run, and an absence of
success within 48 hours pages.

**Re-hydration** happens transparently: when a route is opened and any stop has a NULL
coordinate, the Edge Function batch-resolves those `place_id` values through Place Details,
writes them back with a fresh `coords_refreshed_at`, and returns the complete route. The user
sees a brief skeleton on the affected rows and nothing else
([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J5).

---

## 9. Migrations

Forward-only, versioned, checked into the repository, applied by CI.

| Rule | Reason |
|---|---|
| Never edit an applied migration | Environments diverge silently |
| Every migration is reversible in principle, with the down path documented | Rollback must be possible even if rarely used |
| Additive first: add column, backfill, switch reads, drop later | Zero-downtime, and a released app version keeps working |
| Types regenerated in CI after every migration | Prevents drift between schema and TypeScript |
| A destructive migration requires an explicit approval step | Data loss must be a decision |

**Mobile constraint that shapes every migration:** users run old app versions for weeks. A
migration must not break a client that is still in the field. Column removal is therefore always
a two-release process — stop reading it, ship, then drop it in a later release.

## 10. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | `place_id` durable, coordinates a 30-day cache | Nullable coordinate columns, `coords_refreshed_at`, the purge job |
| [0011](adr/0011-server-side-quota-enforcement.md) | Quota and entitlement server-side | Usage and entitlement tables, and their policies |
| [0006](adr/0006-mandatory-backend-proxy.md) | All upstream calls proxied | The shared cache table |

**Decided here:** RLS is enabled on every table before any row exists in it, not added once the
feature works. A policy written after the fact is written against the queries that happen to
exist, which is how a table ends up permissive by accident.

## 11. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Route opened with all coordinates expired | Batch re-hydration on open; skeleton on affected rows |
| 2 | `place_id` no longer resolves at Google | Row flagged; **the user's label is preserved**; they re-select the address |
| 3 | Same `place_id` twice in a route | Permitted; no unique constraint exists for this reason |
| 4 | Offline delete then offline edit of the same route | Soft delete plus `updated_at` resolves order on sync |
| 5 | Two devices edit different fields of one route offline | Per-field last-write-wins; no conflict surfaced |
| 6 | Two devices reorder the same route offline | Genuine conflict; both versions presented ([`11`](11_STATE_MANAGEMENT.md)) |
| 7 | Account deleted | `on delete cascade` removes routes, stops, favourites, entitlements and usage. `places_cache` is untouched — it holds no personal data |
| 8 | Purge job misses a run | Next run catches the backlog; the 30-day window has slack for exactly this |
| 9 | Cache key collision | Practically impossible with a cryptographic hash; a mismatched result would be a stale-route defect, so the stored key includes the input set for verification |
| 10 | `usage_events` grows large | Partitioned or archived by month beyond a threshold; reporting queries use the time index |

## 12. Error handling

| Failure | Detection | Result | Fallback |
|---|---|---|---|
| Purge job fails | Missing success record within 48 h | **Page** — this is a compliance issue | Manual run |
| Re-hydration fails for some stops | Place Details response | Those stops flagged; the rest of the route works | User re-selects |
| RLS blocks a legitimate read | Empty result where rows exist | Treated as a policy defect, not a data defect | Fix the policy |
| Migration fails in CI | Pipeline failure | Deployment blocked | Fix forward |
| Cache write fails | Insert error | Logged; the request still succeeds | Cache miss next time |
| Realtime disconnects during a job | Client subscription state | Client falls back to polling the job row | Polling |

## 13. Best practices

1. **Coordinates are nullable everywhere. Handle NULL at every read.** The generated types
   enforce this; do not defeat them with `!`.
2. **Never store a coordinate without setting `coords_refreshed_at`.** An unstamped coordinate
   is invisible to the purge and becomes a permanent violation.
3. **Never put personal data in `usage_events` or `optimization_cache`.** Both are shared or
   analytical surfaces.
4. **Query through the indexes that exist.** The composite indexes match the actual access
   patterns; a query that ignores them will be slow at real data volumes.
5. **Every table gets RLS before it gets data.** Retrofitting a policy onto a populated table is
   how leaks happen.
6. **Migrations are additive by default.** Old app versions are still running.
7. **Regenerate types after every migration**, in CI, not by hand.

## 14. Checklist

- [ ] RLS enabled and policied on every table.
- [ ] Every coordinate column nullable in schema and in generated types.
- [ ] Purge job scheduled, monitored, and its failure alerts.
- [ ] Re-hydration path tested with a fully expired route.
- [ ] No unique constraint on `(route_id, place_id)`.
- [ ] `usage_events` verified to contain no personal data.
- [ ] `optimization_cache` key verified to contain no personal data.
- [ ] Cascade deletion verified to remove all user data.
- [ ] Migrations verified against the previous released app version.
- [ ] Types regenerated in CI.

## 15. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All tables above; RLS; purge; cache | — |
| 1.x | `stop_photos` via Storage; CSV import staging table | Feature delivery |
| 2.0 | Time windows and priorities on `stops`; `vehicles` table prepared but unused | Gate D3 |
| 3.0 | Partitioning of `usage_events`; read replica if reporting load requires it | Volume |

## 16. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Coordinates modelled as nullable cache with `coords_refreshed_at` | Platform terms permit at most 30 days | Architecture |
| 2026-08-06 | `places_cache` shared across users without ownership | Public Google data; sharing is a material cost saving | Architecture |
| 2026-08-06 | No unique constraint on `(route_id, place_id)` | Visiting the same address twice is legitimate | Architecture |
| 2026-08-06 | `entry_order` retained alongside `optimized_order` | Enables the time-saved measurement and order restoration | Architecture |
| 2026-08-06 | Soft deletion on `routes` | Required for offline delete reconciliation | Architecture |

## 17. Rationale

The schema's organising principle is the **durability boundary**: what the user created is
permanent, what Google provided is temporary. That single distinction resolves what would
otherwise be a conflict between a product requirement (saved routes must work forever) and a
legal constraint (coordinates expire in 30 days).

Making the coordinate columns nullable rather than adding a separate expiry mechanism is
deliberate. The compiler now forces every caller to confront the case, which converts a terms
compliance problem into a type error — the cheapest possible place to catch it. A design where
coordinates are non-null with a separate "is expired" flag would compile fine and violate the
terms in production.

Sharing `places_cache` across users is the schema's main cost decision. Since a `place_id` is
public data, per-user copies would multiply Places calls for no benefit. The privacy question
does not arise because the table records only what a place is, never who looked for it.

Keeping `entry_order` permanently, rather than overwriting it on optimization, is what makes
"you saved 41 minutes" a measurement rather than a marketing number — and that figure is the
product's only numeric proof of value ([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J3).

## 18. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Store coordinates permanently, non-null | Simplest schema; no purge; no NULL handling; instant loads | Direct terms violation risking account termination. Not a trade-off |
| Store only `place_id`, resolve on every read | Unambiguously compliant; no purge job | Every route open becomes N Place Details calls, multiplying the dominant cost line and breaking offline use |
| Per-user `places_cache` with an owner column | Simpler privacy story; no shared-table questions | Multiplies Places calls across users for no benefit. The table holds public data with no identity attached |
| Denormalise coordinates into `stops` | Fewer joins; simpler queries | Duplicates the expiry problem across every row and makes the purge a full-table rewrite |
| Hard delete instead of soft delete | Simpler; smaller tables | Offline delete reconciliation becomes impossible — a tombstone is required to know a row was deleted rather than never synced |
| Unique constraint on `(route_id, place_id)` | Prevents accidental duplicates | Forbids a legitimate use case: two visits to one address in one day |
