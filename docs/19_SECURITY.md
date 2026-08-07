# 19 — Security

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0006](adr/0006-mandatory-backend-proxy.md) · [`12_DATABASE.md`](12_DATABASE.md) · [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)

---

## 1. Purpose

This document specifies the threat model, credential handling, authorisation model, key rotation
and incident response.

The product's most valuable asset is not its code — it is a **billing account with no spending
ceiling attached to a Google service account**. A leaked credential here is a financial incident,
not merely a data one.

## 2. Goals

1. Keep every credential except the Maps render key off the device.
2. Enforce authorisation at the database, not in application code.
3. Ensure no personal data reaches logs, analytics or crash reports.
4. Make rotation routine rather than an emergency procedure.

**Non-goals.** No formal certification. No penetration test programme at MVP scale.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Credential custody | Supabase secrets | Never in the repository |
| Authorisation | Postgres RLS | Not application logic |
| Rotation | Architecture | Scheduled, documented, rehearsed |
| Incident response | Product owner | §10 |

---

## 4. Text diagrams

The credential topology is drawn in §6, beside the rotation table it constrains. The
authorisation layering is in §7.

```
  THREAT ORDERING — by cost, not by likelihood

  T1  service-account leak  ──▶ unbounded billing   ◀── the defining threat
  T2  web-service key leak  ──▶ metered abuse
  T3  client bypasses quota ──▶ cost overrun
  T5  cross-user data access──▶ GDPR breach
  T6  personal data in logs ──▶ GDPR breach
```

## 5. Threat model

Ordered by expected cost, not by likelihood.

| # | Threat | Impact | Mitigation |
|---|---|---|---|
| T1 | **Service-account credential leaked** | **Unbounded Google billing** | Supabase secrets only; never in repo, `app.config` or a runtime-read build secret; secret scanning; rotation |
| T2 | Web-service API key extracted from the binary | Metered API abuse billed to us | No web-service key ships. Only the Maps SDK key, restricted by bundle ID and SHA-1 |
| T3 | Client bypasses quota | Cost overrun | Quota enforced server-side only ([ADR-0011](adr/0011-server-side-quota-enforcement.md)) |
| T4 | Forged entitlement | Free access | Entitlement written only by a signature-verified webhook |
| T5 | Cross-user data access | GDPR breach | RLS on every table; ownership never checked in application code |
| T6 | Personal data in logs or analytics | GDPR breach | No addresses, coordinates or user-linked `place_id` in any telemetry |
| T7 | Session token theft | Account access | Short-lived JWTs, refresh rotation, secure device storage |
| T8 | Shared cache poisoning | Wrong routes for other users | Cache written only by the service role; keys are content hashes |
| T9 | Deep-link injection | Unexpected navigation | Deep links validated and scoped; ownership re-checked server-side |
| T10 | Supply chain compromise | Arbitrary code | Lockfiles committed, dependency review, minimal dependency surface |

**T1 is the defining threat.** A Google service account with billing attached and no hard ceiling
can generate very large charges quickly, and the damage is done before a monthly bill reveals it.

---

## 6. Credentials

```
  ON DEVICE                        NEVER ON DEVICE
  ─────────                        ───────────────
  Maps SDK render key              Routes API key
    restricted: bundle ID +        Places API key
    SHA-1 certificate              Geocoding key
    scoped: Maps SDK only          Route Optimization service account
                                   Supabase service role key
                                   RevenueCat webhook secret

  Supabase anon key ships too, but it is public by design —
  RLS is what protects the data, not the key.
```

| Credential | Home | Rotation |
|---|---|---|
| Maps SDK render key | App binary, platform-restricted | On suspected compromise; requires a release |
| Web-service API key | Supabase secrets | Quarterly, and on suspicion |
| Route Optimization service account | Supabase secrets | **Quarterly, and immediately on any suspicion** |
| Supabase service role key | Supabase secrets | On suspicion |
| RevenueCat webhook secret | Supabase secrets | On suspicion |

