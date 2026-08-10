# ADR-0019 — Address search is submitted, not typed ahead

**Status:** Accepted
**Date:** 2026-08-10
**Amends:** [`CLAUDE.md`](../../CLAUDE.md) §6 rule 1, [`docs/04_FEATURES.md`](../04_FEATURES.md) §Address entry, [`docs/24_PERFORMANCE.md`](../24_PERFORMANCE.md) §Budgets, [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) §Places
**Related:** [ADR-0011](0011-server-side-quota-enforcement.md), [ADR-0015](0015-ad-supported-free-tier.md)

## Context

The first person to use the built app exhausted their monthly address-search
allowance in a single sitting, adding a handful of stops.

Nothing was broken. Every cost control the documentation specifies was present
and working: a 300 ms debounce, a three-character minimum, one session token per
search, cancellation of superseded requests. The allowance is 10
`/places-autocomplete` calls a month on the free plan
([`20_SUBSCRIPTIONS.md`](../20_SUBSCRIPTIONS.md) §6). The arithmetic is the
problem.

A debounce does not bound the number of requests per address. It bounds the
number of requests per *pause*. Typing "Via Giuseppe Garibaldi 14" on a phone
produces a pause after the street type, after the forename, after the surname,
and before the number — four requests for one address, five on a slower thumb,
two on a faster one. The count is a property of the typist, not of the product,
and nothing in the interface tells the user which they are.

So the free allowance is not "ten addresses a month". It is "somewhere between
two and ten addresses a month, depending on how you type", which is not an
allowance anybody can plan around — and, from the user's side, is simply the
product breaking after five minutes.

Three responses were available.

1. **Raise the allowance.** Treats the symptom, multiplies the dominant COGS
   line ([`31_COST_MODEL.md`](../31_COST_MODEL.md)), and leaves the count still
   determined by typing rhythm.
2. **Lengthen the debounce.** A constant-factor improvement on an unbounded
   multiplier, bought by making the field feel broken. `24_PERFORMANCE.md` §312
   already rejected the opposite trade for the same reason.
3. **Change the trigger.**

## Decision

**Nothing leaves the device until the user asks for it.** The field and a Search
control sit on one row; the keyboard's search key does the same thing. Typing is
free and stays free.

One address is one request. The count is now a property of the product, and a
user can be told what it is.

Three things follow, and each is a decision rather than a consequence:

- **The address book still fills the screen while typing.** Recents and
  favourites filter locally on every keystroke, so the field still answers
  instantly and the cheapest option is still the nearest one
  (`CLAUDE.md` §6 rule 2). What changed is that the *paid* answer waits.
- **"Typed but not searched" is its own state.** `searchStateOf` takes the
  submitted query alongside the current one, and reports `browsing` when they
  differ. Without that distinction the screen would show "No match for what you
  typed" against a query nobody had looked up — the same lie the failure states
  in [`lib/places/search.ts`](../../lib/places/search.ts) were written to stop
  telling, arriving by a new route.
- **The session token still spans a whole search.** Refining a query and
  searching again is now *more* common, not less, and it stays inside one billed
  session. That is what stops the explicit trigger from being a worse deal than
  the debounce for a user who does not get the address right first time.

## Consequences

**A tap is added to the add-stop flow.** The four-tap ceiling in `CLAUDE.md` §7
rule 1 counts taps to an optimized route — Route → Add a stop → choose →
Optimize. Search sits inside "choose", which was already a variable number of
interactions (typing is not free of taps either), so the ceiling is unchanged.
This is worth stating plainly rather than hiding: the flow is one deliberate
press longer, and the thing bought with it is a product that still works on the
tenth address.

**The performance budget changes shape.** "Autocomplete keystroke → suggestions
< 400 ms" no longer describes anything: no keystroke produces suggestions. The
budget becomes "Search pressed → suggestions", and the debounce line is struck.
`AUTOCOMPLETE_DEBOUNCE_MS` is deleted rather than left unused: a submit is
already idempotent for an unchanged query, so there is nothing left for it to
bound, and a constant with no caller is a rule the next reader will assume is
enforced.

**The quota counter still counts requests, not sessions.** `/usage-quota`
reports a figure named `autocompleteSessions` while `usage_events` records one
row per request. Under the debounce those two numbers differed by a factor of
four; under explicit search they differ only when a user refines a query, which
makes the discrepancy small but does not remove it. Counting distinct session
tokens per window is the correct fix and is deliberately **not** in this
decision: it needs a schema change, and the change above removes the urgency
that would have justified doing both at once.

**Anything relying on suggestions appearing without a press breaks.** Nothing
did. `usePlaceSearch` had exactly one caller.
