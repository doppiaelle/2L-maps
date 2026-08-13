# 32 — Legal and Compliance

> **Status:** Approved — legal review recommended before first submission
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md) · [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md) · [`19_SECURITY.md`](19_SECURITY.md)

---

> **Not legal advice.** This document records the obligations identified during design and how
> the product satisfies them. It is written to make a lawyer's review efficient, not to replace
> it. Independent review is recommended before first submission, particularly on §7.

---

## 1. Purpose

This document collects every external obligation the product must satisfy: Google Maps Platform
terms, GDPR, EU consumer law on auto-renewing subscriptions, and the store privacy declarations.

Several of these shaped the architecture rather than merely constraining it — the data model,
the offline scope and the map engine choice are all consequences of obligations recorded here.

## 2. Goals

1. Record every obligation with its source, so a future reader can verify rather than trust.
2. Trace each obligation to the mechanism that satisfies it.
3. Make the compliance-bearing surfaces — paywall, privacy policy, store declarations —
   reviewable as a set.
4. Define breach and data-subject-request procedures before they are needed.

**Non-goals.** Not legal advice. No jurisdictions beyond the EU and the two app stores.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Terms compliance | Architecture | Structural, not procedural |
| GDPR | Product owner (data controller) | Export and deletion are product features |
| Consumer law | Product owner | Paywall and terms wording |
| Store declarations | Product owner | Must match actual behaviour |

---

## 4. Text diagrams

### Obligations and their mechanisms

```
  OBLIGATION                        MECHANISM                        RISK
  ──────────                        ─────────                        ────
  coordinates ≤ 30 days      ──▶   nullable columns + purge job     C4
                                   (ADR-0007) — structural

  no tile caching            ──▶   offline scoped to own data       C4
                                   (ADR-0008)

  no Google content on a     ──▶   react-native-maps, Google on     C3
  non-Google map                   both platforms (ADR-0005)

  attribution visible        ──▶   MapAttribution, never covered    C14

  location = personal data   ──▶   EU region, no telemetry,         C8
                                   export + delete

  trial disclosure           ──▶   paywall required elements        C12
  (Guideline 3.1.2)

  EU auto-renewal            ──▶   pre-contractual info,            C16
  (Dir. 2011/83, Codice           withdrawal right
   del Consumo)
```

---

## 5. Flows

**How an obligation becomes a control.** Nothing here is satisfied by a policy document alone.

```
  obligation identified (terms · GDPR · consumer law · store policy)
            │
            ▼
  which control enforces it, in code or in schema?
            │
   ┌────────┴──────────────────────────┐
   ▼                                   ▼
  a structural control            only a procedure
  (nullable column, purge job,    (a rule someone must remember)
   RLS policy, signed webhook)          │
            │                           ▼
            ▼                    escalated — procedures fail silently
  verified by a test in 22 and
  re-checked before each submission
```

**Subject rights.** Export and deletion run the same path: identify every table holding the
subject's rows, act on all of them, confirm to the user. A deletion that leaves analytics or
cache rows behind has not been performed.

**Breach.** Contain, assess, then notify the supervisory authority within 72 hours where the
risk warrants ([`19_SECURITY.md`](19_SECURITY.md)).

**Terms changes.** A Google terms or pricing change updates this document and
[`31_COST_MODEL.md`](31_COST_MODEL.md) with the new value, its source and the date, before any
dependent code changes. This has happened before and will happen again (risk S1).

## 6. Google Maps Platform terms

| Obligation | Our compliance | Where |
|---|---|---|
| `place_id` may be stored indefinitely | It is the durable key for every location | [`12_DATABASE.md`](12_DATABASE.md) |
| **Coordinates cached ≤ 30 consecutive days** | Nullable columns, `coords_refreshed_at`, daily purge job with alerting on failure | [ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md) |
| No map tile caching or bulk pre-fetch | Offline means own data only | [ADR-0008](adr/0008-offline-scope.md) |
| **No Google content on a non-Google map** | **Knowingly not met** — the route preview is drawn by us and shows Google-derived coordinates and geometry. The decision, the recommendation against it and the exposure are in [ADR-0021](adr/0021-drawn-route-preview.md); carried as risk C3 | [ADR-0021](adr/0021-drawn-route-preview.md) |
| Attribution displayed | Always visible, never covered at any sheet detent; burned into exported snapshots | [`14_GOOGLE_MAPS_INTEGRATION.md`](14_GOOGLE_MAPS_INTEGRATION.md) |
| No Google trademarks implying affiliation | **Open — the name "2L Maps" requires a decision before submission (risk C9)** | [`35_RISK_REGISTER.md`](35_RISK_REGISTER.md) |
| Turn-by-turn requires the Navigation SDK | No in-app guidance; handoff only | [ADR-0004](adr/0004-external-navigation-handoff.md) |

