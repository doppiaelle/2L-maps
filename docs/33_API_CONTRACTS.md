# 33 — API Contracts

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`13_BACKEND.md`](13_BACKEND.md) · [`15_ROUTE_OPTIMIZATION.md`](15_ROUTE_OPTIMIZATION.md) · [`31_COST_MODEL.md`](31_COST_MODEL.md)

---

> **This document is the single source of truth for every API limit, timeout, retry policy and
> rate limit in the system.** No other document restates these numbers; they cite this one. A
> figure appearing elsewhere with a different value is a defect.

---

## 1. Purpose

### Additive HERE migration contracts

All three endpoints require a Supabase user JWT and reuse their legacy endpoint's existing
entitlement, burst limit, quota, and usage event. Provider API keys never reach the client.

- `POST /functions/v1/here-search`: `{ input, locale?, bias?: { lat, lng }, limit? }` returns
  `{ suggestions: [{ address, latitude, longitude }] }`. Suggestions are transient and expose no
  HERE place identifier.
- `POST /functions/v1/here-geocode`: `{ addresses, region? }` returns
  `{ resolved: [{ savedPlaceId, addressText, formattedAddress, latitude, longitude, fetchedAt,
  expiresAt, index }], unresolved: [{ index, input }] }`. The internal UUID and user-authored
  address remain durable; provider-derived values expire within 30 days.
- `POST /functions/v1/here-place-details`: `{ savedPlaceIds }` returns the same resolved shape and
  `{ unresolved: [{ savedPlaceId }] }`. Only the authenticated owner's saved places are readable;
  fresh private coordinates are reused and expired coordinates are geocoded again.


This document specifies every interface the app crosses: the internal contracts between client
and Edge Functions, and the external contracts between Edge Functions and Google. For each it
records inputs, outputs, errors, timeouts, retry policy, caching and rate limits.

## 2. Goals

1. Make every contract implementable without consulting an external document.
2. Centralise every limit so contradictions are impossible.
3. Define one error taxonomy the whole client can branch on.
4. Record upstream constraints with their source and date, since Google changes them.

