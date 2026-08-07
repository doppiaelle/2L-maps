# 02 — User Personas

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md) · [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) · [ADR-0002](adr/0002-target-segment-and-monetization.md)

---

## 1. Purpose

This document defines who the product is for, in enough detail that a design or scope
decision can be settled by asking "does this serve Marco?" rather than by preference.

Personas here are constraints, not marketing. Each carries the specific conditions under
which the app is actually used — one hand, moving vehicle, bad light, poor signal, time
pressure — because those conditions determine more design decisions than demographics do.

It does not describe usage flows; those are in [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md).

## 2. Goals

1. Give every persona a decisive question that resolves scope arguments.
2. Record the physical and situational constraints each user operates under.
3. Record what each persona uses today and why it fails them.
4. Define the anti-persona explicitly, so out-of-scope requests are recognisable.

**Non-goals.** Not market sizing, not segmentation for advertising, not a substitute for
talking to real users.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Persona accuracy | Product owner | Revised when contradicted by real usage data |
| Design decisions traced to personas | Design | A decision serving no persona is unjustified |
| Scope arbitration | Product owner | The decisive questions in §6 |

---

## 4. Text diagrams

### Persona weighting

```
                        MVP design weight
  Marco  ████████████████████████████████████  primary — design for him
  Elena  ████████████████████                  secondary — must work well
  Sofia  ████████                              tertiary — must not be blocked
  Luca   ░░░░                                  anti-persona — explicitly not served
```

When personas conflict, Marco wins. When Marco is neutral, Elena decides.

### Shared operating conditions

Every persona uses the app under most of these simultaneously. This is the real design brief.

```
  ONE HAND          the other holds a parcel, a clipboard, a steering wheel
  MOVING            in or beside a vehicle, often about to drive
  BRIGHT LIGHT      windscreen glare, direct sun on the screen
  TIME PRESSURE     between stops, engine running
  POOR SIGNAL       industrial zones, rural roads, underground parking
  INTERRUPTED       a call, a customer, a delivery — the app loses focus constantly
  GLOVES / COLD     winter deliveries, imprecise touch
```

---

## 5. Flows

**How a persona settles a contested decision.** This is the document's only operational
purpose, and it works in one direction:

```
  contested design or scope decision
            │
            ▼
  which persona does it serve?  ──── none ────▶  it is not built
            │
            ▼
  does it serve them in their actual conditions —
  one hand, sunlight, a moving vehicle, divided attention?
            │                          │
           yes                         no
            │                          │
            ▼                          ▼
     accepted                 redesigned for those conditions,
                              not accepted with a caveat
```

**How a persona is revised.** Personas are updated from evidence — support conversations,
analytics against the gates in [`28_ROADMAP.md`](28_ROADMAP.md), interviews — never from
intuition about who *should* be using the product. A persona changed to justify a feature
already decided on is no longer evidence, and the decision log records that distinction.

## 6. Personas

### Marco — the sales agent · **primary**

**43, Bergamo. Sells industrial supplies across Lombardy for a manufacturer.**

Marco visits 6 to 12 customers a day, planned the night before from a CRM export or a
notebook. His territory is fixed but the day's list changes constantly: a customer cancels, a
new lead comes in, a delivery must be squeezed in. He drives his own car and is paid partly on
commission, so an hour saved is money.

Today he plans on paper and enters addresses into Google Maps one at a time, in whatever order
he guessed at breakfast. He knows the order is wrong. He has tried reordering by hand in the
app and given up — it takes longer than driving the extra kilometres.

| | |
|---|---|
| **Stops per day** | 6–12 |
| **Devices** | iPhone, three years old; CarPlay in the car |
| **Uses today** | Google Maps, one destination at a time; addresses in Notes |
| **Fails him because** | Google Maps will not reorder his stops, and caps at 10 |
| **Pays for** | Time. Two fewer hours of driving a week is worth far more than the subscription |
| **Would abandon over** | A wrong ETA that makes him late, or anything requiring more than a minute of setup |

**Decisive question:** *Can Marco go from opening the app to driving in under thirty seconds,
one-handed, in his car, before the engine warms up?*

---

### Elena — the field technician · **secondary**

