# 13 — Backend

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0006](adr/0006-mandatory-backend-proxy.md) · [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) · [`12_DATABASE.md`](12_DATABASE.md)

---

## 1. Purpose

This document specifies the server side: the Supabase Edge Functions, the pipeline every one of
them runs, and how upstream Google calls are authenticated, limited, cached and recorded.

The backend exists for four reasons, in order of necessity: the Route Optimization API
**cannot** be called from a client at all; web-service API keys cannot be safely shipped;
quotas are unenforceable client-side; and a shared cache requires a shared server.

## 2. Goals

1. Keep every Google credential except the Maps SDK render key off the device.
2. Enforce entitlement and quota where the client cannot reach.
3. Cut upstream cost through a cross-user content-keyed cache.
4. Make every metered call recorded and therefore auditable.
5. Fail in a way the client can degrade from, never in a way it must guess about.

**Non-goals.** No business logic that belongs on the client, no custom infrastructure beyond
Supabase, no general-purpose API.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Credential custody | Supabase secrets | Never in the repo, `app.config`, or a runtime-read build secret |
| Entitlement truth | `/revenuecat-webhook` → `user_entitlements` | Client state is UI only |
| Tier selection | `/optimize` | Server-side only |
| Cache | `optimization_cache`, `places_cache` | Content-keyed, shared |
| Usage recording | Every function | Feeds [`31_COST_MODEL.md`](31_COST_MODEL.md) |

---

## 4. Text diagrams

### Function inventory

```
  ┌──────────────────────────────────────────────────────────────┐
  │  SUPABASE EDGE FUNCTIONS (Deno)                              │
  │                                                              │
  │  /places-autocomplete   Places Autocomplete    server key    │
  │  /place-details         Place Details          server key    │
  │  /geocode               Geocoding, batch       server key    │
  │  /routes-compute        Routes API             server key    │
  │  /optimize              tier selection T0-T2   server key +  │
  │                                                SA OAuth2     │
  │  /usage-quota           read current usage     no upstream   │
  │  /revenuecat-webhook    entitlement writes     signature     │
  │                                                verification  │
  └──────────────────────────────────────────────────────────────┘
```

### The seven-step pipeline — every metered function, in this order

```
  request
     │
  1  ▼  verify Supabase JWT ─────────────────▶ 401 if invalid
     │
  2  ▼  read entitlement from DB ────────────▶ 402 if none
     │     (never from the client)
     │
  3  ▼  rate limit, short window ────────────▶ 429 if exceeded
     │
  4  ▼  quota check, calendar month ─────────▶ 429 if exhausted
     │
  5  ▼  cache lookup ────────────┐
     │                            │ hit → record(cache_hit: true) → return
  6  ▼  upstream call ◀───────────┘ miss
     │     with minimal field mask
     │
  7  ▼  cache write + usage_events insert
     │
     ▼  response
```

**The order is load-bearing.** Cache lookup sits *after* quota so a cache hit still counts
against abuse limits while costing nothing upstream. Entitlement sits before rate limiting so
an expired user gets a paywall rather than a confusing 429.

### Credential topology

```
  CLIENT                          EDGE FUNCTIONS              GOOGLE
  ──────                          ──────────────              ──────
  Maps SDK key ────────────────────────────────────────────▶  Maps SDK
  (restricted: bundle ID + SHA-1,
   scoped to Maps SDK only —
   the ONLY credential on device)

  user JWT ────────▶  server API key ───────────────────────▶  Places, Routes,
                      (Supabase secret,                        Geocoding
                       IP-unrestricted, server-only)

           ────────▶  service account OAuth2 ────────────────▶  Route Optimization
                      (JSON credential in Supabase secrets;
                       cannot exist on a client under any
                       circumstances)
```

---

## 5. Flows

**The seven-step pipeline every function runs.** The order is load-bearing and is not a
suggestion.

```
  1  verify JWT           ──▶ 401   the caller is who they claim
  2  check entitlement    ──▶ 402   an expired trial sees a paywall, not a rate limit
  3  check rate limit     ──▶ 429   burst protection
  4  check quota          ──▶ 429   calendar-month allowance
  5  cache lookup                   after quota, so a hit still counts
  6  upstream call        ──▶ 5xx   the only step that costs money
  7  record usage                   always, hit or miss
```

