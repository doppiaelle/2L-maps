-- Reconcile `user_entitlements` with ADR-0015 and with the webhook that writes it.
--
-- Two separate divergences had accumulated, and both were invisible because the
-- only code that touches this table cannot run in the test environment.
--
-- **ADR-0015 turned entitlement from a boolean into a three-value plan.** The
-- ADR names the consequences explicitly — "it becomes a three-value plan with
-- per-plan allowances, and that touches every quota check, the BillingProvider,
-- the entitlement table, and the seven-step pipeline's step 2" — and the table
-- was the part that never followed. Without `plan` and `day_pass_expires_at`
-- there is nowhere to record a day pass, which is a consumable whose balance
-- must live on the server precisely because a store receipt cannot restore it.
--
-- **The webhook writes columns that were never created.** `expires_at`,
-- `last_event_id` and `occurred_at` appear in its upsert; none existed, so every
-- entitlement event would have failed with an undefined-column error and been
-- retried by RevenueCat until it gave up. Idempotency by event id and ordering
-- by event timestamp are both properties of that statement, and neither could
-- hold against a table without the columns they read.
--
-- The status enum gains the two values the webhook maps to. `lapsed` was already
-- being written for cancellation and expiry; `day-pass` is what a non-renewing
-- purchase produces.
--
-- Specification: docs/12_DATABASE.md, ADR-0015, docs/20_SUBSCRIPTIONS.md §6.

-- New enum values must be committed before they can be used in the same session,
-- which is why the column work below never mentions them in a default.
alter type entitlement_status add value if not exists 'lapsed';
alter type entitlement_status add value if not exists 'day-pass';

alter table user_entitlements
  -- Nullable: derived from status and the day-pass clock by `resolvePlan`, and
  -- stored only when the webhook knows something the derivation cannot — a plan
  -- granted outside the subscription lifecycle.
  add column if not exists plan                text,
  -- The consumable's expiry. `resolvePlan` checks it against the clock before it
  -- looks at anything else: the row keeps saying day-pass afterwards, and
  -- trusting it would hand out Pro allowances indefinitely for one payment.
  add column if not exists day_pass_expires_at timestamptz,
  -- What the webhook has always written.
  add column if not exists expires_at          timestamptz,
  add column if not exists last_event_id       text,
  add column if not exists occurred_at         timestamptz not null default to_timestamp(0);

comment on column user_entitlements.plan is
  'Overrides the plan derived from status. Normally null — derivation is the rule (ADR-0015).';
comment on column user_entitlements.day_pass_expires_at is
  'A day pass is consumable, so its balance lives here rather than in a store receipt (docs/20_SUBSCRIPTIONS.md §6).';
comment on column user_entitlements.occurred_at is
  'RevenueCat event time, not arrival time. Delivery is unordered: a cancellation and its renewal can arrive backwards, and applying them in arrival order locks a paying user out. Epoch default so the first real event always wins.';
comment on column user_entitlements.last_event_id is
  'RevenueCat retries on any non-2xx, so the same event arrives more than once as a matter of course. This is what makes the replay a no-op.';

-- The quota window for a day pass is the pass itself, not the calendar month, so
-- the usage query filters on an arbitrary start rather than date_trunc.
create index if not exists usage_events_user_endpoint_window_idx
  on usage_events (user_id, endpoint, occurred_at desc);
