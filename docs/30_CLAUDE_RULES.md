# 30 — Claude Rules: working agreement for AI-assisted development

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`../CLAUDE.md`](../CLAUDE.md) · [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) · [`adr/`](adr/)

---

## 1. Purpose

[`CLAUDE.md`](../CLAUDE.md) states *what the rules are*. This document states *how the rule
system works*: where authority sits, what an agent must do before writing code, how conflicts
are resolved, and which failure modes of AI-assisted development this project is specifically
exposed to.

The distinction matters because this codebase will be written largely by an agent working
from specifications rather than from an existing codebase to imitate. The usual safety net —
"look at how the surrounding code does it" — does not exist at the start. The specifications
are the surrounding code.

This document does not restate the rules. Read [`CLAUDE.md`](../CLAUDE.md) for those.

## 2. Goals

1. Establish an unambiguous authority ordering, so a conflict never resolves by coin-flip.
2. Define the mandatory pre-work: what must be read before code is written in a given area.
3. Name the specific ways AI-assisted development degrades a codebase, and block each.
4. Define how the rules themselves change, so they stay true rather than becoming folklore.

**Non-goals.** This is not a prompting guide, and not a list of coding rules — those are in
[`CLAUDE.md`](../CLAUDE.md).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Rule content | [`CLAUDE.md`](../CLAUDE.md) | The enforced artifact an agent reads |
| Rule authority and process | This document | How conflicts resolve, how rules change |
| Individual decisions | [`adr/`](adr/) | Highest authority; supersedes both above |
| Area specifications | `docs/NN_*.md` | What to build in each area |
| Completion criteria | [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) | When a change is finished |

## 4. Text diagrams

### Authority ordering

Higher wins. Always.

```
  ┌───────────────────────────────────────────────┐
  │ 1. ADRs — docs/adr/                           │  A decision, with its
  │    Binding. Supersede everything below.       │  reasoning and rejected
  └───────────────────┬───────────────────────────┘  alternatives.
                      │
  ┌───────────────────▼───────────────────────────┐
  │ 2. CLAUDE.md                                  │  The rules an agent
  │    Binding. If it contradicts an ADR,         │  applies continuously.
  │    CLAUDE.md is wrong and must be fixed.      │
  └───────────────────┬───────────────────────────┘
                      │
  ┌───────────────────▼───────────────────────────┐
  │ 3. Area specifications — docs/NN_*.md         │  What to build here.
  └───────────────────┬───────────────────────────┘
                      │
  ┌───────────────────▼───────────────────────────┐
  │ 4. Existing code                              │  Evidence of intent,
  │    Precedent, not authority. Code can be      │  not a mandate.
  │    wrong; the specification cannot be         │
  │    overridden by it.                          │
  └───────────────────┬───────────────────────────┘
                      │
  ┌───────────────────▼───────────────────────────┐
  │ 5. General best practice                      │  Applies only where
  │    Lowest. Never overrides 1–4.               │  1–4 are silent.
  └───────────────────────────────────────────────┘
```

The fourth level is the one most often inverted in practice. **Existing code is precedent, not
authority.** A pattern repeated ten times may be ten repetitions of one mistake. When code and
specification disagree, the specification wins and the code is a defect to be reported.

### Required reading before writing code

```
Any change          → CLAUDE.md §0 (the five rules)
                    → 00_PROJECT_OVERVIEW.md §7 (glossary)

Then, by area:
  optimization      → 15_ROUTE_OPTIMIZATION.md, ADR-0003
  map               → 14_GOOGLE_MAPS_INTEGRATION.md, ADR-0005
  navigation        → 16_INTERNAL_NAVIGATION.md, ADR-0004
  data              → 12_DATABASE.md, ADR-0007
  backend           → 13_BACKEND.md, 33_API_CONTRACTS.md, ADR-0006
  billing           → 20_SUBSCRIPTIONS.md, ADR-0002, ADR-0011
  UI                → 07_DESIGN_SYSTEM.md, 09_COMPONENT_LIBRARY.md, ADR-0009
  anything metered  → 31_COST_MODEL.md
```

## 5. Flows