**35, Bologna. Services and installs heating systems for a regional contractor.**

Elena receives her jobs each morning as a list from dispatch — usually 8 to 15 addresses,
often with a rough priority but no order. Some jobs take twenty minutes, some take three
hours, and the list changes during the day as emergencies come in. She carries tools and works
in basements and boiler rooms where signal disappears entirely.

She retypes the day's addresses into her phone every morning. It takes ten minutes she
resents.

| | |
|---|---|
| **Stops per day** | 8–15 |
| **Devices** | Android, mid-range, rugged case; used with gloves in winter |
| **Uses today** | The dispatch list on paper plus Waze, one address at a time |
| **Fails her because** | Retyping is slow; Waze takes one destination; signal loss breaks everything |
| **Pays for** | Not retyping, and having the list survive a basement with no signal |
| **Would abandon over** | Losing her list when offline, or an import that mangles addresses |

**Decisive question:** *Can Elena import her whole day in one action and keep working when the
signal drops in a boiler room?*

Elena is why list import (FR-08) and the offline contract ([ADR-0008](adr/0008-offline-scope.md))
matter more than they first appear. She is also the reason Android is not a second-class
target.

---

### Sofia — the independent courier · **tertiary**

**29, Napoli. Runs her own last-mile delivery van for e-commerce clients.**

Sofia handles 25 to 40 parcels a day in dense urban streets. Her margins are thin and her
volume is at the top of what the product supports — sometimes past it. She is the most
demanding user and the least profitable.

| | |
|---|---|
| **Stops per day** | 25–40, above the MVP ceiling on her heaviest days |
| **Devices** | Android, phone mount in the van |
| **Uses today** | A free planner with hard limits, plus Google Maps |
| **Fails her because** | Free tools cap at 10–20 stops; paid fleet tools are priced for companies |
| **Pays for** | Fuel and time saved; she calculates the return precisely |
| **Would abandon over** | A stop limit she hits daily, or an optimization slower than her own guess |

**Decisive question:** *When Sofia exceeds 25 stops, does the app tell her honestly and offer
something useful, rather than failing?*

Sofia is deliberately **not** the target ([ADR-0002](adr/0002-target-segment-and-monetization.md)):
above 25 stops the cost per user reaches roughly $18/month against a consumer subscription
price. She is included here because she will download the app anyway, and how the product
handles her determines whether it earns a one-star review or a future upgrade path. She is the
reason the 25-stop limit must be communicated as a plan boundary rather than an error.

---

### Luca — the fleet manager · **anti-persona**

**51, Torino. Manages 14 vans and 14 drivers for a logistics company.**

Luca needs to assign stops across vehicles, watch progress on a dashboard, reassign work
mid-day and produce reports. He would pay far more than Marco.

**He is explicitly not served.** Every feature he needs — multi-vehicle assignment, a web
dashboard, driver accounts, roles, dispatch, B2B invoicing — is a different product built by a
different team shape. Requests matching Luca's profile are recognised and declined rather than
partially accommodated, because half a fleet product serves nobody.

**Decisive question, inverted:** *Does this feature exist only because a Luca asked for it? If
so, it does not belong in this release.*

---

## 7. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | Marco and Elena are the target; Sofia is out of scope; Luca is excluded | Segment, pricing, stop ceiling |
| [0008](adr/0008-offline-scope.md) | Offline covers own data — driven by Elena's basements | Offline behaviour |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only, one-handed — driven by Marco's car | Layout, controls |

## 8. Edge cases

| # | Condition | Expected behaviour | Specified in |
|---|---|---|---|
| 1 | Sofia exceeds 25 stops | Clear explanation of the limit, offer to split into two routes — never a bare error | [`08`](08_SCREEN_SPECIFICATIONS.md) |
| 2 | Elena loses signal mid-day with a route in progress | Full list, order and last ETA remain available; edits queue | [`17`](17_OFFLINE_MODE.md) |
| 3 | Marco is interrupted by a call mid-optimization | State survives backgrounding; he returns to exactly where he left | [`11`](11_STATE_MANAGEMENT.md) |
| 4 | Elena wears gloves | Touch targets meet the 44×44 pt minimum with generous spacing | [`23`](23_ACCESSIBILITY.md) |
| 5 | Marco uses CarPlay | The app does not claim CarPlay support; handoff goes to an app that has it | [`16`](16_INTERNAL_NAVIGATION.md) |
| 6 | A Luca-shaped request arrives in support | Recognised as out of scope; declined with the reason, not queued as a feature | This document |
| 7 | Screen in direct sunlight | Contrast verified outdoors, not only on a desk | [`23`](23_ACCESSIBILITY.md) |