**The compliance strategy is structural.** The purge job, the nullable columns and the single map
engine make violation difficult by construction rather than dependent on someone remembering a
clause. That distinction matters because these obligations are invisible in code review — a
coordinate stored indefinitely compiles perfectly.

---

## 7. GDPR

### Roles

The user is the **data controller** for their customers' addresses; we are a **processor** in
that respect, and a **controller** for account and usage data. This distinction is worth
recording because it is easy to get backwards: the addresses in this app are not ours to decide
about.

### Data inventory

| Data | Category | Basis | Retention |
|---|---|---|---|
| Email, auth identifier | Personal | Contract | Until deletion |
| Stop addresses, `place_id` | **Personal data about third parties** | Contract (processor) | Until user deletes |
| Coordinates | Personal | Contract | **30 days maximum** (terms, stricter than GDPR would require) |
| User labels and notes | Personal, user-authored | Contract | Until deletion |
| Route history | Personal | Contract | Until deletion |
| `usage_events` | Pseudonymous | Legitimate interest — cost control | 13 months |
| Analytics events | Pseudonymous | Consent where required | Per Firebase policy |
| Crash reports | Pseudonymous | Legitimate interest — service integrity | 90 days |

**Location data is explicitly personal data** under GDPR, and stop addresses are personal data
about people who never consented to anything and do not know the app exists. That asymmetry is
why the telemetry boundary in [`21_ANALYTICS.md`](21_ANALYTICS.md) is absolute rather than
pragmatic.

### Data-subject rights — implemented as features, not processes

| Right | Implementation |
|---|---|
| Access | **Export in Settings** — machine-readable, includes routes, stops, labels and history |
| Rectification | Editing is the product |
| **Erasure** | **Delete account in Settings** — cascading, completed within 30 days. Also an Apple requirement |
| Portability | The export is structured and machine-readable |
| Objection | Analytics opt-out in Settings |
| Restriction | Handled on request |

Export and deletion are **product features rather than support procedures**, because a manual
process does not scale, is not auditable, and would fail a supervisory enquiry.

### Residency and processors

Supabase in an **EU region**. Sub-processors: Supabase, Google Cloud Platform (Maps APIs),
the selected billing processor when checkout ships, Firebase, Sentry,
and the model provider used for address parsing ([ADR-0016](adr/0016-ai-assisted-stop-entry.md)).
Each requires a data processing agreement, and the list must be published in the privacy policy
and kept current.

### Advertising consent — not applicable

ADR-0029 rejects advertising. The app contains no ad SDK, advertising identifier, rewarded flow,
CMP or ATT prompt. Introducing any of them reopens risk C18 and requires a new ADR plus updated
privacy and store declarations before code is merged.

### AI-assisted entry — where we become a processor

Pasted text and photographed lists change our role. A photographed delivery manifest contains
names and addresses of people who are not our user and have consented to nothing (risk C19):

| | |
|---|---|
| **Controller** | The user — it is their list, gathered for their purpose |
| **Processor** | Us |
| **Sub-processor** | The model provider, which requires a DPA and zero retention where offered |

Obligations that follow: the image is **transient** — parsed and discarded, never stored, never
logged, never attached to a crash report; the screen states what leaves the device before it
leaves; and the parsed result obeys the coordinate rules like any other address
([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)). Dictation is transcribed
**on-device** and never leaves it, which is why it carries none of this. Paste and photograph
differ only in what the payload contains, and photograph is the one that waits for the DPA.

### Breach procedure

