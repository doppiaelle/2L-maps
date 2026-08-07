# 21 — Analytics and Observability

> **Status:** Approved
> **Owner:** Product owner + Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`28_ROADMAP.md`](28_ROADMAP.md) · [`19_SECURITY.md`](19_SECURITY.md) · [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)

---

## 1. Purpose

This document specifies what the product measures, how, and — equally important — what it
deliberately does not measure.

Analytics exists here for one reason: **the phase gates in
[`28_ROADMAP.md`](28_ROADMAP.md) cannot be assessed without it.** Every event below traces to a
decision someone will actually make. Events that measure nothing decidable are not collected.

## 2. Goals

1. Instrument every gate metric before the gate is reached.
2. Measure cost per user against [`31_COST_MODEL.md`](31_COST_MODEL.md).
3. Detect crashes and errors with enough context to fix them.
4. Collect **no personal data**, ever.

**Non-goals.** No user-level behavioural profiling. No advertising identifiers. No third-party
data sharing.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Event definitions | Product owner | Each traces to a decision |
| Privacy compliance | Architecture | No personal data — verified, not assumed |
| Crash triage | Architecture | Sentry + Crashlytics |
| Gate reporting | Product owner | At each phase gate |

---

## 4. Text diagrams

### The privacy boundary

```
  ┌──────────── NEVER COLLECTED ───────────────────────────────┐
  │  street addresses                                           │
  │  coordinates                                                │
  │  place_id linked to a user                                  │
  │  stop labels, notes — the user's own words                  │
  │  route names                                                │
  │  advertising identifiers                                    │
  └─────────────────────────────────────────────────────────────┘
                              vs
  ┌──────────── COLLECTED ─────────────────────────────────────┐
  │  event name and timestamp                                   │
  │  pseudonymous user id                                       │
  │  counts: stops in route, legs                               │
  │  durations: how long an optimization took                   │
  │  categories: tier used, provider chosen, error code         │
  │  outcomes: succeeded, failed, cached                        │
  └─────────────────────────────────────────────────────────────┘

  Rule: a stop count is a number. A stop is personal data about
  a third party who never consented to anything.
```

The addresses in this product are the user's **customers'** addresses. That makes the privacy
standard stricter than for the user's own data, and it is why the boundary is drawn absolutely
rather than pragmatically.

---

## 5. Tools

| Tool | Purpose | Data |
|---|---|---|
| **Firebase Analytics** | Product events, funnels, retention | Pseudonymous; no personal data |
| **Crashlytics** | Crash reporting | Stack traces; breadcrumbs scrubbed |
| **Sentry** | Application errors, Edge Function errors | Errors with scrubbed context |
| **`usage_events`** (our database) | Cost attribution per user | Endpoint, tier, cache hit, cost — no location |

Cost measurement lives in our own database rather than in analytics because it must be exact and
auditable, and because it must survive an analytics outage
([`12_DATABASE.md`](12_DATABASE.md)).

---

## 6. Events

### Activation — gate D1

| Event | Properties | Decides |
|---|---|---|
| `app_first_open` | — | Funnel entry |
| `sign_in_completed` | `method` | Auth friction |
| `paywall_shown` | `placement` | Conversion denominator |
| `trial_started` | `product` | **Conversion numerator** |
| `paywall_dismissed` | `placement` | Drop-off point |
| `trial_converted` | `product` | **Gate D1 threshold ≥ 15%** |
| `subscription_cancelled` | `days_in_trial` | Cancellation timing |

### Core loop — gates D1 and D2

| Event | Properties | Decides |
|---|---|---|
| `stop_added` | `source` (search, favourite, recent, import) | **Address-book reuse rate — gate D2 ≥ 50%, and the dominant cost line** |
| `route_optimized` | `stop_count`, `tier`, `duration_ms`, `cache_hit`, `degraded` | **Cache hit rate — gate D2 ≥ 25%**, tier distribution, latency |
| `optimization_failed` | `error_code`, `stop_count` | Reliability |
| `handoff_started` | `provider`, `chunk_size` | Provider preference |
| `stop_completed` | `method` (manual, geofence) | Progression friction |
| `route_completed` | `stop_count`, `minutes_saved` | **Value delivered** |
| `route_abandoned` | `stops_completed_ratio` | Where routes fail |

### Health

| Event | Properties | Decides |
|---|---|---|
| `quota_reached` | `limit_name` | **Alerts — should never fire in normal use** |
| `entitlement_blocked` | `screen` | Where expiry bites |
| `offline_entered` / `offline_exited` | `duration_s` | How real the offline case is |
| `degraded_result_shown` | `stop_count` | T0 frequency |
| `sync_conflict` | `resolution` | Conflict frequency |

### Explicitly not collected

| Not collected | Why |
|---|---|
| Screen views | Navigation is trivial; nothing would be decided |
| Session duration | Longer sessions are worse in this product, not better |
| Individual taps | Behavioural profiling with no decision attached |
| Search queries | **They are addresses** — personal data about third parties |
| Any coordinate | Personal data, and subject to the 30-day rule |

**Session duration deserves note.** In most products it is an engagement metric; here a user who
spends longer in the app is a user the app is failing. Time from open to handoff is measured
instead — and lower is better.

---

## 7. Gate instrumentation

Every threshold in [`28_ROADMAP.md`](28_ROADMAP.md), mapped to its source. **A gate whose metric
is not instrumented cannot be assessed, and is never passed by assumption.**

