# ADR-0001 — Documentation language, structure and authority

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Product owner
**Implements decisions:** D1, D6

---

## Context

This repository begins as documentation, not code. The documentation set has two distinct
audiences with conflicting needs:

1. **The product owner**, who is Italian and reads Italian most comfortably.
2. **Claude Code and future engineers**, who will generate and review TypeScript, SQL,
   commit messages and API calls from these specifications.

The technical vocabulary of the domain is fixed by external sources and is entirely English:
`optimizeWaypointOrder`, `place_id`, `entitlement`, `intermediates`, `shipment`, `waypoint`,
`base plan offer`. Writing specifications in Italian forces either untranslated English terms
embedded in Italian prose — which reads badly and invites inconsistent naming — or Italian
translations that then have to be mentally mapped back to English identifiers at
implementation time.

The prompt that initiated this work specified 33 documents. Reviewing that list against the
requirements it also stated revealed gaps: it demands per-API input/output/error/timeout/
retry/rate-limit documentation without providing a file to hold it, and demands a decision
log inside every document, which duplicates rationale across 33 files and guarantees drift.

## Decision

**All documentation is written in English**, in the technical register used by the Google
Maps Platform and Expo documentation.

**The document set is the 33 specified files plus 8 extensions.** Numbering 00–30 is
preserved exactly as specified; extensions are appended at 31–35 plus three unnumbered
support files.

| Extension | Fills the gap |
|---|---|
| `31_COST_MODEL.md` | Subscription pricing has no basis without unit economics |
| `32_LEGAL_COMPLIANCE.md` | Google ToS, GDPR, EU auto-renewal law have no home |
| `33_API_CONTRACTS.md` | The demanded per-API contract documentation has no file |
| `34_LOCALIZATION.md` | i18n, units and address formats have no home |
| `35_RISK_REGISTER.md` | Risks need one live register, not 33 scattered mentions |
| `adr/` | Centralises the decision log; documents reference by ID |
| `INDEX.md` | Navigable index plus requirement→document traceability |
| `_TEMPLATE.md` | Enforces the mandatory 14-section structure |

**Every document follows the 14-section template** in [`_TEMPLATE.md`](../_TEMPLATE.md).
Sections are mandatory; a non-applicable section carries a one-line explanation rather than
being deleted, because the consolidation audit greps for headings.

**Single source of truth is enforced by convention.** API limits and prices live only in
`33_API_CONTRACTS.md` and `31_COST_MODEL.md`. The data model lives only in `12_DATABASE.md`.
Design tokens live only in `07_DESIGN_SYSTEM.md`. Other documents cite; they never restate a
number. A number appearing twice with different values is a defect caught by the Wave 6
audit.

## Consequences

**Positive.** Identifiers in specifications match identifiers in code, eliminating a
translation step where naming inconsistencies breed. The document set is publishable
alongside an open-source or investor-facing repository without translation. ADR references
by ID make the decision history auditable and non-duplicative.

**Negative.** The product owner reads specifications in a second language. Mitigated by
conversational summaries in Italian during review, and by the fact that decisions themselves
are recorded here in a compact form.

**Neutral.** Adding 8 files raises the total from 33 to 41, roughly a 24% increase in
authoring effort, concentrated in areas that were previously unspecified rather than
duplicating existing content. A forty-second document, `36_IMPLEMENTATION_PLAN.md`, was added
when implementation began ([ADR-0013](0013-implementation-execution-model.md)). Note that these
counts treat `adr/` as a single entry; on disk the repository holds 57 markdown files, because
that entry expands to sixteen ADRs.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| All documentation in Italian | Maximum comfort for the owner; a fully Italian team could onboard faster | Mixed IT/EN terminology is unavoidable in technical sections. Higher ambiguity risk exactly where Claude Code generates code from the spec. Naming drift between spec and implementation. |
| English with an Italian summary block per file | Readability plus precision | Roughly 15% more content and two versions to keep synchronised. Summaries drift from bodies within weeks; a stale summary is worse than none. |
| Exactly the 33 specified files | Faithful to the original request; more compact | Cost model, legal compliance and API contracts would be distributed across existing documents, making several of them very dense and duplicating cost figures in multiple places — the precise failure mode the single-source rule exists to prevent. |
| Free-form document structure | Less rigid, faster to write | With more than forty documents and no enforced structure, coverage gaps become invisible. The 14-section template makes an omission detectable by grep. |

## References

- [`docs/_TEMPLATE.md`](../_TEMPLATE.md) — the mandatory structure
- [`docs/INDEX.md`](../INDEX.md) — full index and traceability matrix