**Non-goals.** No implementation, no SDK usage examples, no cost analysis
([`31_COST_MODEL.md`](31_COST_MODEL.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Contract accuracy | Architecture | Re-verified at each phase gate |
| Upstream limit verification | Architecture | Sources and dates recorded |
| Client conformance | Contract tests | [`22_TESTING.md`](22_TESTING.md) |

---

## 4. Text diagrams

### Contract layers

```
  CLIENT  ──── internal contracts (§7) ────▶  EDGE FUNCTIONS
                 stable, ours to change              │
                 versioned with the app              │
                                                     │
                                          external contracts (§8)
                                          Google's, can change
                                          without notice
                                                     │
                                                     ▼
                                                  GOOGLE
```

The two layers are deliberately separated: an upstream change is absorbed in an Edge Function
without an app release, which is the practical benefit of the proxy
([ADR-0006](adr/0006-mandatory-backend-proxy.md)).

---

## 5. Flows

**How a contract changes.** The contract is the interface; changing it is a versioned event.

```
  proposed change
        │
        ▼
  additive?  ──yes──▶ MINOR; clients unaffected; contract test extended
        │ no
        ▼
  breaking ──▶ MAJOR (25) ──▶ both shapes served during the transition
                                       │
                                       ▼
                          clients migrated ──▶ old shape removed
```

**How a response is trusted.** It is not. Every payload crossing a boundary is `unknown` until
parsed by a schema — network, storage and deep links alike. A response shape assumed rather
than validated is how a provider's silent change becomes a crash in the field
([`../CLAUDE.md`](../CLAUDE.md) §3).

**How a failure is classified.** Every error maps to exactly one taxonomy entry, and every
taxonomy entry names a user-visible outcome and a next action. An error with no entry is a
gap in this document, not an unexpected condition.

**Retry policy.** 5xx and timeouts are retried with bounded exponential backoff; 4xx never is.
Retrying a rejected request spends quota to receive the same rejection.

## 6. Error taxonomy

Every internal response carries a machine-readable `code`. **The client branches on `code`,
never on `message`.**

```jsonc
// Error envelope — identical across every endpoint
{
  "error": {
    "code": "QUOTA_EXHAUSTED",       // stable, enumerated
    "message": "Monthly limit reached", // human-readable, may change
    "details": {                     // optional, code-specific
      "limit": "optimizations",
      "resetsAt": "2026-09-01T00:00:00Z"
    },
    "degradationHint": "T0_AVAILABLE" // optional; tells the client how to degrade
  }
}
```

| Code | HTTP | Meaning | Client action |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid JWT | Re-authenticate |
| `NO_ENTITLEMENT` | 402 | No trial or subscription | Paywall with restore |
| `RATE_LIMITED` | 429 | Short-window velocity limit | Back off; retry after the stated interval |
| `QUOTA_EXHAUSTED` | 429 | Monthly limit reached | Show limit, reset date, what still works |
| `INVALID_REQUEST` | 400 | Malformed | **Our defect** — generic message, alert |
| `MISSING_SESSION_TOKEN` | 400 | Autocomplete without a session token | Client defect, alert |
| `UPSTREAM_UNAVAILABLE` | 503 | Google failed after retries | Degrade per `degradationHint` |
| `UPSTREAM_TIMEOUT` | 504 | Deadline exceeded | Degrade or queue |
| `PARTIAL_RESULT` | 200 | Succeeded with exclusions | Render, surface the exclusions |
| `INTERNAL` | 500 | Unhandled | Generic message, alert |

`degradationHint` values: `T0_AVAILABLE`, `RETRY_LATER`, `CACHED_RESULT_AVAILABLE`, `NONE`.

---

## 7. Internal contracts

### `POST /optimize`

```jsonc
// Request
{
  "routeId": "uuid",
  "origin": { "placeId": "ChIJ…" } | { "lat": 45.69, "lng": 9.67 },
  "stops": [{ "stopId": "uuid", "placeId": "ChIJ…", "isPinned": false }],
  "isRoundTrip": false,
  "departureTime": "2026-08-07T07:30:00Z",   // optional; defaults to now
  "idempotencyKey": "uuid"                    // required
}

// Response 200 — synchronous
{
  "order": ["stopId", "stopId", "…"],
  "legs": [{ "fromStopId": "…", "toStopId": "…", "distanceM": 4210, "durationS": 540 }],
  "totalDistanceM": 38400,
  "totalDurationS": 4320,
  "eta": "2026-08-07T08:42:00Z",
  "polyline": "encoded…" | null,          // null for T0
  "tier": "T0" | "T1" | "T2" | "T3",
  "degraded": false,
  "unreachable": [{ "stopId": "…", "reason": "NO_ROUTE" }],
  "computedAt": "2026-08-07T07:30:04Z",
  "cacheHit": false
}

// Response 202 — asynchronous (tier T2 above threshold)
{ "jobId": "uuid", "status": "queued", "estimatedSeconds": 25 }
```

| Property | Value |
|---|---|
| Timeout (client) | 15 s synchronous |
| Timeout (upstream) | 10 s per phase, so the function always returns |
| Retry | 5xx and network only; 2 attempts, exponential backoff from 500 ms |
| Idempotency | Required. A repeated key within 60 s returns the original result without a billable call |
| Rate limit | 20 per hour per user |
| Quota | 300 per calendar month per user |
| Cache | Content-keyed on the **sorted stop set** plus origin, shape and departure bucket; TTL 6 h. Reordering alone is a hit — the optimizer's answer does not depend on the order the stops were typed in. Adding, removing or replacing a stop changes the key by construction, so a re-run needs no flag from the client. A hit still consumes a unit: the lookup sits after the quota check ([`13_BACKEND.md`](13_BACKEND.md) §5) |
| Cache contents | The order is stored as **place ids**, never as the caller's `stopId`s, and leg ids are stripped. Two users with the same addresses share the entry and each gets the order back in their own terms; an entry that cannot be mapped onto the caller's stops is treated as a miss |
| `unreachable` | Never causes total failure unless **all** stops are unreachable |

### `GET /places-autocomplete`

```jsonc
// Request
{ "input": "via roma 12", "sessionToken": "uuid", "bias": { "lat": …, "lng": … } }

// Response 200
{ "suggestions": [{ "placeId": "ChIJ…", "primaryText": "Via Roma 12",
                    "secondaryText": "Bergamo, BG, Italia" }] }
```

| Property | Value |
|---|---|
| Session token | **Mandatory.** Absent → 400 `MISSING_SESSION_TOKEN` |
| Minimum input | 3 characters — enforced server-side as well as client-side |
| Client trigger | An explicit press, never a keystroke ([ADR-0019](adr/0019-explicit-address-search.md)) |
| Requests per session | 12 maximum, matching Places session billing |
| Timeout | 4 s |
| Retry | None — the user is typing; a retry arrives after the input has changed |
| Cache | **None.** Session semantics and staleness |
| Rate limit | 60 per minute per user |
| Quota | 1,200 sessions per calendar month per user |
| Upstream filter | **None.** No `includedPrimaryTypes`, no `types` — ranking is Google's own, so a search here returns what the same search returns in Google Maps ([ADR-0026](adr/0026-google-tells-us-what-is-wrong.md)) |
| `UPSTREAM_UNAVAILABLE` | Carries `details.upstreamStatus`: the status Google answered with, or `null` when it never answered |

### `POST /geocode`

```jsonc
// Request — batch, used for list import
{ "addresses": ["Via Roma 12, Bergamo", "…"], "region": "IT" }

// Response 200
{
  "resolved":   [{ "index": 0, "placeId": "ChIJ…", "formattedAddress": "…",
                   "lat": 45.6983, "lng": 9.6773 }],
  "unresolved": [{ "index": 1, "input": "…", "reason": "NOT_FOUND" }]
}
```

**Coordinates are returned here** because the caller needs them immediately — an imported list
has to appear on the map — and a second round trip to fetch what this call already resolved
would be a billed request for data we just had. They are subject to the 30-day rule like every
other coordinate ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)); `place_id`
is the durable half of each row.