| Gate | Metric | Source |
|---|---|---|
| D1 | Trial-to-paid ≥ 15% | `trial_converted` / `trial_started` |
| D1 | COGS ≤ $1.50/user/month | `usage_events` |
| D1 | Crash-free ≥ 99.5% | Crashlytics |
| D1 | ≥ 3 routes/paying user/week | `route_optimized` |
| D2 | Week-4 retention ≥ 40% | Firebase cohorts |
| D2 | Open-to-handoff ≤ 45 s | `app_open` → `handoff_started` |
| D2 | Address-book reuse ≥ 50% | `stop_added.source` |
| D2 | Cache hit rate ≥ 25% | `route_optimized.cache_hit` |

---

## 8. Privacy implementation

**Scrubbing happens at the source**, not at the destination. An event containing an address is
never constructed, rather than constructed and filtered — a filter can be bypassed by a new code
path, whereas an absent field cannot leak.

- Sentry `beforeSend` strips any field matching address, coordinate or `place_id` patterns as a
  second line of defence.
- Crashlytics breadcrumbs are opt-in per call site, never automatic.
- Analytics collection is disabled entirely until consent where required
  ([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)).
- The user can opt out of analytics in Settings; **crash reporting continues**, since it carries
  no personal data and is what keeps the app working.

**Log output is inspected before each release.** Automated scrubbing catches patterns; a human
reading real output catches the field nobody thought to pattern-match.

---

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | User opts out | Analytics stops; crash reporting continues |
| 2 | Offline | Events queue locally and send on reconnection |
| 3 | Event queue grows large offline | Bounded; oldest non-critical events dropped first |
| 4 | Error object contains an address | Scrubbed by `beforeSend`; the construction site is fixed as a defect |
| 5 | Crash before analytics initialises | Crashlytics captures it independently |
| 6 | User deletes their account | Analytics identifier disassociated; historical aggregates retained |
| 7 | `quota_reached` fires | **Alert** — treated as a probable defect, not a user problem |
| 8 | Analytics SDK fails | Silent; never affects the app |

## 10. Error handling

| Failure | Result | Fallback |
|---|---|---|
| Analytics send fails | Queued; retried | Local queue |
| Sentry unavailable | Errors logged locally | Local log |
| `usage_events` write fails | **Logged as a defect** — cost attribution is lost | Reconcile from Google billing |
| Personal data detected in a payload | Incident: purge, fix the source, review the class | [`19_SECURITY.md`](19_SECURITY.md) |

## 11. Best practices

1. **Every event must decide something.** If no one would act on it, do not collect it.
2. **Never construct an event containing an address or coordinate.** Scrub at the source.
3. **Instrument before the gate**, not when the question is asked.
4. **Measure cost in our own database**, not in analytics.
5. **Alert on `quota_reached`** — in normal operation it should never fire.
6. **Read real log output before each release.**
7. **Lower is better for time-in-app.** Do not import engagement metrics from products with
   opposite goals.

## 12. Checklist

- [ ] Every gate metric in §7 instrumented and verified before it is needed.
- [ ] No event carries an address, coordinate, `place_id` or user text.
- [ ] Sentry scrubbing verified with a deliberately polluted error.
- [ ] Crashlytics breadcrumbs verified free of personal data.
- [ ] Opt-out present in Settings and functional.
- [ ] Consent handling verified per [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md).
- [ ] `usage_events` reconciles against Google billing.
- [ ] `quota_reached` alerting active.
- [ ] Real log output inspected by a human.
- [ ] Privacy manifest and Data Safety declarations match what is actually collected.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All events above; gate instrumentation | — |
| 1.x | Cohort analysis for retention; funnel breakdown by persona | Gate D1 data |
| 1.x | Automated log scanning for personal data | Post-launch |
| 2.0 | Experiment framework for the paywall-placement test | Baseline established |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Analytics scoped to gate metrics only | An event nobody acts on is collection without purpose | Product owner |
| 2026-08-06 | Search queries never collected | They are addresses — third-party personal data | Architecture |
| 2026-08-06 | Session duration not collected | Longer sessions indicate failure in this product | Product owner |
| 2026-08-06 | Scrubbing at source rather than destination | A filter can be bypassed by a new code path; an absent field cannot | Architecture |
| 2026-08-06 | Crash reporting continues after analytics opt-out | It carries no personal data and keeps the app working | Product owner |

## 15. Rationale

The event list is short because it was derived backwards, from the decisions in
[`28_ROADMAP.md`](28_ROADMAP.md), rather than forwards from what is technically collectable. Every
event maps to a threshold someone will evaluate at a gate. This keeps the privacy surface small
as a direct consequence of keeping the analytics purposeful.

The privacy boundary is drawn harder than a typical product's because of whose data it is. A stop
is an address belonging to the user's customer — a person who has no relationship with us, gave
no consent, and does not know the app exists. Counting stops is fine; recording them is not, and
no analytics insight would justify crossing that line.

Not collecting session duration is worth stating explicitly because the instinct to collect it is
strong and the metric is actively misleading here. This product succeeds when the user closes it
quickly. Optimising for engagement would mean optimising for a slower app.

Scrubbing at source rather than at the destination is the implementation detail that makes the
privacy claim credible. A `beforeSend` filter protects against events that already exist; it
cannot protect against a new code path that constructs an event with a field the filter does not
know about. Never building the payload is the only defence that holds as the codebase grows.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Comprehensive event tracking | Answers future questions without re-instrumenting | Every extra event is privacy surface and maintenance for a question nobody has asked |
| Screen-view tracking | Standard; free with the SDK | Navigation is trivial here; nothing would be decided from it |
| Collecting search queries | Would show what users look for and improve suggestions | They are third-party addresses. Not a trade-off |
| Session duration and engagement metrics | Standard product analytics | Directionally wrong: this product succeeds when sessions are short |
| Analytics-based cost measurement | One system instead of two | Cost must be exact and auditable, and must survive an analytics outage |
| Disabling crash reporting on opt-out | Maximally respectful | Crash reports carry no personal data and are what keeps the app working for that same user |
