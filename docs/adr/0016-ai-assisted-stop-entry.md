# ADR-0016 — AI-assisted stop entry: paste, photo, dictation

**Status:** Accepted
**Date:** 2026-08-08
**Deciders:** Product owner
**Related:** [ADR-0006](0006-mandatory-backend-proxy.md) · [ADR-0007](0007-place-id-durable-coordinates-perishable.md) · [ADR-0015](0015-ad-supported-free-tier.md)

---

## Context

[`31_COST_MODEL.md`](../31_COST_MODEL.md) §8 measures one dominant fact: **address entry is 78% of
per-user COGS and optimization is 6%.** Typing an address through Places Autocomplete costs
~$0.02 per address; the same address resolved through batch geocoding costs ~$0.005. Import is
already more than three times cheaper than typing, and the product already prefers the address
book to search in every add-stop flow for exactly this reason.

The gap that remains is that **import only works on data that is already a list.** The addresses
a courier or sales agent actually receives arrive as a WhatsApp message, an email, a photographed
delivery sheet, or a voice note in the van. Today those become typing — the most expensive path
we have — because nothing turns unstructured text into a list.

A language model turns them into a list for a fraction of a cent.

### The arithmetic

Fifteen addresses, verified against current published rates for
[Claude Haiku 4.5](https://platform.claude.com/docs/en/about-claude/models/overview)
(`claude-haiku-4-5`, $1.00 / 1M input, $5.00 / 1M output, retrieved 2026-08-08):

| Path | Parse | Resolve | Total |
|---|---|---|---|
| Typed, one by one through autocomplete | — | 15 × $0.02 | **$0.300** |
| Pasted, parsed by model, then batch-geocoded | ~$0.003 | 15 × $0.005 | **$0.078** |

**The parse is 4% of the cheaper path.** The expensive part remains geocoding, which we already
pay and already cache. A photograph costs marginally more — an image at Haiku's standard
resolution tier is roughly 1,600 input tokens — and lands at about $0.004, which is still an
order of magnitude below what the same page costs when typed.

This is the single largest COGS reduction available to the product, and it arrives disguised as
a UX feature.

## Decision

**One universal input accepts pasted text, a photograph, or dictation, and resolves it to stops
through a new Edge Function.**

1. **`POST /parse-addresses`** is added to [`33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) and goes
   through the same seven-step pipeline as every other metered call
   ([ADR-0006](0006-mandatory-backend-proxy.md), `CLAUDE.md` §13 rule 6). It is a metered upstream
   call and gets a quota like any other.
2. **The model is `claude-haiku-4-5`.** Chosen for cost and because the task — pulling addresses
   out of prose — needs neither deep reasoning nor a large context. The model identifier is
   configuration, not a constant: a cheaper or better model replaces it without a client release.
3. **Structured output, not free text.** The response is constrained to a JSON schema
   (`output_config.format`), so the model returns an array of address strings and nothing else.
   This is a correctness measure and the first half of the injection defence below.
4. **Parsing never produces a stop directly.** The model's output is a list of *candidate address
   strings*. Those go through the existing `/geocode` batch path to become `place_id`s. Nothing
   the model emits is trusted as a place, a coordinate, or a URL —
   [ADR-0007](0007-place-id-durable-coordinates-perishable.md)'s durable key is still minted by
   Google, not by us and not by a language model.
5. **Dictation is on-device.** Speech-to-text uses the platform recogniser; the transcript then
   takes the paste path. No audio leaves the device, which removes an entire class of privacy
   obligation for free.
6. **Unresolved lines are shown, never dropped.** Same rule as batch import: a page of thirty
   addresses where two lines are unreadable yields twenty-eight stops and two visible, editable
   rows. Silently discarding a stop is the worst failure this product can have.

### The pasted text is hostile input, and is treated as such

A WhatsApp message forwarded into the app was written by somebody who is not our user. Text
inside it that reads as an instruction to the model is a prompt-injection attempt, whether or not
anyone meant it as one. Four things keep it contained:

1. **The schema is the boundary.** Constrained output means the only thing the model can produce
   is an array of strings in the address field. There is no field for a URL, a command, or a tool
   call, because none is declared.
2. **The output is data, never an instruction and never a target.** Parsed strings go to
   `/geocode` as query text and nowhere else. They are not concatenated into a URL, not written to
   a handoff link, not logged.
3. **The user-supplied text is delimited and labelled as untrusted** in the request, and the
   system prompt states plainly that the content is data to extract from, not instruction to
   follow.
4. **The count is capped at `MAX_STOPS`.** A paste that yields two hundred addresses is a
   rejected request, not a two-hundred-address geocoding bill.

None of this makes injection impossible. It makes the blast radius "a wrong address appears in an
editable list the user is looking at", which is the same failure mode as a typo.

### Photographs carry other people's personal data

A photographed delivery manifest contains names and addresses of people who are not our user and
have not agreed to anything. That is third-party personal data under the GDPR, and it changes who
we are: the user is the controller, we are a processor, and the model provider is a sub-processor.
Consequences, specified in [`32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md):

- **The image is transient.** Sent, parsed, discarded. Never written to storage, never in a log,
  never in a crash report.
- **A data processing agreement with the model provider is a prerequisite to shipping the photo
  path**, and zero-retention is requested where the provider offers it.
- **The parsed text obeys the same rules as every other address in the system** — `place_id` is
  durable, coordinates expire at 30 days
  ([ADR-0007](0007-place-id-durable-coordinates-perishable.md)).
- **The photo feature ships behind the consent the user gives by choosing it**, and the screen
  says what leaves the device before it leaves.

### One more credential, in the only place credentials live

The model API key is a **Supabase secret**, used exclusively by the Edge Function. It is not in
the client, not in `app.config`, not in an EAS secret (`CLAUDE.md` §9 rule 2). `CLAUDE.md` §0
rule 1 is about Google credentials specifically; the principle it encodes — no provider
credential in the client but the Maps rendering key — extends to this one unchanged.

## Consequences

**Positive, and the reason this is worth doing.** It attacks the 78% line directly. Every address
that arrives by paste or photo instead of by keystroke costs a quarter as much and takes seconds
instead of a minute. It also makes the free tier's ten-session autocomplete allowance
([ADR-0015](0015-ad-supported-free-tier.md)) far less restrictive than it sounds, because the
cheap path covers the common case.

**Positive.** It is the answer to the product's hardest UX problem. Twenty-five stops is a lot of
typing on a phone, one-handed, and `CLAUDE.md` §7 rule 1 allows three taps from open to optimized
route. A paste plus a confirm is two.

**Negative.** A third upstream provider, with its own outage modes, its own rate limits, and its
own bill. It gets the same treatment as the others: a facade, a timeout, a degraded path (the
manual entry that exists today), and a quota.

**Negative and material.** The photo path introduces third-party personal data into a product
built to hold as little as possible, and with it a DPA, a processor relationship, and a retention
obligation. Recorded as risk **C19**. Paste and dictation carry none of this, which is why they
ship first.

**Neutral.** Parsing is probabilistic. An address the model gets wrong is an address the user
sees and corrects, because the review step is not optional and the parsed list is editable before
anything is geocoded. This is deliberate: an unreviewed parse would turn a cheap convenience into
an expensive, silent error.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Regular expressions and heuristics on the client | No provider, no cost, no privacy question | Italian addresses in free prose defeat this — `Via Roma 12`, `V.le Kennedy 3/B`, `c/o Rossi, Piazza Garibaldi 5 int. 2`. Every failure falls back to typing, which is the expensive path we are trying to avoid |
| Parse in the client, calling the model directly | One less hop | Puts a provider credential in the client, which is the rule the whole backend exists to enforce ([ADR-0006](0006-mandatory-backend-proxy.md)) |
| A larger model for higher accuracy | Fewer corrections | The task is extraction, not reasoning, and the review step catches what the model misses. Ten times the price for a step the user checks anyway |
| OCR library on-device, then parse the text locally | Nothing leaves the phone | Removes the privacy question and keeps the hardest half of the problem — a photographed manifest still needs the unstructured text turned into addresses. Worth revisiting as a pre-filter that reduces what gets sent, not as a replacement |
| Ship the photo path first, since it demos best | Most impressive | It is the only one of the three that carries third-party personal data and needs a DPA. Paste and dictation deliver most of the cost saving with none of the obligation |
| Skip the review step for a faster flow | Two taps instead of three | A silently wrong address is a driver at the wrong door. The review step is the feature, not friction |

## References

- [`docs/31_COST_MODEL.md`](../31_COST_MODEL.md) — the 78%/6% split this decision exploits
- [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) — the `/parse-addresses` contract
- [`docs/32_LEGAL_COMPLIANCE.md`](../32_LEGAL_COMPLIANCE.md) — processor role, DPA, retention
- [ADR-0006](0006-mandatory-backend-proxy.md) — why this cannot run in the client
- [ADR-0015](0015-ad-supported-free-tier.md) — why the cheap entry path matters most on free