**Flow A — implementing a specified feature.**
1. Read the area specification and its ADRs.
2. Confirm the glossary terms in use. If a needed term is undefined, stop: define it in
   [`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) first.
3. Identify which of the five rules in [`CLAUDE.md`](../CLAUDE.md) §0 the change touches.
4. Write the failing test first where behaviour is being added.
5. Implement in the correct layer.
6. Verify against [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md).
7. Update the affected document's decision log if a decision changed.

**Flow B — the specification is missing or ambiguous.**
1. Stop. Do not infer and proceed.
2. State precisely what is undefined and what the candidate readings are.
3. Ask the product owner.
4. Record the answer in the specification, and in an ADR if it is a decision rather than a
   clarification.
5. Then implement.

Inventing a specification and implementing it produces something that looks finished and is
unreviewable, because the reviewer has nothing to check it against. This is the most
expensive failure mode available to an agent.

**Flow C — a rule blocks something clearly correct.**
1. Do not work around it silently. A silent workaround makes the rule false without anyone
   knowing.
2. State the rule, the case, and why the rule produces a worse outcome here.
3. Decide with the product owner: exception, or rule change.
4. If the rule changes, write the ADR and update [`CLAUDE.md`](../CLAUDE.md) in the same pull
   request as the code.

**Flow D — an external service changed.**
1. Update [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) or
   [`31_COST_MODEL.md`](31_COST_MODEL.md) with the new value, its source and the date.
2. Assess whether it triggers a migration condition in
   [ADR-0012](adr/0012-long-term-osm-exit-path.md).
3. Only then change code.

Code changed ahead of documentation leaves the documentation lying, and the next agent reads
the lie.

## 6. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0001](adr/0001-documentation-language-and-structure.md) | Documentation is English, templated, single-source | Every document and this rule system |
| All others | Binding on the areas they govern | See [`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) §6 |

This document makes one decision of its own: **the authority ordering in §4 is fixed**, and
changing it requires an ADR.

## 7. Edge cases

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|
| 1 | Two documents state different values for the same number | The owning document wins (limits → `33`, costs → `31`, schema → `12`, tokens → `07`). The other is a defect; fix it in the same change. | [ADR-0001](adr/0001-documentation-language-and-structure.md) |
| 2 | An ADR contradicts `CLAUDE.md` | The ADR wins. `CLAUDE.md` is corrected immediately, not later. | §4 |
| 3 | Existing code contradicts the specification | The specification wins. Report the code as a defect; do not extend the pattern. | §4 |
| 4 | A dependency's documentation contradicts ours | Verify against the primary source, record the finding with its date, then update our document. External reality wins over our record of it. | Flow D |
| 5 | A rule has no stated reason | Treat it as suspect and raise it. A rule without a reason will be violated the first time it is inconvenient. | §9 |
| 6 | A task appears to require breaking a §0 rule | It does not. Either the task is misunderstood or the rule needs changing — resolve which before writing code. | Flow C |
| 7 | An agent cannot verify a claim it is about to write | State the uncertainty explicitly rather than asserting. An unmarked guess in a specification propagates into code. | §9 |

## 8. Error handling

Failure modes of the rule system itself.

| Failure | Detection | Result | Retry | Fallback |
|---|---|---|---|---|
| Specification missing for the work at hand | Agent finds no owning document | Work stops; question raised | After the answer | None — proceeding is the failure |
| Glossary term undefined | Term absent from `00` §7 | Define it first | — | None |
| Rule conflict | Two sources disagree | Apply §4 ordering; fix the loser | — | Escalate if the ordering does not resolve it |
| Documentation drifted from code | Review, or the consolidation audit | Documentation corrected in the same pull request | — | None |
| A rule is being routinely bypassed | Review pattern, or repeated exceptions | The rule is wrong or unclear; revise it | — | Delete the rule rather than keep a fiction |

## 9. Best practices

1. **Read before writing.** The map area alone spans an ADR, an integration document and a
   component contract. Writing first and reconciling later produces work that must be redone.
2. **Quote the specification in the pull request** when implementing something non-obvious, so
   the reviewer checks against the same text.
