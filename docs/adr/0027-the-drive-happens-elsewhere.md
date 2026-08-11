# ADR-0027 — The drive happens elsewhere, so the app stops pretending to watch it

**Status:** Accepted
**Date:** 2026-08-11
**Amends:** [ADR-0004](0004-external-navigation-handoff.md) — not the decision, its consequences
**Supersedes:** J2 and J3 in [`docs/03_USER_JOURNEYS.md`](../03_USER_JOURNEYS.md)
**Related:** [ADR-0022](0022-one-route-section.md), [ADR-0003](0003-tiered-optimization-cascade.md)

## Context

[ADR-0004](0004-external-navigation-handoff.md) decided that this product does
not navigate. It orders stops and hands the day to Google Maps, Waze or Apple
Maps. That decision stands and nothing here reopens it.

What was never followed through is what it implies about the rest of the day.
J2 ([`docs/03_USER_JOURNEYS.md`](../03_USER_JOURNEYS.md)) described the driver
returning to this app **between every stop** to press **Done** or **Skip**, and
named that "the cost of external handoff". J3 described the final Done producing
a summary — stops completed, distance, time, and *time saved against the entry
order* — and moving the route to History.

Two things are wrong with that, and the second one is why this is an ADR rather
than a bug fix.

**Nobody comes back between stops.** Google Maps accepts up to about nine
waypoints in one handoff and drives the whole sequence itself: it announces the
next stop, re-routes around traffic, and carries on when one is reached. A driver
following it has no reason to reopen this app, and — since the phone is in a
cradle and the van is moving — no safe moment to. The two buttons were pressed by
nobody, and every state that depended on them was therefore never reached.

**Which took History with it.** The route only moved out of `in_progress` when
the last stop was marked, so no route ever reached `completed`; and because
`useHandoff` recorded progress against `stops[0].id` rather than the route's own
id, the record named a stop and matched no route at all. The product owner's
report — *"una route già avviata deve essere salvata nella history in automatico
e ora non avviene"* — is the visible end of both defects.

**And it took the product's one number with it.** "You saved 41 minutes today"
was, by J3's own words, *"the only moment the product proves its value
numerically"*. It has never been shown to anyone.

## Decision

**The per-stop loop is removed.** Done and Skip are gone, `StopProgressState`
reduces from four values to two, and `RouteProgress` stops being a map of marks.

**A route's state is what we can honestly observe.** One thing is observable from
inside this app: that the driver pressed Confirm and a navigation app was opened.
That is recorded — the route id and an instant — and it is what moves the route
to `in_progress` and therefore into History.

**A route is completed by the next route.** Nothing inside a route can finish it,
so the driver reaching for the next day is the signal. Only a route that was
actually handed over is closed this way; one that was optimized and abandoned was
never driven, and marking it completed would put a day in History that did not
happen.

**Time saved is withdrawn, not estimated.** The specification is unambiguous that
it must be *"a true computed difference, never an estimate"*
([`docs/03_USER_JOURNEYS.md`](../03_USER_JOURNEYS.md),
[`docs/08_SCREEN_SPECIFICATIONS.md`](../08_SCREEN_SPECIFICATIONS.md) §7), and
`baseline_duration_s` exists in the schema for exactly that measurement. Getting
it honestly costs a **third** `computeRoutes` request per optimization — over the
entry order, at the same `routingPreference` as the second, or the two numbers
are not comparable — which raises the cost of the product's most expensive
action by about half ([`docs/31_COST_MODEL.md`](../31_COST_MODEL.md)). The
product owner declined that trade and specified what the finished route shows
instead: **total duration and total distance, and nothing else.**

**`/summary` is deleted.** It was J3's terminal screen and there is no longer an
event that reaches it.

## What replaces the value it carried

J3's summary was the payoff for a loop that did not run, so removing it costs
nothing that was ever delivered. What the product owner asked for in its place is
about the moment that *does* happen — pressing Optimize and getting an answer:

- **A real loading state between Optimize and the map**, appearing after one
  second, shaped like the result it precedes so nothing moves when the result
  lands (`CLAUDE.md` §7 rule 5).
- **Individual legs inspectable on the canvas.** Distance and duration per leg
  are already in `OptimizeResult.legs` and already paid for by the existing field
  mask; showing them costs no request.

## Consequences

**Good.**

- A started route reaches History, which is the reported defect and the reason
  this was picked up.
- Two writes per route instead of one per stop. `use-route-sync` no longer
  depends on a serialised copy of every mark.
- Every state left in the product is one something can actually reach, so the
  tests that cover them describe a product that exists.
- `PlanState` loses the branch that outranked all the others, and with it the
  reason the stop list was read-only for a user who was not driving.

**Bad, and accepted.**

- **A route can sit in `in_progress` indefinitely.** A driver who sets off on
  Monday and does not plan again until Thursday has a route showing as in
  progress for three days, which suppresses the ad slot and changes the dock's
  emphasis for that whole time. The alternative — closing it at Confirm — would
  claim the day was finished the moment the van pulled out, and a wrong claim is
  worse than a stale one.
- **The product has no number that proves its value.** This is a real loss and it
  is the product owner's decision, taken with the cost stated. `baseline_duration_s`
  stays in the schema, unused and documented as reserved, so reversing this is one
  upstream call rather than a migration.
- **We never learn whether a route was actually driven.** Every route handed over
  looks the same as every other, whether the driver completed it or turned back
  after one stop. Nothing in the product needed to know, and asking would have
  meant asking the driver.

## What was rejected

| Option | Why not |
|---|---|
| Keep Done/Skip for the drivers who do come back | Two controls maintained, tested and shown to everyone for a path almost nobody takes — and they are the first thing on screen when the driver returns, which is when they are least wanted |
| Estimate time saved from straight-line distance | The specification forbids exactly this. An inflated number found to be false destroys trust in the honest ones beside it |
| A third Routes call to measure it properly | Correct, and about +50% on the cost of an optimization. Declined by the product owner |
| A "Finish" control in History | One more button nobody presses, for the same reason there is no Save button |
| Close the route at Confirm | Simpler, and asserts the day is over when it has just started |