Notification to the supervisory authority within **72 hours** where the breach is likely to
result in a risk to rights and freedoms; affected individuals notified where the risk is high.
Containment precedes assessment ([`19_SECURITY.md`](19_SECURITY.md) §12).

---

## 8. EU consumer law — auto-renewal

Applies alongside, not instead of, Apple's and Google's rules. Risk C16.

| Obligation | Source | Our compliance |
|---|---|---|
| Clear pre-contractual information | Dir. 2011/83/EU, Codice del Consumo | Paywall states duration, price, renewal period and cancellation before purchase |
| Explicit acknowledgement that it is a paid contract | Same | The subscribe control states the price; €0-today is prominent but never presented as free |
| Right of withdrawal | Same | Refunds are handled by the store; the withdrawal right is stated in the terms |
| Confirmation on a durable medium | Same | The store's receipt serves this |
| No pre-ticked boxes or dark patterns | Same | No preselected upsell; dismissal is clearly available |
| Italian wording authoritative for Italian users | Codice del Consumo | Both languages reviewed together as one change |

**The paywall, the terms of service and the privacy policy must agree.** A change to one requires
reviewing all three — divergence between the paywall's promise and the terms' wording is exactly
what a consumer complaint would rest on.

---

## 9. Store declarations

**These must match actual behaviour.** A declaration that overstates collection is a false
statement; one that understates it is a violation.

### Apple — privacy manifest and nutrition label

| Category | Collected | Linked to identity | Used for tracking |
|---|---|---|---|
| Contact info (email) | Yes | Yes | No |
| Location | **Yes** — coarse and precise, on-device use | Yes, for routes | **No** |
| User content (labels, notes) | Yes | Yes | No |
| Identifiers | Yes (account id) | Yes | No |
| Usage data | Yes (pseudonymous) | No | No |
| Diagnostics | Yes | No | No |

`PrivacyInfo.xcprivacy` declares required-reason API usage. **No tracking, no advertising
identifier**, so no App Tracking Transparency prompt is required — which is also why the app
should never add one casually, since it would contradict this declaration.

### Google Play — Data Safety

The same inventory, in Play's format. Encryption in transit declared. Deletion request mechanism
declared and functional — Play verifies the deletion path exists.

---

## 10. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates expire at 30 days | The central Google terms obligation, enforced structurally |
| [0008](adr/0008-offline-scope.md) | No offline maps, no tile caching | Terms compliance for map data |
| [0004](adr/0004-external-navigation-handoff.md) | External handoff | Why no Google content is rendered on a third-party map |
| [0005](adr/0005-map-engine-and-route-preview.md) | Google map for Google-derived content | The "No Use With Non-Google Maps" clause |
| [0012](adr/0012-long-term-osm-exit-path.md) | OSM exit path | The response if terms become unworkable |

**Decided here:** compliance is enforced by structure wherever structure can carry it — a
nullable column and a scheduled purge, not a reminder to delete coordinates. A rule that depends
on someone remembering is a rule that is already broken on the day everyone is busy.

## 11. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | User requests export | Self-service in Settings; no support ticket |
| 2 | User deletes their account | Cascading deletion within 30 days; `places_cache` untouched as it holds no personal data |
| 3 | Purge job fails | **Ongoing terms violation.** Alerting pages; manual run |
| 4 | User's customer objects to their address being held | The user is the controller; we support their deletion of that stop |
| 5 | Supervisory authority enquiry | Data inventory, processors and retention are documented here |
| 6 | Google changes its terms | Reassess against [ADR-0012](adr/0012-long-term-osm-exit-path.md) triggers |
| 7 | Store declaration diverges from behaviour | **Release blocked** until they agree |
| 8 | Paywall copy changed in one language only | Release blocked; all languages reviewed together |
| 9 | A new sub-processor is added | DPA required and privacy policy updated before release |
| 10 | Analytics consent refused | Analytics disabled; crash reporting continues |

## 12. Error handling

