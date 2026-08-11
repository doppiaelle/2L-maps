# ADR-0025 — A field that only improves an answer may not prevent one

**Status:** Accepted
**Date:** 2026-08-11
**Extends:** [ADR-0024](0024-deploy-the-functions-with-the-app.md) — same rule, request direction
**Amends:** [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) §`/places-autocomplete`

## Context

Address search stopped answering. Not for some inputs — for every input, for
every user, from the moment the Edge Functions were deployed. The phone said
"Search is not responding", which is the sentence reserved for our fault, and
it was ours.

Autocomplete had been returning towns and businesses for the short input a
driver types, so the request grew a filter: `includedPrimaryTypes: ['address']`.
`address` is a *type collection* — from the **legacy** Autocomplete, whose
parameter was `types`. Autocomplete (New) takes `includedPrimaryTypes`, and its
collections are `geocode`, `establishment`, `(regions)` and `(cities)`. Places
validates the field, so an unrecognised value is not a filter it ignores. It is
a 400 on the whole request.

**Nothing read the field. It could not have made a single suggestion wrong.**
Its entire job was to move street addresses above towns in a list — and it took
the list away instead.

Three things then made it worse than a bad value:

- **The endpoint threw the reason away.** `autocompleteUpstream` mapped every
  upstream failure to one `UPSTREAM_UNAVAILABLE` with no detail and no log, so a
  refused request, an expired key, a timeout and an unreadable body were
  indistinguishable at both ends. §0 rule 5 asks for a user-visible outcome; it
  does not excuse having nothing to look at afterwards.
- **It could not be caught by a test.** Every test here asserts the request we
  send. Only Google knows which values it accepts, and no fixture can be made to
  disagree with its author about that — the same blind spot as `locale: null`
  and the leg ids ([ADR-0023](0023-legs-name-their-stops.md)), one layer out:
  those were shapes *we* owned on both sides, this is a vocabulary we do not own
  at all.
- **The suspicion landed on the wrong thing.** A half-applied migration produces
  the identical sentence, because step 2 of the pipeline reads
  `user_entitlements` by column name. That was the leading hypothesis for a
  while and it was wrong — the `migrate` run of 10 August applied every
  migration and failed only on its generated-types gate.

## Decision

**A request field that only improves an answer is advisory, and the adapter
treats it as one.** `suggest` sends the filter; if Places answers `rejected` —
a 4xx, the request being refused — it logs the status and asks again without it.

Retried on `rejected` only. A timeout or a 5xx is not the filter's fault and
asking again would double the cost of a bad minute upstream. The same session
token goes back out, so the retry is not a second billable session.

**The filter's value changes to the five address-level types**
(`street_address`, `route`, `street_number`, `premise`, `subpremise`), which is
what "addresses, not places" meant before it was written as a legacy collection.
The ceiling is five, so the list is exactly full.

**The endpoint says why.** `autocompleteUpstream` logs
`{event, reason, upstreamStatus}` and carries `upstreamStatus` in the error
details, matching `/optimize`. The kind and the status only — the input is an
address and may not reach a log line ([`CLAUDE.md`](../../CLAUDE.md) §9 rule 7).

**The rule generalises**, and it is the mirror of the one ADR-0024 stated for
responses. A response schema requires only what the caller would break without;
a request sends only what the answer would be *wrong* without, and everything
else is advisory. The test for it is one question: **if this field vanished,
would the answer be wrong, or merely worse?** Merely worse means it may never
fail the call.

## Consequences

**One wasted round trip, in the case where the value is wrong.** Bounded to one,
and it is the only case in which anything is spent — a 400 is not a billed
Places session. Against a total outage this is not a trade worth thinking about.

**The logs now answer the question a screenshot cannot.**
`autocomplete_filter_rejected` says the filter was refused and with what status;
`autocomplete_failed` says which of the four failures happened. Before this,
"Search is not responding" was the whole of the available evidence.

**A schema check exists for the cause this was confused with.**
`supabase/sql/check-schema.sql` reports, from the dashboard in one paste,
whether the database has every column, table, enum value and function the
functions name — because "the search is broken" and "the migration did not
finish" look the same from a phone and take five seconds to tell apart from the
database. It is tested against a migrated database *and* against one with a
column removed, so it can fail as well as pass.

**The unverifiable stays marked as unverifiable.** No test in this repository
can confirm that Places accepts these five types, and the comment on
`ADDRESS_PRIMARY_TYPES` says so rather than implying the list is checked. The
retry is what makes being wrong about it survivable, and it is the load-bearing
half of this decision.
