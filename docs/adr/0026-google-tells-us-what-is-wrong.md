# ADR-0026 — Google's own error message is the documentation

**Status:** Accepted
**Date:** 2026-08-11
**Supersedes in part:** [ADR-0025](0025-a-preference-may-not-fail-a-request.md) — the filter it made survivable is withdrawn entirely
**Amends:** [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) §`/places-autocomplete`, [`docs/13_BACKEND.md`](../13_BACKEND.md)

## Context

Three consecutive attempts to fix address search made it worse, and they failed
for one reason that had nothing to do with any of them individually.

**The environment this code is written in cannot reach
`developers.google.com`.** The egress policy answers 403. So a request field was
written from memory: `includedPrimaryTypes: ['address']`. `address` is a type
collection from the *legacy* Autocomplete, whose parameter was `types`.
Autocomplete (New) validates `includedPrimaryTypes`, so the value was not an
ignored hint — it was a 400 on every request. Address search stopped answering
for everybody.

The correction was written the same way: five address-level types, from memory
again. It did not 400, and it was still wrong — searching "Roma" stopped
returning Rome, because a filter that admits only street-level results answers a
question no driver asked.

**Nothing in the repository could have caught either.** Every test here asserts
what we send. Only Google knows what it accepts, and a fixture is a statement of
what its author believed. This is the same blind spot that produced `locale:
null` and the leg ids ([ADR-0023](0023-legs-name-their-stops.md)) — but one
layer further out, and worse: those were shapes *we* owned on both sides, and
could be tested by running one side against the other. This is a vocabulary we
do not own at all.

And Google had been saying exactly what was wrong, every single time. Both
adapters read `response.status` and **discarded the body**, which carries:

```json
{ "error": { "code": 400, "status": "INVALID_ARGUMENT",
             "message": "Invalid value at 'included_primary_types[0]' (TYPE_ENUM), \"address\"" } }
```

That message names the field and the value. It is more precise than the
reference page, it is current by construction, and it arrives at the moment it
is needed.

## Decision

**An upstream refusal is never reduced to a number.** Both adapters read the
error envelope, log `upstream_refused` with the provider's own status enum and
message, and carry the enum on the failure so callers can distinguish a request
we built wrong (`INVALID_ARGUMENT`) from a key or API that is not enabled
(`PERMISSION_DENIED`) — same HTTP status, opposite fixes.

**What the user typed never enters that line.** Every caller passes the values
it sent, and `scrub` removes them longest-first before anything is written;
anything shaped like a coordinate goes too, whether or not the caller remembered
to declare it. Redaction lives in `google-error.ts` rather than at each call
site, because a call site that forgets is a breach and no test can see an
omission. Place ids are deliberately kept — an id names a building, not a person
([ADR-0007](0007-place-id-durable-coordinates-perishable.md)), and it is the
single most useful thing to have when Google refuses one.

**Autocomplete sends no type filter at all.** The product's promise is parity
with Google Maps' own search: a driver who types "Roma" is looking for Rome.
Ranking is Google's, unmodified, which is the only way to be identical to it.
This withdraws the field ADR-0025 made survivable rather than keeping it behind
a retry — a value we cannot verify, in service of a preference the product does
not want, is not worth the machinery.

**The rule for the next time: an unverifiable external value is not written from
memory.** It is either sent and its refusal read, or not sent. ADR-0025's
principle stands and is what makes the first branch safe.

**And `/parse-addresses` moves out of its entrypoint.** Every `index.ts` under
`supabase/functions/` is excluded from `tsc`, and that endpoint built its
response there — the one response shape in the product that neither the compiler
nor a test could see, while the identical class of mismatch had already taken
`/optimize` down for its entire existence. The endpoint suite's own rule is that
an entrypoint contains no decisions; this applies it.

## Consequences

**The next failure is diagnosable from the dashboard.** Supabase → Edge
Functions → Logs, filtered to `upstream_refused`, gives the API, the HTTP status,
Google's enum and Google's sentence. Three deployments were spent on questions
that line answers.

**The contract test now runs both directions for all five endpoints.**
`/optimize` got the response half after the leg ids; the other four kept the
request half only, which meant the bug that broke optimization for its whole
life was still possible, unchanged, in four places. Each case builds the body
with the real endpoint function and parses it with the real client adapter,
through the real `ApiClient`, after `JSON.stringify`.

**Search returns towns and businesses again.** That is the requirement, and the
cost is that a driver typing "via roma" may see the town before the street. The
answer to that is ranking Google already does better than a filter can, and if
it is not good enough the fix is a `locationBias`, which is a hint rather than a
gate.

**A client-side hole closed with it.** `useResolvedPlaces` reported a failure
only for its own error type; any other throw left `failure` null, `data`
undefined and `isLoading` false — rendering as rows saying "Address needs
refreshing" with no notice, no reason and no retry. An unrecognised throw is now
`upstream-unavailable`. The one state this product may not have is a failure
that looks like an answer (`CLAUDE.md` §0 rule 5).

**What is still not knowable from here.** Whether Google accepts any given
field, before we send it. That limit is unchanged and is now handled rather than
denied: send, read the refusal, act on what it says.