**Why entitlement precedes rate limiting.** Reversing 2 and 3 tells a lapsed user they are
going too fast, when the truth is they are not subscribed. The error the user sees must name
the real cause, or the next action they take cannot fix it.

**Why the cache sits after the quota check.** A cache hit costs us nothing and still consumes
allowance. Free cache hits would let a user with a recurring route consume unlimited value
while the quota reports them as idle — and recurring routes are exactly what this segment has.

**A failed upstream call.** Retried with bounded exponential backoff on 5xx only; a 4xx is
never retried, because retrying a request that cannot succeed burns quota to reach the same
answer.

## 6. Functions

### `/optimize` — the core function

Selects a tier, calls upstream, normalises the result.

**Input:** route id, stop `place_id` list, origin, round-trip flag, optional departure time.
**Output:** an `OptimizationResult` ([`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md)),
or a job id when asynchronous.

Additional steps beyond the standard pipeline:

1. **Re-hydrate expired coordinates** before building the request — a stop with a NULL
   coordinate cannot be sent upstream
   ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).
2. **Select the tier** by the rule in [`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md).
   Never from a client hint.
3. **T1: two-phase call** — order with `TRAFFIC_AWARE`, then detail with
   `TRAFFIC_AWARE_OPTIMAL`.
4. **T2 above the async threshold:** create an `optimization_jobs` row, return its id
   immediately, and complete the work in the background. The client subscribes via Realtime.
5. **Normalise** every tier to one result shape.

### `/places-autocomplete`

The highest-frequency and highest-cost endpoint ([`31_COST_MODEL.md`](31_COST_MODEL.md)).

- **Session token is mandatory.** A request without one is rejected as a client defect — it
  would be billed outside session pricing.
- Requests within a session are capped, matching the Places session billing cap.
- Results are biased to the user's region and to a radius around their current location.
- **No result caching.** Autocomplete is inherently per-keystroke and per-session; caching would
  breach session semantics and return stale suggestions.

### `/geocode`

Batch address resolution for list import. Used **instead of** autocomplete for bulk entry, which
is materially cheaper. Returns resolved and unresolved rows separately so the client can offer
partial success ([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J8).

### `/revenuecat-webhook`

The only writer of `user_entitlements`.

1. **Verify the signature.** An unverified webhook is an open door to free entitlement.
2. Map the RevenueCat event to an entitlement status.
3. Write with `updated_by = 'webhook'` for traceability.
4. Return 200 quickly; RevenueCat retries on failure, so the handler must be idempotent.

### `/usage-quota`

Read-only. Returns current usage against limits so the client can show quota state before an
action fails, rather than after.

---

## 7. Cross-cutting behaviour

**Authentication.** Every function except the webhook requires a valid Supabase JWT. The webhook
authenticates by signature instead.

**Idempotency.** `/optimize` accepts an idempotency key so a client retry after a timeout does
not produce a second billable call. The webhook is idempotent by event id.

**Timeouts and retries.** Every upstream call has a deadline shorter than the function's own
limit, so the function always returns something rather than being killed. Retries use bounded
exponential backoff and only for 5xx and network errors — **never for 4xx**, which indicates
our own malformed request and must alert instead.

**Field masks.** Mandatory on every Routes API call, and minimal. Field masks determine the
billing SKU; over-requesting silently escalates the price of every call
([`31_COST_MODEL.md`](31_COST_MODEL.md)).

**Observability.** Every function emits a structured log line with user id, endpoint, tier,
cache-hit, duration and outcome. **No addresses, no coordinates, no `place_id` tied to a user**
([`21_ANALYTICS.md`](21_ANALYTICS.md)).

---

## 8. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0006](adr/0006-mandatory-backend-proxy.md) | Every web-service call is proxied | The existence of every function here |
| [0011](adr/0011-server-side-quota-enforcement.md) | Quota and entitlement server-side | Steps 2–4 and 7 of the pipeline |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates perishable | Re-hydration endpoints and the purge job |
| [0003](adr/0003-tiered-optimization-cascade.md) | Cascade T0–T3 | Tier selection, which happens here and not in the client |
| [0012](adr/0012-long-term-osm-exit-path.md) | OSM exit path | Why the contract is ours, not Google's, at the boundary |

**Decided here:** the tier is chosen server-side and never named in the response contract. The
client shows a wait and a result; if it knew which engine ran, migrating engines would become a
client release.

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | JWT valid, entitlement absent | 402 with paywall context. Read-only access to own data is unaffected |
| 2 | Quota exhausted mid-request | Checked before upstream, never after — the call is not made |
| 3 | Cache hit | Recorded with `cache_hit: true`; no upstream call; quota still decremented |
| 4 | Coordinates expired for some stops | Batch re-hydration, then proceed. Invisible to the client |
| 5 | Upstream 4xx | Generic error to the client, **full detail to Sentry** — our defect, alert |
| 6 | Upstream 5xx | Bounded retry, then a degradation hint the client can act on |
| 7 | Function times out | Returns before its own deadline with a partial or degraded result |
| 8 | Webhook arrives out of order | Event timestamp compared; stale events ignored |
| 9 | Webhook signature invalid | 401, logged as a security event, no write |
| 10 | Concurrent optimizations, one user | Idempotency key deduplicates; the latest wins |
| 11 | Autocomplete without a session token | 400 — a client defect that would break session billing |
| 12 | Async job orphaned | Jobs older than a threshold are marked failed by a sweeper; the client is notified |

## 10. Error handling

| Status | Meaning | Client action |
|---|---|---|
| 200 | Success | Render |
| 202 | Accepted as an async job | Subscribe to Realtime on the job row |
| 400 | Malformed request | **Our defect.** Generic message, alert |
| 401 | Invalid or missing JWT | Re-authenticate |
| 402 | No entitlement | Paywall with restore path |
| 429 | Rate limit or quota | Show the limit, the reset time, and what still works |
| 500 | Unhandled | Generic message; alert |
| 503 | Upstream unavailable after retries | **Degradation hint included** so the client can offer T0 |

**Every error response carries a machine-readable code and a human-readable message.** The
client branches on the code and never parses the message.

### What to look for in the logs

Supabase dashboard → Edge Functions → Logs. Every line is one-line JSON with an `event` field,
so filtering by that word is enough. Four causes produce identical sentences on the phone, and
these are what tell them apart ([ADR-0026](adr/0026-google-tells-us-what-is-wrong.md)):

| `event` | Emitted when | What it carries | Which function's log |
|---|---|---|---|
| `upstream_refused` | **Any** upstream refused — Places, Routes, Anthropic or OpenRouter | `api` (which one), `httpStatus`, `upstreamCode` (the provider's own enum), and its **message: the field, value or model it objected to** | the one that made the call |
| `place_unresolved` | A `place_id` could not be turned into coordinates | The id and the upstream status. This is what puts "Address needs refreshing" on a row | **`place-details`** |
| `optimize_order` | Google returned an order — **on success, not on failure** | The `place_id`s submitted for reordering, the index array returned, and whether the route was a round trip. It is how "is it choosing the best order?" gets answered from a real route rather than guessed, and with **three or more** intermediates it also settles which way the index array reads (`CLAUDE.md` §13 rule 11) | **`optimize`** |
| `autocomplete_failed` | `/places-autocomplete` gave up | Which of the four failures, and the upstream status | `places-autocomplete` |
| `request_rejected` | A request failed our own schema before the pipeline ran | The endpoint and the **field names** that failed | any |
| `request_refused` | The pipeline refused — no entitlement, quota, rate limit | The endpoint and the code | any |
| `pipeline_failed` | An unhandled throw inside the pipeline | The error type and message | any |

**No line contains an address, a coordinate, or a `place_id` tied to a user**
([`CLAUDE.md`](../CLAUDE.md) §9 rule 7). Google's message is scrubbed of the values we sent
before it is written; a bare `place_id` is kept because it names a building rather than a
person ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).

## 11. Best practices

1. **The pipeline order is fixed.** Reordering it changes cost and security properties.
2. **Never trust the client for tier, entitlement, quota or ownership.**
3. **Minimal field masks, reviewed on every change.**
4. **Retry 5xx only.** A 4xx retry burns quota on a request that cannot succeed.
5. **Record every call, cache hit or not**, or the cost model is unverifiable.
6. **Verify webhook signatures** — always, without exception.
7. **Never log personal data**, including inside serialised error objects.
8. **Return a degradation hint on 503** so the client can fall back intelligently rather than
   guessing.

## 12. Checklist

- [ ] Every function runs the seven steps in order.
- [ ] No web-service key or service-account credential exists client-side.
- [ ] Service-account JSON lives only in Supabase secrets, with a documented rotation procedure.
- [ ] Webhook signature verification tested with an invalid signature.
- [ ] Idempotency verified for `/optimize` and the webhook.
- [ ] Field masks minimal and verified against the intended SKU.
- [ ] `usage_events` written on every metered call, cache hits included.
- [ ] No personal data in logs — verified by inspection of real log output.
- [ ] 4xx alerts; 5xx retries with bounds.
- [ ] Async job sweeper active for orphaned jobs.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All seven functions; pipeline; cache; quota; usage recording | — |
| 1.x | Cache warming for frequently-repeated routes; hit-rate tuning | Gate D2 cache metric |
| 2.0 | Hierarchical chunking inside `/optimize` for >25 stops | Gate D3 |
| 3.0 | `RoutingProvider` adapter for a self-hosted Valhalla | An [ADR-0012](adr/0012-long-term-osm-exit-path.md) trigger |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | All web-service calls proxied | Route Optimization requires a service account; keys cannot ship | Architecture |
| 2026-08-06 | Cache lookup placed after quota | A cache hit should still count against abuse limits | Architecture |
| 2026-08-06 | Autocomplete results not cached | Session semantics; stale suggestions | Architecture |
| 2026-08-06 | 503 carries a degradation hint | The client cannot otherwise know whether T0 is appropriate | Architecture |

## 15. Rationale

The backend is deliberately thin. It holds no business logic that could live on the client; it
exists to hold **secrets, limits and cache** — the three things a client cannot be trusted with.
Every function is a proxy with a pipeline, and the pipeline is the same one every time so that
adding an endpoint cannot accidentally omit a step.

The seven-step order encodes decisions that are easy to get subtly wrong. Cache after quota
means a user cannot bypass their limit by repeating a cached request — which matters because the
cache is shared, so a popular route would otherwise be infinitely free to one abusive account.
Entitlement before rate limit means an expired trial user sees a paywall, not a rate-limit
message they cannot act on.

Sharing the cache across users is the single largest cost lever available, and it is safe
precisely because the key is content-derived: a hash of public `place_id` values and a time
bucket, holding nothing that identifies who asked.

The rule that a 4xx alerts rather than retries deserves emphasis. In this system a malformed
upstream request is always our defect — the client cannot construct one, because it does not
construct upstream requests at all. Retrying it would burn quota on a call that can never
succeed, and would hide the bug.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Direct client calls with restricted keys | No backend, no latency hop | Bundle-ID restriction does not exist for web-service APIs, and the Route Optimization API cannot work this way at all |
| Cloud Run or Cloud Functions instead of Edge Functions | Same platform as GCP; natural service-account home | A second platform, deployment pipeline and auth boundary alongside Supabase, which is already required |
| Cache before quota | Cache hits are free, so why charge them | Lets an abusive account replay a cached popular route without limit |
| Per-user cache | Simpler invalidation; no shared-data questions | Discards most of the saving. The key holds only public identifiers, so the privacy objection does not apply |
| Retry all upstream errors uniformly | Simpler retry logic | Retrying 4xx burns quota on requests that cannot succeed and conceals our own defects |
| Trusting the client's RevenueCat entitlement | No webhook; instant; simpler | A client reports what it is told to report. Entitlement is an access-control decision |
