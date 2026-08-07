# NN — Document Title

> **Status:** Draft | Approved | Superseded
> **Owner:** Role responsible for keeping this document true
> **Last reviewed:** YYYY-MM-DD
> **Related:** [`docs/NN_OTHER.md`](NN_OTHER.md) · [ADR-000X](adr/000X-slug.md)

---

## 1. Purpose

One paragraph. What question does this document answer, and for whom? A reader who
opens only this file must understand its scope without reading anything else.

State explicitly what this document does **not** cover, and name the document that does.

## 2. Goals

Numbered, testable goals. Each goal is something a reviewer can confirm or deny.

1. …
2. …

**Non-goals** — things deliberately excluded, each with the reason.

## 3. Responsibilities

Who or what owns each concern described here. Use a table when more than two actors
are involved.

| Concern | Owner | Notes |
|---|---|---|

## 4. Text diagrams

ASCII or Mermaid only. No binary images anywhere in this repository.

```
Component A ──▶ Component B ──▶ Component C
```

Every arrow must be labelled with what flows along it.

## 5. Flows

Step-by-step sequences for the primary paths. Number every step. For each flow state
the trigger, the preconditions, the steps, and the terminal states (success and failure).

## 6. Architectural decisions

Decisions that this document makes or applies. Reference ADRs by ID rather than
restating them — see [`docs/adr/`](adr/). If a decision is made here for the first
time, create the ADR and link it.

| ID | Decision | Applies to |
|---|---|---|

## 7. Edge cases

Enumerated, not prose. Each row: the condition, the expected behaviour, and where that
behaviour is implemented or specified.

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|

## 8. Error handling

For every failure mode: how it is detected, what the user sees, what is logged, whether
it retries, and what the fallback is. Silent failure is never an acceptable answer.

| Failure | Detection | User-facing result | Retry | Fallback |
|---|---|---|---|---|

## 9. Best practices

Rules a developer should follow when working in this area. Each rule states the reason —
a rule without a reason gets ignored the first time it is inconvenient.

## 10. Checklist

Actionable boxes, verifiable by a reviewer without asking the author.

- [ ] …

## 11. Roadmap

What is in the MVP, what is deferred, and what would trigger building the deferred item.

| Phase | Scope | Trigger |
|---|---|---|

## 12. Decision log

Chronological record of changes to this document's decisions. Append only; never rewrite
history.

| Date | Change | Reason | Author |
|---|---|---|---|

## 13. Rationale

Why the chosen approach is right for this product specifically — not generic best
practice. Tie back to product constraints: single professional user, ≤25 stops, trial-to-paid
subscription, mobile only, Google-based stack.

## 14. Rejected alternatives

Options genuinely considered and dropped. Each entry states what it was, why it was
attractive, and the specific reason it lost. An empty section means the analysis was not
done — not that no alternatives existed.

| Alternative | Attraction | Why rejected |
|---|---|---|

---

## Authoring rules for this template

1. **All 14 sections are mandatory.** If a section does not apply, write one line
   explaining why rather than deleting the heading — the consolidation audit greps for
   headings.
2. **Single source of truth.** API limits, prices and quotas live in
   [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) and [`31_COST_MODEL.md`](31_COST_MODEL.md).
   The data model lives in [`12_DATABASE.md`](12_DATABASE.md). Design tokens live in
   [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md). Cite them; never restate a number.
3. **No application code.** Contract-defining snippets are allowed — SQL schema, JSON
   request/response shapes, TypeScript interface signatures, design tokens. Implementations
   are not.
4. **English only**, in the technical register used by the Google Maps Platform and Expo
   documentation.
5. **Every claim about an external API carries a source and a date.** Google changes
   pricing and terms unilaterally; an unsourced number is a future outage.