**Rotation is rehearsed, not improvised.** Each credential has a documented procedure and is
rotated once before launch to prove the procedure works — discovering that rotation breaks
production during an incident is the worst possible time.

**Secret scanning runs on every push.** A committed credential is treated as compromised
regardless of whether the commit was pushed to a remote.

---

## 7. Authorisation

**RLS is the authorisation mechanism.** Ownership is never checked in application code, because
application checks can be forgotten and RLS cannot.

| Layer | Enforces |
|---|---|
| Supabase JWT | Authentication — who the caller is |
| RLS policies | Authorisation — what rows they may touch |
| Edge Function pipeline | Entitlement, rate limit, quota |
| Service role | Only inside Edge Functions, never exposed |

A new table without a policy is unreachable by default. This is the correct failure mode: a
forgotten policy causes a visible outage rather than a silent leak.

The service role key bypasses RLS entirely and therefore exists only inside Edge Functions,
never in the client and never in a client-reachable configuration.

---

## 8. Data handling

### Never logged, anywhere

- Street addresses.
- Coordinates.
- `place_id` associated with a user.
- Authentication tokens, API keys, service-account content.
- Any of the above inside a serialised error object — the most common leak path, because errors
  are logged reflexively.

Logs, analytics and crash reports carry only user id, endpoint, tier, cache-hit, duration and
outcome ([`13_BACKEND.md`](13_BACKEND.md), [`21_ANALYTICS.md`](21_ANALYTICS.md)).

**Stop addresses are personal data about third parties** — the user's customers, who never
consented to anything. That makes the standard stricter than for the user's own data
([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)).

### At rest and in transit

TLS everywhere; certificate pinning is deliberately **not** used, because it breaks silently on
certificate rotation and the threat it addresses is not in this model. Supabase encrypts at rest.
Device storage uses the platform keychain for tokens and encrypted storage for cached data.

### Retention

| Data | Retention |
|---|---|
| Coordinates | **30 days maximum** — a terms obligation, enforced by the purge job ([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)) |
| Routes, stops, labels | Until the user deletes them |
| `usage_events` | 13 months, for cost analysis |
| Logs | 30 days |
| Deleted account | Purged within 30 days, cascading |

---

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Credential committed to the repository | Treated as compromised; rotated immediately regardless of push status |
| 2 | Anomalous Route Optimization usage | Alert; investigate; rotate if unexplained |
| 3 | Webhook with an invalid signature | 401; logged as a security event; **no write** |
| 4 | JWT expired mid-request | 401; client refreshes silently; only a hard failure returns to sign-in |
| 5 | RLS blocks a legitimate read | Treated as a policy defect, never worked around with the service role |
| 6 | New table added without a policy | Unreachable — correct failure mode |
| 7 | Personal data found in a log | Incident: purge, fix the source, review the class |
| 8 | Device compromised | Server-side session revocation available |
| 9 | Cache key collision | Content hash makes it practically impossible; stored inputs allow verification |
| 10 | Dependency with a known vulnerability | Automated alert; assessed against actual usage before upgrading blindly |

## 10. Incident response

| Step | Action |
|---|---|
| 1 — Contain | Rotate the affected credential immediately. Availability is secondary to containment |
| 2 — Assess | Determine what was exposed, for how long, and to whom |
| 3 — Bound the cost | For T1, cap Google spending and audit usage |
| 4 — Notify | GDPR breach notification within 72 hours where applicable ([`32`](32_LEGAL_COMPLIANCE.md)) |
| 5 — Remediate | Fix the cause, not only the symptom |
| 6 — Record | Post-incident note: what fired, what the trigger missed, what changes |

**Rotation comes before investigation.** A credential still valid while its exposure is being
assessed is a credential still being used.

## 11. Error handling

| Failure | Detection | Response |
|---|---|---|
| Secret scanning alert | CI | Rotate, then investigate |
| Webhook signature failure | Handler | 401, security log, no write |
| Unexpected service-role usage | Audit log | Investigate; possible compromise |
| RLS denial spike | Metrics | Policy defect or probing; investigate both |
| Purge job failure | Missing success record | **Page** — an ongoing terms violation |
| Personal data in logs | Review or automated scan | Incident procedure |