3. **Say when you are uncertain.** "This assumes Places sessions bill as documented on
   2026-08-06" is useful. Silent confidence about an unverified external fact is how a cost
   model becomes fiction.
4. **Prefer the smallest change that satisfies the specification.** Speculative generality is
   forbidden ([`CLAUDE.md`](../CLAUDE.md) §12); the facades are the only sanctioned exception.
5. **Never restate a number.** Cite the owning document. A duplicated figure is a future
   contradiction.
6. **Update the decision log** of any document whose decisions you changed. An undocumented
   decision change is invisible to the next reader.
7. **Treat cost as a correctness property.** An unmetered upstream call is a defect of the same
   severity as an unhandled error, because both reach production silently.
8. **Do not report work as complete that is partially done.** State what was finished, what
   was not, and why. Overstated completion is the failure mode that erodes trust fastest.
9. **Push work, do not only commit it.** This project is developed in ephemeral containers. A
   commit that exists only locally is work that is not saved, and a container reclaim destroys
   it without warning.

## 10. Checklist

Before opening any pull request:

- [ ] The five rules in [`CLAUDE.md`](../CLAUDE.md) §0 are satisfied.
- [ ] The area specification and its ADRs were read.
- [ ] Every domain term used matches the glossary.
- [ ] No specification was invented; open questions were asked, not assumed.
- [ ] No number was restated from another document.
- [ ] Documentation updated where decisions changed, including decision logs.
- [ ] [`29_DEFINITION_OF_DONE.md`](29_DEFINITION_OF_DONE.md) is satisfied in full.
- [ ] Uncertainties and unverified external claims are stated explicitly.
- [ ] Work is pushed to the remote, not only committed locally.

## 11. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| 1 | Manual enforcement through review against this document | — |
| 2 | Automated enforcement: ESLint rules for layering and direct SDK imports; a CI check for hardcoded design values | First repeated violation of the same rule |
| 3 | CI check that documentation numbers and code constants agree | First observed drift between them |

Automation is deliberately deferred. A rule enforced by a linter before it has been shown to
matter is a rule nobody understands.

## 12. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Document created alongside `CLAUDE.md`; authority ordering fixed | Project inception; agent-led development requires explicit conflict resolution | Product owner |
| 2026-08-06 | "Push, do not only commit" added to §9 and §10 | A container reclaim destroyed a full day of committed-but-unpushed documentation work | Product owner |

## 13. Rationale

Two properties of this project make an explicit rule system worth its cost.

**The codebase starts empty.** Conventions cannot be inferred from surrounding code, because
there is none. The specifications carry the entire weight of consistency until enough code
exists to imitate — and by then, early inconsistencies have already been copied.

**The expensive mistakes here are invisible at review time.** A missing quota check, a
coordinate cached past 30 days, a Google-derived polyline on a non-Google map: all compile,
all pass tests, none look wrong in a diff. They surface as a bill, a terms complaint, or a
rejected release. Rules stated in advance are the only defence, because these failures cannot
be caught by reading the code alone.

The authority ordering exists because the alternative — resolving conflicts case by case —
produces inconsistent outcomes that then become precedent, at which point the rule system has
been replaced by folklore.

The push rule in §9 was added after a real incident rather than as a precaution: a full set of
committed documentation was lost when the container was reclaimed, because the push had been
deferred to the end of the work. In an ephemeral environment, "committed" and "saved" are not
the same word.

## 14. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| `CLAUDE.md` alone, no rule-system document | One file to maintain; less to read | Conflates rules with how rules work. When an ADR and `CLAUDE.md` disagree, a rules file cannot arbitrate itself. |
| Duplicate the rules here in full | Each file readable standalone | Two copies drift, and readers cannot tell which is current. This document deliberately holds no rule content. |
| Automated enforcement from day one | Rules that cannot be ignored | Linting rules before their value is demonstrated produces suppression comments and cargo-culting. Deferred to roadmap phase 2, triggered by observed violations. |
| No explicit rule system; rely on review | Less documentation; faster start | Review catches what a reviewer thinks to look for. The costly failures here — quota, caching, terms — are precisely the ones a code reviewer does not spot in a diff. |
