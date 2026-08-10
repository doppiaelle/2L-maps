# ADR-0017 — The parse provider is a switch, not a choice made once

> **Status:** Accepted
> **Date:** 2026-08-10
> **Supersedes:** nothing. **Amends:** [ADR-0016](0016-ai-assisted-stop-entry.md)
> **Related:** [`31_COST_MODEL.md`](../31_COST_MODEL.md) · [`19_SECURITY.md`](../19_SECURITY.md) · [`32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md)

## Context

[ADR-0016](0016-ai-assisted-stop-entry.md) chose `claude-haiku-4-5` for turning
unstructured material into candidate addresses. That decision was made on cost and
quality and it still holds.

It left one thing unaddressed: **the endpoint cannot be exercised without a paid
Anthropic account.** During development that is a real obstacle — the whole import
path, including its failure states, is unreachable until somebody has funded a key.
A path that cannot be run is a path that is not tested by anybody who has not paid
to test it.

There is a second, smaller pressure. "The cheapest adequate model" is not a durable
property. It was a different model a year ago and it will be a different one again,
and re-deciding it should not require an app release.

## Decision

**`PARSE_PROVIDER` selects the provider at the Edge Function, from Supabase
secrets. `anthropic` is the default; `openrouter` is the alternative.**

Both implement one interface, `ParseAdapter`. The endpoint depends on the
interface and never on a provider. `PARSE_MODEL` overrides the model within
whichever provider is selected.

Neither key ever reaches the client. Both are read in `runtime.ts`, the single
file in the repository that reads a credential.

### Why a weaker model is acceptable here

Because of where this sits in the flow, not because the model is good enough.

**The candidates are shown for review before anything is geocoded**
([`08_SCREEN_SPECIFICATIONS.md`](../08_SCREEN_SPECIFICATIONS.md) §8). A worse model
produces more rows the user has to correct — it does not produce a driver at the
wrong door. The screen was already built that way, for the reason ADR-0016 gives:
even a good model must not be trusted to have read a customer's address correctly.

**The guarantees that matter are not the model's.** The output is validated field
by field in `readParsedJson`, the count is capped at `MAX_STOPS`, and nothing
returned is ever used as an instruction, a URL or a query parameter. A structured
output declaration is a *request* that free and open models frequently ignore,
which is exactly why the validation is there rather than being replaced by it.

### The caution, which is not about quality

**Many free inference endpoints retain prompts for training.** A pasted delivery
list is third-party personal data: the addresses of the user's customers, not the
user's own. Sending them to an endpoint with an unexamined retention policy is a
data decision before it is a cost one.

So:

- `openrouter` is appropriate for **test data**.
- Before real customer addresses go through it, its data policy must be read and
  recorded here, and the model pinned to one whose terms are known.
- **The default is `anthropic`** so nobody reaches the cheaper path by omission.
  It has to be asked for, in a secret, deliberately.

The image path is Anthropic-only. Free vision models are scarce and inconsistent,
and a photographed delivery note that silently returns nothing is worse than one
refused with a reason.

## Consequences

**Positive.** The import path becomes runnable, and therefore testable end to end,
without a paid account. Changing model or provider is a secret, not a release.

**Negative.** Two upstream adapters to keep working, and a second failure taxonomy
to map onto the same one. Contained by sharing the system prompt, the validation
and the cap — the OpenRouter adapter adds a transport and nothing else.

**Negative.** A configuration switch that changes where personal data goes is a
compliance surface. Mitigated by the default and recorded here so a review finds
it; a switch that is only in the code is a switch nobody audits.

**Neutral.** Free tiers are queues. The OpenRouter path has a longer timeout and
treats 429 as retryable, because being slow is its normal state rather than a
fault.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Keep ADR-0016 unchanged, Anthropic only | One provider, one taxonomy, one data policy | Leaves the whole import path unrunnable without a funded account, so its failure states stay untested |
| Replace Anthropic with OpenRouter outright | One provider still; cheaper | Makes a development convenience the production data path, with a retention policy nobody has read |
| Run a local model in the Edge Function | No third party at all | Edge Functions have neither the memory nor the cold-start budget; and it trades a data question for an operations one |
| Skip the model, keep only the line splitter | No provider, no key, no data leaving | Handles a clean list and nothing else — the forwarded message and the photographed note are the cases ADR-0016 exists for |

## Decision log

| Date | Decision | Rationale | Decided by |
|---|---|---|---|
| 2026-08-10 | `PARSE_PROVIDER` switch, Anthropic default | Import path must be runnable without a paid account; provider choice must not need a release | Product owner |
| 2026-08-10 | Free endpoints for test data only, pending a policy read | Pasted addresses are third-party personal data | Product owner |
