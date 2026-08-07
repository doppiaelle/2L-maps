# 06 — UX Guidelines

> **Status:** Approved
> **Owner:** Design
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0009](adr/0009-visual-direction.md) · [ADR-0010](adr/0010-mobile-only-scope.md) · [`02_USER_PERSONAS.md`](02_USER_PERSONAS.md)

---

## 1. Purpose

This document states the interaction principles every screen obeys. It is the arbiter when a
design decision is contested: a proposal that violates a principle here is rejected regardless
of how good it looks.

The principles derive from the operating conditions in
[`02_USER_PERSONAS.md`](02_USER_PERSONAS.md) — one hand, a vehicle, sunlight, gloves, time
pressure, constant interruption — rather than from general design taste.

## 2. Goals

1. Hold the three-tap constraint permanently, against feature pressure.
2. Keep every primary control within thumb reach.
3. Make every state designed, including the ones nobody wants to design.
4. Ensure interruption never costs the user work.
5. Keep the interface legible in a moving vehicle in daylight.

**Non-goals.** No tokens ([`07`](07_DESIGN_SYSTEM.md)), no screens
([`08`](08_SCREEN_SPECIFICATIONS.md)), no components ([`09`](09_COMPONENT_LIBRARY.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Principle enforcement | Design review | Blocking, not advisory |
| Tap-count measurement | QA, every release | The number that silently degrades |
| Thumb-reach verification | Design | On a physical device, one-handed |

---

## 4. Text diagrams

### The reach model

```
   ┌──────────────────────────┐
   │  ✗  hard to reach        │   Information only.
   │     one-handed           │   Map, status, attribution.
   │                          │   Never a primary control.
   │  ~~~~~~~~~~~~~~~~~~~~~~  │ ← comfortable thumb arc
   │  ◐  reachable with       │   Secondary controls,
   │     a stretch            │   scrollable content.
   │                          │
   │  ✓  natural thumb zone   │   PRIMARY ACTIONS LIVE HERE.
   │     lower third          │   Optimize. Start. Done.
   └──────────────────────────┘

   This is why the stop list is a bottom sheet and never a
   sidebar, at any screen size (ADR-0010).
```

### The three-tap budget

```
  App open
     │
     ├─ [tap] add stop        ← user input, not overhead;
     │        (repeat)          repeats are not counted
     │
     ├─ [tap 1 of 3] Optimize
     │
     ├─ [tap 2 of 3] Start
     │
     └─ [tap 3 of 3] choose provider  ← first run only;
                                         remembered thereafter

  Steady state after the first run: TWO taps.

  Any new screen on this path must remove an existing one.
  There is no third option.
```

---

## 5. Principles

### P1 — Three taps, permanently

From app open to driving: never more than three taps, and two once the provider is remembered.
This is measured on every release, not estimated. **It is the constraint most likely to erode**,
because every new feature has a plausible reason to add a step.

Consequences that follow: no confirmation dialogs on the critical path; no onboarding tips
after the first run; no interstitial between optimizing and starting; sensible defaults for
every setting so nothing must be configured before first use.

### P2 — One hand, lower third

Every primary control sits in the natural thumb zone. The map occupies the upper region and is
for looking, not touching — with the single exception of tapping a marker, which is a secondary
action with a list equivalent.

This principle is why the stop list is a bottom sheet
([ADR-0010](adr/0010-mobile-only-scope.md)). A side panel puts controls where a thumb cannot
reach while the other hand holds a parcel.

### P3 — Never lose the user's work

The user's stop order, labels and typed input survive every failure, every interruption, every
process death. A network error must never scramble a manually arranged list.

This is the most important principle in the document. A user who loses two minutes of arranging
will not spend two minutes again — they will uninstall.

### P4 — Every state is designed

Loading, empty, error, offline, degraded, quota-exhausted, partial success. A screen without
these is unfinished.

A spinner is not a loading state. A skeleton matching the eventual layout is, because it tells
the user what is coming and prevents the layout shift that makes an app feel broken.

**Progress appears after 1 second, not immediately.** A spinner that appears and vanishes in
200 ms reads as a glitch.

### P5 — Honesty over polish

A degraded (T0) result is labelled as degraded. A stale ETA shows its age. An unreachable stop
is named, not silently dropped. A limit is stated before it is reached, not after it fails.

The user is making driving decisions on this information. A confident wrong answer is worse
than an honest uncertain one.

### P6 — Interruption is the normal case

The phone rings, a customer arrives, the app is backgrounded for forty minutes and killed. Every
screen survives this and returns the user exactly where they were, with no confirmation and no
data loss.

### P7 — Gestures are accelerators, never requirements

Drag to reorder, swipe to delete and drag the sheet all have visible non-gesture equivalents. A
gesture-only action is invisible to a new user and inaccessible to an assistive-technology user.

### P8 — Undo, don't confirm

Destructive actions execute immediately and offer undo. A confirmation dialog costs every user a
tap to protect against a rare mistake; undo costs only the user who made the mistake.

Exception: account deletion, which is genuinely irreversible and confirms explicitly.

### P9 — The map is quiet

The map is background. Content floats above it on surfaces, never directly on tiles. The route
line is the only saturated element on screen ([`07`](07_DESIGN_SYSTEM.md)).

### P10 — Nothing blocks a route in progress

No modal, no dialog, no full-screen takeover while the user is driving a route. Errors during a
route appear as dismissible, non-blocking surfaces at the bottom of the screen.

---

## 6. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0009](adr/0009-visual-direction.md) | Quiet map, one accent, red for alerts only | P5, P9 |
| [0010](adr/0010-mobile-only-scope.md) | Bottom sheet, never a sidebar | P2 |
| [0004](adr/0004-external-navigation-handoff.md) | Handoff creates the return loop | P6 |

**Decided here:** P8 — undo over confirmation — and the 1-second progress delay in P4.

## 7. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | A new feature wants a step on the critical path | Rejected, unless it removes an existing step |
| 2 | An operation completes in under 1 s | No progress indicator at all |
| 3 | User backgrounds mid-optimization | Request continues; the result is applied on return |
| 4 | Undo window elapses while backgrounded | The window pauses while backgrounded and resumes on return |
| 5 | An error occurs during a route | Non-blocking bottom surface; the route continues |
| 6 | Screen reader active | Every gesture has an accessible equivalent (P7) |
| 7 | User has one stop only | Optimize is hidden — there is nothing to optimize |
| 8 | Optimization returns the entry order | Stated positively: "already the fastest order" |
| 9 | Sheet dragged mid-animation | Gesture takes over; animation is interruptible |

## 8. Error handling

| Situation | Presentation | Rationale |
|---|---|---|
| Recoverable error, not driving | Inline, with a retry action | Context is preserved |
| Recoverable error, driving | Non-blocking bottom surface, auto-dismissing | P10 |
| Unrecoverable error | Full-screen state with a clear next action | The user cannot proceed anyway |
| Partial success | Success shown; failures listed separately | P5 — partial success is success |
| Quota or entitlement | Designed state naming the limit and what still works | Never a generic error |

**No error message ever ends without a next action.** "Something went wrong" is a defect.

## 9. Best practices

1. **Count the taps on every release.** It is the only number that degrades without anyone
   noticing.
2. **Test one-handed, on a physical device, standing up.** Desk testing with two hands hides
   every reach problem.
3. **Design the error state before the success state.** The success state gets designed anyway;
   error states get skipped.
4. **Kill the app mid-flow and relaunch** as a routine part of testing every screen.
5. **Prefer removing a step to optimising one.**
6. **When a limit exists, say so before the user reaches it.**
7. **Label degraded results everywhere they appear**, including in history weeks later.

## 10. Checklist

- [ ] Critical path measured at three taps or fewer.
- [ ] Every primary control within the thumb zone, verified one-handed.
- [ ] Loading, empty, error, offline, degraded and quota states implemented on every screen.
- [ ] Skeletons match the eventual layout; no bare spinners.
- [ ] Progress delayed by 1 s.
- [ ] Every gesture has a visible alternative.
- [ ] Destructive actions offer undo rather than confirmation.
- [ ] No blocking dialog can appear during a route.
- [ ] Process death tested at every step of every journey.
- [ ] Every error message ends with a next action.

## 11. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All ten principles enforced | — |
| 1.x | Reorder choreography; Live Activity reduces return-loop friction | Post-launch |
| 1.2 | Optional larger-touch mode for glove use | User feedback from Elena's segment |
| 2.0 | Principles revisited if multi-stop constraints add unavoidable steps | Gate D3 |

## 12. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Ten principles fixed | Project inception | Design |
| 2026-08-06 | Undo adopted over confirmation | A dialog taxes every user to protect against a rare error | Design |
| 2026-08-06 | 1-second progress delay | A flashing spinner reads as a glitch | Design |
| 2026-08-06 | Blocking dialogs forbidden during a route | The user is driving | Design |

## 13. Rationale

Every principle here traces to a physical fact about how the product is used. The three-tap
constraint exists because Marco is in a car with the engine running. The thumb zone exists
because Elena is holding tools. Interruption tolerance exists because both are interrupted
constantly. Honesty exists because both are making driving decisions on what the screen says.

P3 — never lose the user's work — is the principle that would most damage the product if
violated, and it is also the easiest to violate accidentally. Optimistic state updates, naive
error handling and unsaved local state each break it in ways that look fine in testing and fail
on a mobile network in a basement.

P1 is stated as a hard number rather than a principle because principles bend under feature
pressure and numbers do not. "Keep it simple" loses every argument against a specific,
well-argued new screen. "Three taps, and yours would make four" wins.

P8 is the one principle likely to be questioned. Confirmation dialogs feel safer, but they tax
every user on every action to protect against a mistake that is both rare and — with undo —
recoverable anyway. Account deletion is exempted because it is the one action undo cannot
reverse.

## 14. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Confirmation dialogs for destructive actions | Feels safer; conventional | Taxes every user on every action. Undo protects only the user who made the mistake |
| Tab bar as the primary navigation | Familiar; scales to more features | Consumes permanent thumb-zone space for navigation rather than action, and implies more top-level destinations than this product has |
| Onboarding tour on first route | Explains the product; reduces confusion | Adds steps to the critical path at the moment the user is most impatient. The product is simple enough to be self-evident |
| Immediate progress indicators | Feels responsive; conventional | Sub-second flashes read as glitches. A 1 s delay makes fast operations feel instant |
| Automatic optimization on every stop added | Removes a tap; always current | Multiplies cost by stop count and reorders the list under the user's finger |
| Gesture-first interface, minimal chrome | Elegant; modern; more map visible | Invisible to new users and inaccessible to assistive technology. Gestures accelerate; they never gate |