| Property | Value |
|---|---|
| Batch maximum | 25 addresses per request |
| Timeout | 10 s |
| Retry | 5xx only; 2 attempts |
| Cache | Per address, keyed by normalised input + region; TTL 24 h |
| Quota | 1,500 per calendar month per user |
| Partial success | **Always allowed.** Unresolved rows never fail the request |

### `POST /place-details`

The re-hydration path. `place_id` is stored indefinitely; the coordinates beside it expire after
30 consecutive days and are then null. This endpoint turns the durable keys back into a usable
route ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).

```jsonc
// Request — batch, because twenty-five sequential lookups cost twenty-five times one batch
{ "placeIds": ["ChIJ…", "ChIJ…"] }

// Response 200
{
  "resolved":   [{ "placeId": "ChIJ…", "formattedAddress": "…",
                   "lat": 45.6983, "lng": 9.6773 }],
  "unresolved": [{ "placeId": "ChIJ…", "reason": "NOT_FOUND" }]
}
```

| Property | Value |
|---|---|
| Batch maximum | `MAX_STOPS` per request |
| Timeout | 5 s |
| Retry | 5xx only; 1 attempt |
| Cache | Per `place_id`; **TTL 30 days, never longer.** The cache expiry *is* the terms obligation, not a tuning knob |
| Quota | Shares the geocoding allowance |
| Partial success | Always allowed. A `place_id` Google no longer recognises is reported, never silently dropped — the stop stays in the route with no coordinate and the user is told which one needs re-entering |

**`NOT_FOUND` here is a real state, not an error.** Places are demolished, merged and re-issued;
a saved route from last year can contain a `place_id` that no longer resolves. The route survives
minus that stop's geometry, which is why coordinates are nullable everywhere
(`CLAUDE.md` §0 rule 3).

### `POST /parse-addresses`

Turns unstructured input into candidate address strings ([ADR-0016](adr/0016-ai-assisted-stop-entry.md)).