| Failure | Detection | Response |
|---|---|---|
| Purge job failure | Missing success record within 48 h | Page; manual run; assess exposure |
| Coordinate found older than 30 days | Audit query | Purge; investigate why it was missed |
| Personal data in telemetry | Review or automated scan | Incident procedure ([`19`](19_SECURITY.md)) |
| Attribution obscured | Visual QA | Defect; blocks release |
| Store declaration mismatch | Pre-submission review | Blocks release |
| Deletion request unfulfilled | Monitoring | Escalate; a GDPR deadline is not negotiable |

## 13. Best practices

1. **Compliance structurally, not procedurally.** A nullable column beats a remembered rule.
2. **Monitor the purge job as a compliance control**, not as a background task.
3. **Never let a store declaration drift from behaviour.**
4. **Review paywall, terms and privacy policy together**, always.
5. **Export and deletion are features**, never manual processes.
6. **Record the source and date of every obligation** — terms change.
7. **Treat stop addresses as third-party personal data**, held to a stricter standard than the
   user's own.

## 14. Checklist

Before first submission and every release:

- [ ] Purge job running, monitored, alerting verified.
- [ ] No coordinate older than 30 days — verified by audit query.
- [ ] Attribution visible at every sheet detent and in exported snapshots.
- [ ] Attribution visible wherever Google-derived content appears, including on the drawn preview (ADR-0021). No tiles fetched or cached.
- [ ] Name and branding decision resolved (risk C9).
- [ ] Export and deletion functional and self-service.
- [ ] Supabase in an EU region.
- [ ] DPA in place with every sub-processor; list published and current.
- [ ] Paywall states duration, price, renewal and cancellation, both languages.
- [ ] Paywall, terms and privacy policy consistent with one another.
- [ ] Privacy manifest matches actual collection.
- [ ] Play Data Safety matches actual collection.
- [ ] No tracking; no advertising identifier; no ATT prompt.

## 15. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| Pre-launch | Legal review of terms, privacy policy and paywall; C9 resolved | Before first submission |
| MVP | All obligations above | — |
| 1.x | Automated audit query for coordinate age | Post-launch |
| 2.0 | Re-review on entering a new market | Market expansion |

## 16. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Terms compliance made structural | These violations are invisible in code review | Architecture |
| 2026-08-06 | Export and deletion specified as features | Manual processes do not scale and are not auditable | Product owner |
| 2026-08-06 | Stop addresses classified as third-party personal data | The user's customers never consented and do not know the app exists | Product owner |
| 2026-08-06 | C9 naming decision flagged as blocking submission | Trademark implication of "Maps" | Product owner |

## 17. Rationale

Compliance is designed structurally because these particular obligations are invisible at review
time. A coordinate cached for six months compiles, passes tests, and behaves correctly — the
violation is silent until an audit or a complaint. Making the correct behaviour the default
through nullable columns, a monitored purge job and a single map engine means the obligation is
satisfied by the shape of the system rather than by anyone remembering it.

The third-party data classification is the least obvious point here and the one that most affects
day-to-day decisions. The addresses in this app belong to the user's customers — people with no
relationship to us, who gave no consent, and who would be surprised to learn their address is in
a database. That is why telemetry never carries an address, why logs are inspected by a human
before release, and why the standard is absolute rather than proportionate.

The paywall's dual obligation — Guideline 3.1.2 and EU consumer law — is worth emphasising
because the two overlap without being identical. Apple cares about disclosure in the purchase
flow; EU law adds pre-contractual information, a withdrawal right and confirmation on a durable
medium. Satisfying Apple does not automatically satisfy Italy, and the reverse is also true.

## 18. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Store coordinates permanently | Simplest schema; instant route loads | Direct terms violation risking account termination |
| Offline maps via cached tiles | The feature users expect | Prohibited. Not a trade-off |
| Manual export and deletion on request | No engineering work | Does not scale, is not auditable, and would fail a supervisory enquiry |
| Non-EU hosting | Marginally cheaper; more region choice | Location data for EU users belongs in the EU; transfer mechanisms add complexity for no benefit |
| Broad consent banner covering everything | One prompt; simpler | Consent must be specific and informed; a blanket banner is neither, and most processing here rests on contract, not consent |
| Deferring the naming decision past launch | Faster to submit | A rejection or trademark complaint after launch is far more expensive than a rename before it |