## 12. Best practices

1. **One credential ships. Everything else lives server-side.**
2. **RLS is the authorisation layer.** Never check ownership in application code.
3. **Never use the service role outside an Edge Function.**
4. **Verify every webhook signature.**
5. **Never log an error object without checking what it serialises.**
6. **Rehearse rotation before you need it.**
7. **Treat cost anomalies as security events.** Unexplained spend is a leak until proven
   otherwise.
8. **Fail closed.** A guard that errors treats the caller as unauthorised.

## 13. Checklist

- [ ] Only the Maps SDK key present in the client bundle, verified by inspecting a build.
- [ ] Maps key restricted to bundle ID and SHA-1, scoped to Maps SDK APIs.
- [ ] No secret in the repository; secret scanning active on every push.
- [ ] Service-account credential only in Supabase secrets.
- [ ] RLS enabled and policied on every table.
- [ ] Service role unreachable from the client.
- [ ] Webhook signature verification tested with an invalid signature.
- [ ] No personal data in logs — verified by inspecting real output.
- [ ] Purge job monitored with alerting.
- [ ] Every credential rotated once before launch to prove the procedure.
- [ ] Account deletion verified to cascade completely.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All of the above | — |
| 1.x | Automated anomaly detection on Google spend | First cost surprise |
| 1.x | Automated personal-data scanning of log output | Post-launch |
| 2.0 | Formal review or penetration test | Revenue justifying it |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | All web-service calls proxied; one credential on device | The service account cannot ship, and keys are extractable | Architecture |
| 2026-08-06 | RLS as the sole authorisation mechanism | Application checks can be forgotten; policies cannot | Architecture |
| 2026-08-06 | Certificate pinning rejected | Breaks silently on rotation; the threat is not in this model | Architecture |
| 2026-08-06 | Rotation rehearsed before launch | Discovering rotation breaks production during an incident is the worst case | Architecture |
| 2026-08-06 | Cost anomalies classified as security events | Unexplained spend is the primary symptom of T1 | Architecture |

## 16. Rationale

The threat model is ordered by cost rather than likelihood, which is unusual and deliberate. A
leaked service account is not the most probable event, but it is the only one that can generate
an unbounded bill within hours and be unrecoverable by the time it is noticed. Everything about
credential handling in this document exists to make T1 structurally difficult rather than merely
discouraged.

Choosing RLS over application-level authorisation is the second load-bearing decision. An
application check must be remembered at every call site; a policy is remembered by the database.
More importantly, the failure modes differ in the right direction: a forgotten application check
leaks data silently, while a forgotten policy makes the table unreachable and surfaces
immediately.

The no-personal-data-in-logs rule is stricter than a typical product's because the data is not
the user's own. Stop addresses belong to the user's customers, who have no relationship with us
and gave no consent. That asymmetry justifies treating the logging boundary as absolute rather
than pragmatic.

Rejecting certificate pinning is worth recording because it is a common default. Pinning defends
against an attacker with a trusted CA — not a threat in this model — while introducing a failure
mode where an expired pin bricks the app for every user until a release ships.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| API keys in the client, platform-restricted | No backend; simpler; lower latency | Platform restriction does not apply to web-service APIs, and the service account cannot ship at all |
| Application-level ownership checks | Familiar; visible in code; easier to debug | Must be remembered everywhere; a forgotten check leaks silently, whereas a missing policy fails loudly |
| Certificate pinning | Defends against MITM with a trusted CA | Breaks on rotation, bricking the app until a release. The threat is out of model |
| Logging full request context for debuggability | Much easier incident investigation | Guarantees personal data in logs. Structured fields provide enough without addresses |
| Hard Google billing cap | Guarantees the bill never exceeds a number | Fails globally: one abusive account takes the service down for everyone. Per-user quotas are the right layer |
| Annual credential rotation | Less operational overhead | Too slow for a credential whose compromise is measured in hours of billing |
