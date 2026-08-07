# 10 — Navigation Flow

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`05_INFORMATION_ARCHITECTURE.md`](05_INFORMATION_ARCHITECTURE.md) · [`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md) · [`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md)

---

> **Terminology.** "Navigation" here means **in-app screen routing** via Expo Router. Driving
> guidance is *handoff*, specified in
> [`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md). The two are unrelated
> ([`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) §7).

---

## 1. Purpose

This document specifies the Expo Router structure: route files, groups, modal presentation,
deep links, guards, and how navigation state survives process death.

## 2. Goals

1. Keep the critical path free of any navigation transition.
2. Make every launch scenario land on the correct screen with no flicker.
3. Guard authenticated and entitled routes without blocking the user's own data.
4. Resolve deep links to a working surface rather than a viewing surface.

**Non-goals.** No screen content ([`08`](08_SCREEN_SPECIFICATIONS.md)), no application state
([`11`](11_STATE_MANAGEMENT.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Route structure | This document | Mirrors [`05`](05_INFORMATION_ARCHITECTURE.md) |
| Guards | Root layout | Auth and entitlement |
| Deep-link resolution | Root layout | Always resolves to Plan |
| Restoration | Persisted store | Survives process death |

---

## 4. Text diagrams

### Route tree

```
  app/
   ├── _layout.tsx              root: providers, guards, restoration
   │
   ├── (auth)/                  group: signed out only
   │    ├── _layout.tsx
   │    └── sign-in.tsx
   │
   └── (app)/                   group: signed in
        ├── _layout.tsx         entitlement context, not a hard gate
        ├── index.tsx           PLAN — the default route
        ├── history.tsx
        ├── settings.tsx
        │
        └── (modal)/            presented modally
             ├── add-stop.tsx
             ├── import.tsx
             ├── provider.tsx
             ├── paywall.tsx
             └── summary.tsx

  Depth never exceeds 3. The critical path stays on index.tsx.
```

### Launch decision

```
  cold start
      │
      ▼
  restore persisted state ──▶ hydrated?
      │                          │ no → splash held, no flicker
      ▼
  signed in? ──no──▶ (auth)/sign-in
      │ yes
      ▼
  route in progress? ──yes──▶ (app)/index  in-progress mode
      │ no
      ▼
  deep link pending? ──yes──▶ (app)/index  with that route loaded
      │ no
      ▼
  (app)/index  empty or last draft
```

**The splash is held until restoration completes.** Rendering an empty Plan and then swapping in
a restored route produces a visible flash that reads as a bug.

---

## 5. Structure

### Groups

`(auth)` and `(app)` are mutually exclusive: the guard swaps the group rather than pushing a
screen, so no signed-out user can ever have an app screen beneath them in the stack.

`(modal)` is a presentation group, not a hierarchy level. Modals appear over Plan and dismiss
back to it, never adding depth.

### Presentation

| Screen | Presentation | Reason |
|---|---|---|
| Plan | Root, no transition | Never navigated to |
| History, Settings | Push | Deliberate destinations |
| Add stop, Import, Provider | Modal, sheet-style | Input tasks over the current context |
| Paywall | Modal, **not dismissible by swipe** | Requires a deliberate action; the route survives beneath |
| Summary | Modal, full | Terminal moment of a journey |

### Guards

| Guard | Applies to | Behaviour on failure |
|---|---|---|
| Authentication | Everything in `(app)` | Replace with `(auth)/sign-in`; never push |
| Entitlement | **Metered actions only, never routes** | Paywall presented modally; the current screen stays intact |

**Entitlement is not a route guard.** An expired user reaches Plan, History and Settings
normally — only optimization is blocked ([`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) J7). The
user's own data is never held hostage.

### Deep links

| Link | Resolves to |
|---|---|
| `2lmaps://route/{id}` | Plan with that route loaded |
| `2lmaps://history` | History |
| `2lmaps://settings/subscription` | Settings → Subscription |
| Unknown | Plan, silently |

**A route deep link opens Plan, not a detail screen** — the user wants to work on it
([`05`](05_INFORMATION_ARCHITECTURE.md)).

Deep links received while signed out are held, sign-in is presented, and the link resolves
afterwards rather than being discarded.

---

## 6. State across navigation

| State | Survives | Mechanism |
|---|---|---|
| Current route and stop order | Process death | Persisted store |
| Route progress | Process death | Persisted, **written before every handoff** |
| Sheet detent | Background, not process death | In-memory |
| Map camera | Background, not process death | In-memory |
| Scroll position | Detent change and modal dismissal | Preserved by list |
| Pending deep link | Sign-in flow | Held in the root layout |
| Modal input in progress | Background | Draft retained on return |

Sheet detent and camera are deliberately not persisted: after a cold start, fitting the camera
to the route is more useful than restoring where the user last panned.

## 7. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Cold start with a route in progress | Plan in progress mode at the correct stop, no intermediate render |
| 2 | Deep link while signed out | Held; resolved after sign-in |
| 3 | Sign-out with modals open | Modals dismissed; group replaced, not pushed |
| 4 | Paywall dismissed without purchase | Returns to the previous screen; the route is intact |
| 5 | Back pressed on Plan (Android) | Backgrounds the app; never exits to a blank state |
| 6 | Back pressed inside a modal | Dismisses the modal only |
| 7 | Deep link while a different route is in progress | Resumption of the in-progress route is offered first |
| 8 | Rotation | State preserved; layout reflows |
| 9 | Session expires while the app is open | Token refresh attempted silently; only a hard failure returns to sign-in |
| 10 | Notification tap during a route | Opens Plan in progress mode, not a new screen |

## 8. Error handling

| Failure | Result | Fallback |
|---|---|---|
| Restoration fails | Plan empty state, with an explanation that the previous route could not be restored | Empty Plan |
| Deep link malformed | Plan, silently; logged | Plan |
| Deep link route not found or not owned | Plan with an explanation | Plan |
| Guard evaluation throws | Treated as signed out; fail closed | Sign-in |
| Modal fails to mount | Error state within the modal; the underlying screen is unaffected | Dismiss |

**Guards fail closed.** An error evaluating authentication is treated as unauthenticated.

## 9. Best practices

1. **Hold the splash until restoration completes.**
2. **Replace groups, never push across them.**
3. **Entitlement gates actions, not routes.**
4. **Deep links land on the working surface.**
5. **Persist progress before every handoff** — the app may not be resumed
   ([`16`](16_INTERNAL_NAVIGATION.md)).
6. **Modals never stack.** Opening one from another dismisses the first.
7. **Guards fail closed.**

## 10. Checklist

- [ ] Critical path involves no navigation transition.
- [ ] Every launch scenario verified with no intermediate render.
- [ ] Deep links verified signed in, signed out, and with a route in progress.
- [ ] Auth guard replaces rather than pushes.
- [ ] Entitlement verified to block actions only, never routes.
- [ ] Process death tested at every step of every journey.
- [ ] Android back verified on every screen.
- [ ] Modals verified not to stack.

## 11. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Full tree, guards, deep links, restoration | — |
| 1.2 | Live Activity deep link into progress mode | Release 1.2 |
| 1.x | Universal links for shared routes | Sharing feature |
| 2.0 | No structural change expected | — |

## 12. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Entitlement gates actions, not routes | The user's own data is never held hostage | Product owner |
| 2026-08-06 | Route deep links resolve to Plan | The user wants to work on the route, not view it | Design |
| 2026-08-06 | Splash held until restoration | Avoids a flash that reads as a bug | Architecture |
| 2026-08-06 | Camera and detent not persisted | Fitting the route beats restoring a stale pan | Design |

## 13. Rationale

The structure exists to make navigation invisible. The critical path — add, optimize, start —
happens entirely on one route, so the fastest interaction in the product involves no transition
at all. Everything else is a deliberate detour the user chose.

Making entitlement an action gate rather than a route guard is a product decision expressed in
routing. A route guard would be simpler to implement and would lock an expired user out of their
own saved routes, converting a lapsed subscriber into a hostile former user. The marginal
conversion pressure is not worth it.

Holding the splash until restoration is a small detail with outsized perceptual impact. An app
that renders empty and then fills in looks broken, and this app restores state on nearly every
launch because routes span days.

## 14. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Tab navigator with three tabs | Familiar; discoverable | Consumes permanent thumb-zone space for navigation rather than action; implies three equal activities |
| Stop list as a pushed screen | Simpler than sheet mechanics | Loses the map, breaking the link between order and geography |
| Entitlement as a route guard | Simpler; stronger conversion pressure | Locks users out of their own data and creates hostility |
| Route deep links to a read-only detail screen | Conventional master-detail | Adds a step before the user reaches where they can work |
| Rendering immediately, restoring after | Faster perceived start | Produces a visible flash that reads as a defect |
