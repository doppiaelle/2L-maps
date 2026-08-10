# ADR-0023 — A leg names the stops it runs between

**Status:** Accepted
**Date:** 2026-08-10
**Amends:** [`docs/33_API_CONTRACTS.md`](../33_API_CONTRACTS.md) §`/optimize` response
**Related:** [ADR-0003](0003-tiered-optimization-cascade.md), [ADR-0007](0007-place-id-durable-coordinates-perishable.md)

## Context

Optimization had never worked. Not intermittently, not for large routes — never,
for anybody, since the endpoint was written.

The client's response schema required `fromStopId` and `toStopId` on every leg.
The server had never sent either. So Zod rejected every 200 the endpoint ever
produced, `ApiClient` reported `MALFORMED_RESPONSE`, the routing adapter
flattened that to `upstream-unavailable`, and the screen said "Could not
optimize. Your stops are unchanged." Upstream had succeeded; the pipeline had
already recorded the usage and spent a unit of the user's monthly allowance. There
was no error anywhere to find, at either end.

Both sides were tested and both passed. `endpoints.test.ts` asserted what the
server builds. `routing-adapter.test.ts` asserted what the client parses — from a
fixture whose author had written the two fields in by hand. A fixture is a
statement of what its author believed the other side sends; only the other side
knows. This is the same blind spot that produced the `locale: null` outage,
mirrored: that one was the request direction, this one the response.

Three spellings of the same fields were in circulation:
`docs/33_API_CONTRACTS.md` said `distanceM` and `durationS`, the client said
`distanceMeters` and `durationSeconds`, the server agreed with the client, and
the two ids existed only in the client and the document.

## Decision

**The server sends the ids, and both are nullable.**

A route can begin somewhere that is not a stop — a saved starting place, or the
device's own position, which has no `place_id` and never will
([ADR-0007](0007-place-id-durable-coordinates-perishable.md)). The first leg of
such a route has no stop to have come *from*, and `null` says exactly that
rather than naming a stop the driver did not start at.

There is a second reason for the nullability, and it is the more important one.
Google returns one leg per hop; if the count ever disagrees with the number of
hops in the journey, **every** attribution after the discrepancy would be shifted
by one. A leg misaligned by one puts the Rome–Milan distance on the hop from the
depot to the first delivery, and nothing on screen would look wrong. So a count
mismatch drops all the ids rather than shifting them: a leg that admits it does
not know which stops it joins is recoverable, and a leg that confidently names
the wrong pair is not.

**The order is still returned in that case.** The ordering is what the user asked
for; withholding a correct route because its segments could not be labelled would
trade the answer for a caption.

## Consequences

**This is a `MAJOR` version bump.** It changes the response shape of an Edge
Function ([`CLAUDE.md`](../../CLAUDE.md) §11). In practice no deployed client
consumed the old shape, because no deployed client could parse it.

**The contract test runs both directions now.** `client-contract.test.ts` builds
the response with the real `optimizeUpstream` and parses it with the real
`createRoutingProvider` through the real `ApiClient`, after `JSON.stringify` —
the same discipline the request half already had, and for the same reason. It
fails on the commit before this one.

**Two schema ceilings moved with it**, both found while looking for why the
screen said what it said, and both fatal on their own:

- `idempotencyKey` was the inputs concatenated and passed 128 characters at three
  stops. It is hashed now, so its length is a constant.
- `stopId` embedded the `place_id` and passed 64 whenever Google identified the
  address with a long id, which is most Italian street numbers. New ids are short
  and generated; the ceiling rises to 128 so drafts saved before the change still
  optimize.

**Schema rejections are logged.** They return before the pipeline runs, so
`request_refused` never fired for them and the likeliest 400 in the product was
invisible in production. The field *names* are logged and never their values: a
name is ours, a value could be an address (`CLAUDE.md` §9 rule 7).