```jsonc
// Request — exactly one of `text` or `imageBase64`
{ "text": "domani: via roma 12 bergamo, poi p.zza garibaldi 5 int 2, e Kennedy 3/B",
  "locale": "it-IT" }

// Response 200
{
  "candidates": [{ "index": 0, "address": "Via Roma 12, Bergamo" }],
  "unparsed": ["e Kennedy 3/B"]
}
```

| Property | Value |
|---|---|
| Input | `text` (≤ 4,000 characters) **or** `imageBase64` (≤ 5 MB), never both |
| Output | Candidate **address strings only**. Constrained by JSON schema — the model cannot emit a URL, a `place_id` or a coordinate because no such field is declared |
| Maximum candidates | `MAX_STOPS`. A paste yielding more is a 400, not a 200-address geocoding bill |
| Timeout | 15 s |
| Retry | 5xx only; 1 attempt |
| Cache | Content-keyed on the input hash; TTL 1 h. A user re-parsing the same paste after a mistake is free |
| Quota | 100 per calendar month per user |
| Trust | The input is **third-party text**. It is delimited and labelled as data in the request, and the response is never used as an instruction, a URL or a query parameter — only as text passed to `/geocode` |
| Image retention | **None.** Parsed and discarded. Never stored, never logged, never in a crash report (risk C19) |
| Partial success | Always allowed. Unparsed lines are returned for the user to correct, never dropped |

