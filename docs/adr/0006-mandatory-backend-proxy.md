# ADR-0006 — All web-service API calls go through a backend proxy

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Architecture
**Implements decisions:** C5 (see [`35_RISK_REGISTER.md`](../35_RISK_REGISTER.md))

---

## Context

The application consumes four Google services with different authentication models:

| Service | Authentication | Can it live in the client? |
|---|---|---|
| Maps SDK (rendering) | API key, restricted by bundle ID / SHA-1 | **Yes** — the key is necessarily in the binary and is protected by platform restriction |
| Routes API | API key, unrestricted by platform | No |
| Places API (New) | API key, unrestricted by platform | No |
| **Route Optimization API** | **OAuth2 service account** — a GCP service, not a Maps Platform key | **Impossible** |

The Route Optimization API settles the question on its own: it authenticates with a service
account JSON credential and OAuth2, which cannot be shipped in a mobile binary under any
circumstances. A backend is therefore not an architectural preference — it is a precondition
for tier T2 in [ADR-0003](0003-tiered-optimization-cascade.md) existing at all.

Two further forces point the same way. First, quotas: with a trial-to-paid model
([ADR-0002](0002-target-segment-and-monetization.md)) and real per-call COGS, usage limits
must be enforced somewhere the user cannot reach. A limit implemented in the client is a
suggestion. Second, cost: the target segment revisits the same customers repeatedly, so a
cache shared across users has a high hit rate — and a shared cache requires a shared server.

## Decision

**Exactly one Google credential ships in the client**: the Maps SDK rendering key, restricted
by iOS bundle ID and Android package name plus signing certificate SHA-1, and scoped to the
Maps SDK APIs only.

**Every other Google call is proxied through Supabase Edge Functions.** No web-service API key
and no service-account credential exists in the client bundle, in EAS build secrets consumed
at runtime, or in `app.config`.

```
Client (Expo)                    Supabase Edge Functions              Google
─────────────                    ───────────────────────              ──────
Maps SDK render key  ─────────────────────────────────────────────▶  Maps SDK
(restricted to bundle ID / SHA-1;
 the only credential in the app)

authenticated user JWT ──────▶   /places-autocomplete  (server key) ─▶ Places API (New)
                       ──────▶   /geocode              (server key) ─▶ Geocoding
                       ──────▶   /routes-compute       (server key) ─▶ Routes API
                       ──────▶   /optimize             (SA OAuth2)  ─▶ Route Optimization
                       ──────▶   /usage-quota
                                 ◀───── /revenuecat-webhook ────── RevenueCat

                                 Every function enforces, in order:
                                 1. Supabase JWT verification
                                 2. Entitlement check (trial or active)
                                 3. Per-user rate limit
                                 4. Quota decrement
                                 5. Shared cache lookup
                                 6. Upstream call
                                 7. Cache write + usage record
```

**Every Edge Function applies the same seven-step pipeline**, in that order. Cache lookup
comes after quota so that a cache hit still counts against abuse limits while costing nothing
upstream; the usage record distinguishes cached from billable calls for
[`31_COST_MODEL.md`](../31_COST_MODEL.md) reconciliation.

**The shared cache is keyed by content, not by user.** For routes and optimizations the key
is a hash of the ordered `place_id` set plus the departure time bucket. Two users optimizing
the same stop set in the same time window share one upstream call.

**Service-account credentials live in Supabase secrets**, are never committed, and have a
documented rotation procedure in [`19_SECURITY.md`](../19_SECURITY.md).

## Consequences

**Positive.** Tier T2 becomes possible. Without this decision the cascade would top out at 25
stops permanently.

**Positive.** Quotas become enforceable. Trial abuse — hundreds of optimizations in seven days
followed by cancellation — is bounded by a server the user cannot modify.

**Positive.** The shared cache is the single largest lever against the Places cost that
dominates COGS. Recurring routes, which are the norm for the target segment, become nearly
free.

**Positive.** Google credentials can be rotated without shipping an app update. A leaked
server key is an incident; a leaked client key is a release.

**Negative.** Every Google call gains a network hop and the Edge Function's cold-start
latency. Places Autocomplete is the sensitive case, since it runs on every keystroke.
Mitigated by client-side debounce of at least 300 ms, a three-character minimum before the
first request, and a local recents cache consulted first. Latency budgets are in
[`24_PERFORMANCE.md`](../24_PERFORMANCE.md).

**Negative.** The backend becomes a single point of failure for address search and
optimization. Mitigated by T0 degradation ([ADR-0003](0003-tiered-optimization-cascade.md))
and by the offline behaviour in [`17_OFFLINE_MODE.md`](../17_OFFLINE_MODE.md).

**Negative.** Supabase's free tier pauses a project after seven days of inactivity, which is
tolerable in development and unacceptable in beta. The Pro plan is the first fixed cost that
becomes mandatory, recorded in [`31_COST_MODEL.md`](../31_COST_MODEL.md).

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| All keys in the client, restricted by bundle ID | No backend, no latency hop, simplest possible build | Bundle-ID restriction does not exist for web-service APIs — only for SDKs. An extracted key would be usable by anyone, billed to us. And the Route Optimization API cannot work this way at all. |
| Proxy only the Route Optimization API | Minimum backend surface; solves the impossible case only | Leaves Routes and Places keys extractable from the binary, and leaves quotas unenforceable and caching per-device. Solves one of the four forces. |
| Cloud Functions or Cloud Run instead of Supabase Edge Functions | Same runtime as GCP; natural home for service-account auth | Adds a second platform, a second deployment pipeline and a second auth boundary alongside Supabase, which is already required for data and auth. Revisit only if Edge Function limits are hit. |
| Per-user cache instead of shared | Simpler invalidation; no cross-user data questions | Discards most of the saving. The target segment's routes repeat across users in the same city. Content-keyed entries hold no personal data — a hash of public `place_id` values — so the privacy objection does not apply. |

## References

- [`docs/13_BACKEND.md`](../13_BACKEND.md) — Edge Function specifications
- [`docs/19_SECURITY.md`](../19_SECURITY.md) — key management and rotation
- [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) — per-endpoint contracts
- [ADR-0011](0011-server-side-quota-enforcement.md) — quota model this enables
