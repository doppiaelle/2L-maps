# ADR-0013 — Implementation execution model: waves, branches and durable status

> **Status:** Accepted
> **Date:** 2026-08-07
> **Supersedes:** none
> **Related:** [ADR-0001](0001-documentation-language-and-structure.md) · [ADR-0005](0005-map-engine-and-route-preview.md) · [`../25_DEPLOYMENT.md`](../25_DEPLOYMENT.md) · [`../36_IMPLEMENTATION_PLAN.md`](../36_IMPLEMENTATION_PLAN.md)

## Context

The specification set is complete and the project moves to implementation. Three facts about
how this project is actually developed shape that transition, and none of them is a normal
assumption of a software plan.

**Development happens in ephemeral containers.** The machine is reclaimed without warning. This
is not hypothetical: a full set of committed-but-unpushed documentation was destroyed once
already, recorded as risk S4 in [`../35_RISK_REGISTER.md`](../35_RISK_REGISTER.md).

**Sessions do not share memory.** A new session begins with no recollection of the previous
one. Any state that lives only in a conversation is state that will be lost, and a plan held
outside the repository is a plan that does not exist.

**Large parts of the delivery pipeline cannot run in the development environment.** There is no
Mac, no physical device, no emulator, and the Docker daemon is not running, so there is no local
Postgres. Cloud accounts are deliberately not provisioned yet, because Google Maps Platform has
no sandbox and development would consume the production free tier
([`../25_DEPLOYMENT.md`](../25_DEPLOYMENT.md)).

An execution model that ignores any of these produces work that is either lost, unrepeatable, or
blocked on resources that do not exist.

## Decision

**Implementation proceeds in seven waves, each on a short-lived `feat/` branch cut from `main`,
squash-merged back into `main` when its gate passes.**

1. **One wave open at a time.** Waves are ordered bottom-up along the layering of
   [`../../CLAUDE.md`](../../CLAUDE.md) §1, so every layer rests on one already tested.
2. **Commit and push at every meaningful unit of work**, never only at wave close. A commit that
   exists only locally is not saved work.
3. **Each wave closes on an explicit gate** — a stated, verifiable condition, not a judgement
   that it feels finished.
4. **Status lives in the repository**, in [`../36_IMPLEMENTATION_PLAN.md`](../36_IMPLEMENTATION_PLAN.md),
   updated at every wave close. A cold session reads `CLAUDE.md` → `INDEX.md` → that status
   table and knows exactly where the work stands.
5. **Verification that cannot run here is named, not skipped.** Every gate states what it does
   not cover, and the residue is collected in one place as work requiring hardware or accounts.

**Backend and client are decoupled by contract, not by branch.** They meet only at
[`../33_API_CONTRACTS.md`](../33_API_CONTRACTS.md), which is already frozen, so the client is
built and tested against MSW mocks of that contract before the backend exists, and the backend
is verified by contract tests without any client. This is what makes a strictly sequential
branch order cost nothing in practice.

## Consequences

**Positive.** No work is ever more than one push away from being safe. A session can be
interrupted at any moment and resumed from the repository alone. Each wave is independently
reviewable, and `main` stays releasable throughout. Gates make "done" falsifiable, which is the
same property [`../01_PRODUCT_REQUIREMENTS.md`](../01_PRODUCT_REQUIREMENTS.md) demands of
requirements.

**Negative.** Squash-merging discards the intermediate history of a wave; the wave branch is
retained on the remote as the detailed record. Sequential waves also mean a defect found late in
a lower layer is corrected in a follow-up branch rather than in place.

**Neutral.** Adding this ADR and the implementation plan takes the approved document set from 41
to 42, and files on disk from 52 to 54. Both counts are corrected in
[ADR-0001](0001-documentation-language-and-structure.md) and
[`../INDEX.md`](../INDEX.md) in the same change, because the consolidation audit checks that
they agree.

**Deferred.** Merges go directly to `main` while the repository has a single contributor and no
branch protection. If `main` is later protected, each wave closes with a pull request instead
and CI becomes the merge gate — the wave structure is unaffected either way.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Long-lived parallel branches per module | Suggests throughput; mirrors how larger teams work | One executor. Parallel branches over shared `types/` and `lib/` produce conflicts with no gain, and the contract already decouples backend from client without them |
| Trunk-based, committing straight to `main` | Simplest possible; no merge step at all | Loses the wave boundary, which is where the gate lives. Without a gate, "done" becomes a judgement call, and `main` stops being reliably releasable |
| Status tracked in issues or a project board | Purpose-built tooling; visible outside the repo | Requires network and a second system to stay in sync. A file in the repository is available to a cold session with nothing but a clone |
| Walking skeleton before the domain | Proves the wiring early; a demo exists sooner | Would defer the layer carrying all the differentiating logic and all the non-negotiable coverage, while depending on services not yet provisioned. The wiring it proves is the part already specified in most detail |
| Provisioning cloud accounts up front | Real integration from the first day; no mocked seams | Google Maps Platform has no sandbox, so development bills the production free tier from day one, and none of the first two waves needs a single upstream call |