**Parsing does not produce a stop.** The candidates go through `/geocode` to become `place_id`s;
the durable key is minted by Google, not by a model
([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).

### `GET /usage-quota`

Read-only, no upstream call, no quota consumption. **The authoritative source of plan
allowances** ([ADR-0011](adr/0011-server-side-quota-enforcement.md),
[ADR-0015](adr/0015-ad-supported-free-tier.md)): the client's constants are an offline display
fallback, and this response overrides them field by field.

```jsonc
{ "period": { "from": "2026-08-01", "to": "2026-08-31" },
  "plan": "free",
  "status": "none",              // trial | active | lapsed | none
  "trialEndsAt": null,
  "renewsAt": null,
  "dayPassExpiresAt": null,
  "limits": [{ "name": "optimizations", "used": 12, "limit": 15 },
             { "name": "autocompleteSessions", "used": 4, "limit": 10 }] }
```

**Entitlement and allowances arrive together, in one call.** They are the same question asked
twice — what may this user do — and splitting them would mean two round trips on every app start
to render one screen. `plan` and `status` are distinct on purpose: a `lapsed` subscriber is on
the `free` plan, not locked out ([ADR-0015](adr/0015-ad-supported-free-tier.md)).

**This endpoint is the only thing the client trusts about entitlement.** The store SDK reports
what the *device* believes; the two legitimately disagree after a refund, a family-sharing
change, or a purchase made on another device, and when they do this response wins
([ADR-0011](adr/0011-server-side-quota-enforcement.md)).

### `POST /revenuecat-webhook`

| Property | Value |
|---|---|
| Authentication | Signature verification. Invalid → 401, logged as a security event, no write |
| Idempotency | By RevenueCat event id |
| Ordering | Event timestamp compared against stored state; stale events ignored |
| Response | 200 quickly; RevenueCat retries on non-2xx |
| Effect | The **only** writer of `user_entitlements` |

---

### `places_cache`, read directly by the client

Not an Edge Function and not an exception to [ADR-0006](adr/0006-mandatory-backend-proxy.md).
The proxy exists so no Google **credential** reaches the client; this is our own table, over
PostgREST, under a policy that already permits it
(`places_cache_select_authenticated ... using (true)` — the row carries no ownership because a
`place_id` is public Google data).

| Reader | What for | Cost |
|---|---|---|
| Address book | The street name beside a saved `place_id` (`favourites-adapter.ts`) | None |
| History rows | The first and last stop of a saved route, so a row says which day it was (`routes-adapter.ts`) | None |

Both go through the foreign key the owning table already has, so they are embeds on a query
that was happening anyway — **no upstream call and no unit of quota**. That is the distinction
that keeps the pipeline's cache-after-quota ordering intact: `/place-details` *buys* a place
and is metered for it; reading a row we already hold, for display, is not a purchase.

`formatted_address` is null after the thirty-day purge, and every reader treats null as the
ordinary state of an old row rather than a failure
([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)).

---

## 8. External contracts — Google

> **Verification status: unverified against primary sources.** `developers.google.com` was
> unreachable from this environment (403 from the egress proxy). Values below come from web
> research on 2026-08-06 and must be confirmed against the official documentation before
> implementation. Confidence noted per row.

### Routes API — `computeRoutes`

| Constraint | Value | Confidence |
|---|---|---|
| Maximum intermediate waypoints | **25** | High |
| `optimizeWaypointOrder` with `TRAFFIC_AWARE_OPTIMAL` | **Incompatible** | High |
| `optimizeWaypointOrder` with `via: true` waypoints | **Incompatible** | High |
| Field mask | **Mandatory**; determines the billing SKU | High |
| Essentials SKU | ≤ 10 intermediates, basic features only | Medium |
| Pro SKU | `optimizeWaypointOrder`, 11–25 intermediates, or traffic-aware | Medium |
| Order output | `optimizedIntermediateWaypointIndex` | High |

**Phase 1 request shape (ordering):**

```jsonc
{
  "origin": { "placeId": "…" },
  "destination": { "placeId": "…" },
  "intermediates": [{ "placeId": "…" }],
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE",        // NOT _OPTIMAL — incompatible
  "optimizeWaypointOrder": true
}
// Field mask: routes.optimizedIntermediateWaypointIndex
```

**Phase 2 request shape (accuracy):** same waypoints in the phase-1 order,
`routingPreference: "TRAFFIC_AWARE_OPTIMAL"`, `optimizeWaypointOrder` absent.
Field mask: `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs`.

**Live traffic is already bought, and no third call buys more of it.** Phase 2 runs at
`TRAFFIC_AWARE_OPTIMAL` and `departureTime` is optional and defaults to now (see the request
shape above), so the durations the user sees are for departing now, in current conditions.
Phase 1 stays at `TRAFFIC_AWARE` because the combination above is incompatible — that is not a
cost choice and cannot be changed by widening anything.

**The per-leg numbers are in the mask already.** `routes.legs` carries a distance, a duration
and a polyline for every hop, and the canvas shows them when a leg is tapped
([ADR-0027](adr/0027-the-drive-happens-elsewhere.md)). No request, no field, no SKU change.

**What a third call would buy, and why there isn't one.** A true time-saved figure needs the
duration of the user's *entry* order, computed the same way as phase 2 or the two numbers are
not comparable. That is a third `computeRoutes` request — about +50% on the cost of an
optimization ([`31_COST_MODEL.md`](31_COST_MODEL.md)) — and the product owner declined it.
`baseline_duration_s` stays reserved in the schema so the decision is reversible without a
migration.

### Route Optimization API — `optimizeTours`

| Constraint | Value | Confidence |
|---|---|---|
| Authentication | **OAuth2 service account** — not an API key | High |
| Billing unit | **Per shipment (stop)** | High |
| Modes | Synchronous `optimizeTours`; asynchronous `batchOptimizeTours` | High |
| Async threshold (ours) | > 40 stops, or estimated latency > 8 s | Our decision |
| Not billed | Validation failures, `VALIDATE_ONLY` mode, infeasible or ignored shipments | Medium |

### Places API (New)

| Constraint | Value | Confidence |
|---|---|---|
| Session token | Required for session pricing | High |
| Autocomplete requests billed per session | First 12; beyond that, no charge within the session | Medium |
| `place_id` storage | **Indefinite** — exempt from caching restrictions | High |
| Coordinate caching | **30 consecutive days maximum** | High |

### Free tier — all APIs

Approximately 10,000 free calls per month per Essentials SKU, 5,000 per Pro, 1,000 per
Enterprise, since March 2025. Confidence: medium. Cost implications in
[`31_COST_MODEL.md`](31_COST_MODEL.md).

---

## 9. Timeout and retry summary

| Endpoint | Client timeout | Upstream timeout | Retry | Backoff |
|---|---|---|---|---|
| `/optimize` sync | 15 s | 10 s per phase | 2 × on 5xx | 500 ms, ×2 |
| `/optimize` async | 5 s to accept | n/a | none | — |
| `/places-autocomplete` | 4 s | 3 s | **none** | — |
| `/place-details` | 5 s | 4 s | 1 × on 5xx | 500 ms |
| `/geocode` | 10 s | 8 s | 2 × on 5xx | 500 ms, ×2 |
| `/parse-addresses` | 15 s | 12 s | 1 × on 5xx | 500 ms |
| `/usage-quota` | 3 s | n/a | 1 × | 300 ms |
| `/revenuecat-webhook` | n/a | n/a | RevenueCat retries | — |

**4xx is never retried.** In this architecture the client does not construct upstream requests,
so a malformed one is always our defect. Retrying burns quota and hides the bug.

## 10. Rate limits and quotas

| Limit | Window | Value | Purpose |
|---|---|---|---|
| Optimizations | 1 hour | 20 | Catches retry loops and runaway clients |
| Optimizations | calendar month | 300 | Bounds monthly cost — ~13× the target profile |
| Autocomplete requests | 1 minute | 60 | Catches a stuck input |
| Autocomplete sessions | calendar month | 1,200 | ~7× the target profile |
| Autocomplete requests | per session | 12 | Matches Places session billing |
| Geocoding | calendar month | 1,500 | Daily import of 25 stops with headroom |
| Address parsing | calendar month | 100 | Bounds the model bill; a parse is ~$0.003 |

The table above is the **Pro** allowance. Free and day-pass allowances are lower and are listed
in [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md); all of them are read by the client from
`/usage-quota` rather than compiled into it ([ADR-0015](adr/0015-ad-supported-free-tier.md)).

Values are **server configuration**, adjustable without an app release
([ADR-0011](adr/0011-server-side-quota-enforcement.md)). Derivation in
[`31_COST_MODEL.md`](31_COST_MODEL.md).

## 11. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0006](adr/0006-mandatory-backend-proxy.md) | Every web-service call is proxied | The split between internal and external contracts |
| [0011](adr/0011-server-side-quota-enforcement.md) | Server-side quota | The 402 and 429 contracts |
| [0003](adr/0003-tiered-optimization-cascade.md) | Cascade T0–T3 | Why the optimization contract never names a tier |
| [0012](adr/0012-long-term-osm-exit-path.md) | OSM exit path | Why internal contracts are expressed in the product's vocabulary |

**Decided here:** the internal contract is ours and stable; the external contract is Google's
and may change without notice. Keeping them separate is what makes
[ADR-0012](adr/0012-long-term-osm-exit-path.md) a migration rather than a rewrite.

## 12. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Repeated `idempotencyKey` within 60 s | Original result returned; no billable call |
| 2 | `/optimize` with 1 stop | 400 `INVALID_REQUEST` — the UI should not permit it |
| 3 | `/optimize` with 26 stops | Escalates to T2 automatically; not an error |
| 4 | All stops unreachable | 200 with `PARTIAL_RESULT` and a fully populated `unreachable` |
| 5 | Autocomplete input under 3 characters | 400; enforced server-side as well |
| 6 | Geocode batch over 25 | 400; the client splits |
| 7 | Webhook replayed | Idempotent by event id; no double write |
| 8 | Webhook out of order | Stale event ignored by timestamp |
| 9 | Async job never completes | Sweeper marks it failed; the client is notified via Realtime |
| 10 | Client retries after a 504 | Idempotency key prevents a second billable call |

## 13. Error handling

| Failure | Response | `degradationHint` |
|---|---|---|
| Upstream 5xx after retries | 503 `UPSTREAM_UNAVAILABLE` | `T0_AVAILABLE` if ≤8 stops, else `RETRY_LATER` |
| Upstream timeout | 504 `UPSTREAM_TIMEOUT` | `T0_AVAILABLE` or `CACHED_RESULT_AVAILABLE` |
| Upstream 4xx | 500 `INTERNAL` to the client; full detail to Sentry; **alert** | `NONE` |
| Quota exhausted | 429 `QUOTA_EXHAUSTED` with `resetsAt` | `T0_AVAILABLE` |
| No entitlement | 402 `NO_ENTITLEMENT` | `NONE` |
| Some stops unreachable | 200 `PARTIAL_RESULT` | — |

## 14. Best practices

1. **Branch on `code`, never on `message`.** Messages are localised and may change.
2. **Always send an idempotency key** on `/optimize`. A retry without one is a double charge.
3. **Never retry 4xx.**
4. **Always send a session token** on autocomplete. Its absence is a 400 by design.
5. **Keep field masks minimal** and review them on every Routes change — they select the SKU.
6. **Act on `degradationHint`** rather than inferring how to degrade.
7. **Re-verify §8 at every phase gate.** These are Google's numbers, not ours.

## 15. Checklist

- [ ] Every endpoint has a contract test asserting the shapes here.
- [ ] Error codes exhaustively enumerated in a client-side type.
- [ ] Idempotency verified for `/optimize` and the webhook.
- [ ] Session token enforcement verified by a negative test.
- [ ] Field masks verified minimal for both T1 phases.
- [ ] Timeout and retry values match §9 in code.
- [ ] Rate limits and quotas loaded from configuration, not compiled in.
- [ ] §8 re-verified against primary Google documentation, with dates recorded.
- [ ] No limit in this document contradicts any other document.

## 16. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All contracts above | — |
| 1.x | `POST /routes/import` for large list staging | Import volume |
| 2.0 | `/optimize` extended with time windows and priorities | Gate D3 |
| 3.0 | `RoutingProvider` contract abstracted so a Valhalla adapter satisfies it unchanged | [ADR-0012](adr/0012-long-term-osm-exit-path.md) |

## 17. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Contracts defined; all limits centralised here | Prevents contradictory numbers across 41 documents | Architecture |
| 2026-08-06 | Idempotency key made mandatory on `/optimize` | A retry after timeout would otherwise double-charge | Architecture |
| 2026-08-06 | Autocomplete retry set to none | The user is typing; a retry lands after the input changed | Architecture |
| 2026-08-06 | `degradationHint` added to error responses | The client cannot otherwise know whether T0 is appropriate | Architecture |
| 2026-08-06 | §8 marked unverified pending primary-source access | Honesty about sourcing; these values drive pricing | Architecture |

## 18. Rationale

Centralising every limit in one document is the main decision here. With 41 documents, a
timeout mentioned in three places will diverge within weeks, and the divergence surfaces as a
production incident nobody can trace. The single-source rule makes contradiction a defect the
consolidation audit can detect mechanically.

The error taxonomy is designed so the client can behave correctly without understanding the
backend. `degradationHint` is the clearest example: rather than the client inferring from a 503
whether to offer T0 — which requires it to know the stop-count rule, duplicating server
logic — the server states what degradation is available. The rule lives in one place.

Mandatory idempotency on `/optimize` reflects the cost model. A 15-second timeout on a mobile
network is common, and a user tapping retry would otherwise generate a second billable
optimization for the same route. At tier T2 with 60 stops that is $0.60 for one user action.

Section 7 is marked unverified deliberately. These figures were gathered from secondary sources
because the primary documentation was unreachable, and they drive both the architecture and the
subscription price. Presenting them as confirmed would be the kind of quiet inaccuracy that
becomes a costly surprise.

## 19. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Limits documented in each area document | Locality; read in context | Guarantees divergence across 41 files, and the divergence is invisible until it causes an incident |
| HTTP status codes only, no error codes | Simpler; fewer concepts | Statuses are too coarse: 402 for expired trial and 429 for quota versus rate limit need distinct client behaviour |
| GraphQL instead of REST endpoints | Flexible; one endpoint; no over-fetching | Every call here is metered and cached server-side; client-chosen field selection would defeat the cache key and complicate quota attribution |
| Client-side retry only | Simpler server; the client knows its own context | The client cannot distinguish a retryable 5xx from a quota 429 without the taxonomy, and would retry things that can never succeed |
| Optimistic contracts, shapes documented in code | Always current; no drift | Code documents what is, not what was agreed. Contract tests need an external reference to assert against |