## 9. Error handling

Persona-level failure principle: **the user is driving, so an error must never require
sustained attention.** Every error state is readable in a glance and dismissible with one
thumb. No modal dialog blocks a route in progress ([`../CLAUDE.md`](../CLAUDE.md) §7).

| Failure | Persona most affected | Result |
|---|---|---|
| Optimization fails | Marco | One-line explanation, retry action, previous order preserved |
| Import partially fails | Elena | Successes and failures listed separately; she proceeds with what worked |
| Stop limit exceeded | Sofia | Limit explained with a split-route offer |
| Signal lost mid-route | Elena | Silent degradation to cached data, with a persistent but unobtrusive indicator |

## 10. Best practices

1. **Design for Marco's car, not your desk.** Every interaction is validated one-handed, on a
   real device, ideally in a vehicle.
2. **Elena's list is sacred.** Data loss is the one failure that ends the relationship
   permanently.
3. **Sofia gets honesty, not silence.** An unexplained limit produces a one-star review; an
   explained one produces a future customer.
4. **Luca gets a clear no.** Partial fleet features damage the core product and satisfy nobody.
5. **Test with gloves, in sunlight, with one hand.** These conditions are the brief, not edge
   cases.

## 11. Checklist

- [ ] Every screen validated one-handed on a physical device.
- [ ] Every flow works with the phone mounted in a vehicle.
- [ ] Contrast verified in direct sunlight.
- [ ] Touch targets tested with gloves.
- [ ] Full offline behaviour verified against Elena's scenario.
- [ ] The 25-stop limit communicated as a boundary, never as an error.
- [ ] No feature in the release exists solely for Luca.

## 12. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Marco and Elena fully served; Sofia handled honestly | — |
| 1.x | Elena's import improved; Live Activity for Marco's in-car progress | Usage data |
| 2.0 | Sofia becomes a target via a higher tier with hierarchical chunking | Demonstrated willingness to pay above €20/month |
| 3.0 | Luca reconsidered as a separate product, never as a feature of this one | Strategic decision, not a roadmap item |

## 13. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Personas defined; Sofia set as tertiary, Luca as anti-persona | Cost modelling showed Sofia unprofitable at consumer pricing and Luca a different product | Product owner |

## 14. Rationale

Three personas and one anti-persona, rather than a broad market description, because the
product's viability depends on a narrow bet: that a single professional will pay roughly €10 a
month to stop guessing the order of their stops.

Marco is primary because he represents the largest addressable group with the cleanest
economics — moderate stop counts, high value of time, low API cost. Elena is secondary because
she stresses the two capabilities that would otherwise be under-built: import and offline. Her
basements are the reason the offline contract is specified precisely rather than hand-waved.

Sofia is documented despite being out of scope because ignoring a user who will certainly
arrive is how products acquire bad reviews. Luca is documented because "we could add
multi-vehicle" is the most plausible-sounding way this product could lose focus, and naming
him makes that pull visible.

The operating conditions in §4 do more design work than the personas themselves. One hand,
sunlight, gloves and lost signal are the actual constraints; the personas are how those
constraints are remembered.

## 15. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| A single generic persona | Simpler; less to maintain | Loses the specific tensions — Marco wants speed, Elena wants durability — that resolve real design arguments. |
| Sofia as the primary persona | Highest pain, clearest value, most enthusiastic user | Unprofitable at consumer pricing. See [ADR-0002](adr/0002-target-segment-and-monetization.md). |
| Serving Luca with a "teams" tier | Highest revenue per account | Requires a web dashboard, roles and dispatch. A partial implementation would be worse than none and would divert the MVP. |
| Demographic personas with photos and backstories | Familiar format; good for presentations | Age and hobbies drive no decisions here. Operating conditions and stop counts do. |
