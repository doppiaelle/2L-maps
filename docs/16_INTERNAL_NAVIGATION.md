# 16 — Navigation Handoff

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [ADR-0004](adr/0004-external-navigation-handoff.md) · [`03_USER_JOURNEYS.md`](03_USER_JOURNEYS.md) · [`18_PERMISSIONS.md`](18_PERMISSIONS.md)

---

> **Scope note.** This document retains the filename `16_INTERNAL_NAVIGATION.md` from the
> original document plan, but the product performs **no internal navigation**. It specifies
> the orchestration of handoff to external navigation applications, and records in-app
> navigation as an evaluated and rejected option with the conditions that would reopen it
> ([ADR-0004](adr/0004-external-navigation-handoff.md)).

---

## 1. Purpose

The product ends at the handoff. This document specifies how an optimized route becomes a
sequence of navigation sessions in Google Maps, Waze or Apple Maps, and how the app tracks
progress across those sessions.

Handoff is not a fallback in this architecture — it is the delivery mechanism, and it is
structurally more complex than it first appears because **no external application accepts a
complete multi-stop route**.

## 2. Goals

1. Deliver the optimized order into whichever navigation app the user already trusts.
2. Extract the maximum each provider allows — chunks of about nine for Google Maps, single
   destinations elsewhere.
3. Make the return to the app instant and single-decision, since it happens at every stop.
4. Survive process death mid-route without losing progress.
5. Never claim a capability a provider does not have.

**Non-goals.** No turn-by-turn guidance, no voice, no rerouting, no in-app map matching.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Provider capability matrix | `NavigationProvider` facade | Versioned; the single source for what each app accepts |
| URL construction | Per-provider `HandoffStrategy` | One strategy per provider |
| Installed-app detection | Client, via build-time declarations | iOS `LSApplicationQueriesSchemes`, Android `<queries>` |
| Progress state | Zustand + persisted store | Must survive process death |
| Arrival detection | Manual (MVP) · geofence (opt-in, 1.3) | See [`18_PERMISSIONS.md`](18_PERMISSIONS.md) |

---

## 4. Provider capability matrix

**The authoritative table.** Everything in this document follows from it.

| Provider | Stops per handoff | Mechanism | Notes |
|---|---|---|---|
| **Google Maps** (universal link) | **~9 waypoints**, 2,048-character URL ceiling | `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=A\|B\|C&travelmode=driving` | The only provider accepting multiple stops. Opens the app when installed, the web otherwise |
| **Google Maps** (iOS scheme) | 1 destination | `comgooglemaps://?daddr=…&directionsmode=driving` | No waypoint support; the universal link is preferred on iOS |
| **Waze** | **1 destination** | `waze://?ll=<lat>,<lng>&navigate=yes` | Coordinates only, no address string. Strictly leg-by-leg |
| **Apple Maps** | **1 destination** | `maps://?saddr=…&daddr=…&dirflg=d` | No multi-stop support in the URL scheme |
| **Web fallback** | ~9 waypoints | Google Maps universal link in the browser | Always available; requires no installed app |

Two constraints bound every strategy: the **URL length ceiling**, which limits stops well
before the waypoint count does when addresses are long, and the fact that **Waze accepts
coordinates but not addresses**, which means a stop whose coordinates have expired must be
re-hydrated before a Waze handoff can be built.

---

## 5. Text diagrams

### Handoff orchestration

```
  optimized route (12 stops)
            │
            ▼
  ┌─────────────────────┐
  │ provider preference │  remembered; first run asks
  └──────────┬──────────┘
             │
   ┌─────────┴──────────┐
   │  installed?        │  iOS: canOpenURL, schemes pre-declared
   └─────────┬──────────┘  Android: queries element in manifest
             │
   ┌─────────▼──────────────────────────────────┐
   │  strategy = capability(provider)            │
   └─────────┬───────────────────────┬───────────┘
       chunked │                     │ leg-by-leg
             ▼                       ▼
  ┌────────────────────┐   ┌────────────────────┐
  │ Google Maps        │   │ Waze / Apple Maps  │
  │ stops 1–9 in one   │   │ stop 1 only        │
  │ handoff            │   │                    │
  └─────────┬──────────┘   └─────────┬──────────┘
            │                        │
            ▼                        ▼
      user drives                user drives
            │                        │
            ▼                        ▼
  ┌───────────────────────────────────────────┐
  │  return to app → one screen, two actions  │
  │        [ Done ]        [ Skip ]           │
  └─────────┬─────────────────────────────────┘
            │
            ▼
   next stop, or next chunk, or route complete
```

### Chunking

Google Maps takes about nine waypoints, so a 12-stop route becomes two handoffs.

```
  route:  origin → S1 S2 S3 S4 S5 S6 S7 S8 S9 S10 S11 S12

  chunk 1:  origin  →  S1…S8  →  destination S9
                                        │
                       user drives eight stops in one session
                                        │
  chunk 2:      S9   →  S10 S11  →  destination S12
                ▲
                └── the previous chunk's destination becomes
                    the next chunk's origin, so no gap appears
```

The overlap is deliberate: chunk *n*'s destination is chunk *n+1*'s origin, so the route is
continuous and the user is never asked to navigate from a position the app did not send them
to. Chunk size is computed from the URL length ceiling, not from a fixed count — nine is the
typical result with Italian addresses, not a constant.

---

## 6. Flows

**Flow A — first handoff.**
Trigger: the user taps **Start** on an optimized route.
1. If no preference is stored, present the providers actually installed. One tap chooses and
   remembers.
2. Build the handoff for the current position in the route using the provider's strategy.
3. Persist route progress **before** opening the external app — the app may not be resumed.
4. Open the URL.
Terminal: external app opened · no provider available, web fallback used · URL construction
failed (a defect; alert and fall back to the web link).

**Flow B — return and advance.**
Trigger: the app returns to the foreground with a route in progress.
1. Restore progress from the persisted store.
2. Show the current stop with exactly two actions: **Done** and **Skip**.
3. **Done** marks the stop completed and advances. **Skip** moves it to the end of the route
   without disturbing the order of the rest.
4. If the next stop is inside the current chunk, offer handoff again; if the chunk is
   exhausted, build the next chunk.
Terminal: advanced · route complete · user leaves the app again.

**This flow runs dozens of times a day.** It must be reachable in zero navigation steps — the
app returns directly to it, never to a home screen the user must navigate from.

**Flow C — process death.**
Trigger: the app is killed while the user is in the external navigation app.
1. On next launch, progress is restored from persistent storage.
2. The app opens directly on Flow B for the stop the user was navigating to.
3. No data is lost, and no confirmation is required.

**Flow D — provider unavailable mid-route.**
Trigger: the preferred app is uninstalled, or its scheme is rejected.
1. Detection at handoff time, not at startup — the state can change while the app is
   backgrounded.
2. The provider is removed from the list and the user is offered the alternatives.
3. The web universal link is always present and always works.

---

## 7. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0004](adr/0004-external-navigation-handoff.md) | No in-app navigation; multi-provider handoff | This entire document |
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps` remains available because the Navigation SDK is excluded | Map |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates may be absent, so Waze handoffs may require re-hydration | Handoff construction |

**Decision made here:** chunk size is derived from the URL length ceiling at construction
time, never hard-coded. Address lengths vary enough between countries that a fixed count would
silently truncate.

## 8. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | No navigation app installed | Web universal link, which always works. Never a dead end |
| 2 | Only Waze installed | Leg-by-leg for the whole route; no capability is claimed that Waze lacks |
| 3 | Stop coordinates expired and Waze is preferred | Re-hydrate from `place_id` before constructing the URL — Waze needs coordinates |
| 4 | URL exceeds 2,048 characters | Chunk size reduced until it fits. Recomputed per chunk, since address lengths vary |
| 5 | User returns without moving | Stop remains current; no arrival is inferred. Manual progression only in the MVP |
| 6 | User marks a stop Done out of order | Allowed. Real routes deviate; the app does not argue with the driver |
| 7 | Every remaining stop is skipped | Route completes; skipped stops are recorded distinctly from completed ones |
| 8 | App killed during navigation | Progress restored to the exact stop ([`11_STATE_MANAGEMENT.md`](11_STATE_MANAGEMENT.md)) |
| 9 | User edits the route mid-drive | Remaining stops re-optimized from the current position; completed stops excluded |
| 10 | Deep link rejected by the OS | Fall back to the web link and record the failure — this is likely a declaration defect |
| 11 | Provider installed but its scheme is undeclared on iOS | The provider is invisible. **A build-time defect**, not a runtime condition — caught by the checklist in §11 |
| 12 | Route has one stop | Single handoff, no chunking, no progression UI |

## 9. Error handling

| Failure | Detection | User-facing result | Retry | Fallback |
|---|---|---|---|---|
| Provider not installed | `canOpenURL` / package query | Provider absent from the list | No | Other providers, then web |
| URL construction fails | Strategy validation | Generic message; **full detail to Sentry** — our defect | No | Web link |
| URL too long | Length check before opening | Invisible: chunk size reduces automatically | Automatic | Single-stop handoff |
| Coordinates missing for Waze | Pre-flight check | Brief re-hydration, then handoff | Automatic | Google Maps by address |
| External app fails to open | OS callback | "Couldn't open Waze", alternatives offered | Manual | Other provider or web |
| Progress store corrupted | Read validation | Route reloaded from the server; progress lost with an explanation | No | Restart the route |

## 10. Best practices

1. **Persist progress before opening the external app.** The app may never be resumed. This
   ordering is not optional.
2. **Detect availability at handoff time**, not at startup. Apps are installed and removed
   while backgrounded.
3. **Compute chunk size from URL length**, never from a constant.
4. **Return the user to a decision, not to a screen.** Two buttons, zero navigation.
5. **Never infer arrival in the MVP.** A false "arrived" that advances the route is worse than
   requiring a tap.
6. **Declare only the schemes actually used.** iOS caps `LSApplicationQueriesSchemes` at 50 and
   App Review questions unexplained entries.
7. **Record every handoff** — provider, chunk size, stop index — for the funnel in
   [`21_ANALYTICS.md`](21_ANALYTICS.md), with no addresses or coordinates.

## 11. Checklist

- [ ] `LSApplicationQueriesSchemes` declares exactly the providers offered, no more.
- [ ] Android `<queries>` declares the same set.
- [ ] Chunk size computed from URL length, verified with long Italian addresses.
- [ ] Chunk overlap verified — each chunk's destination is the next chunk's origin.
- [ ] Progress persisted before every external app launch.
- [ ] Process death mid-route tested on both platforms.
- [ ] Waze handoff tested with expired coordinates.
- [ ] Web fallback tested with no navigation app installed.
- [ ] Return-to-app lands directly on the Done/Skip decision.
- [ ] No capability claimed that the matrix in §4 does not support.

## 12. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Provider matrix, chunked and leg-by-leg strategies, manual progression, process-death recovery | — |
| 1.2 | Live Activity (iOS) and persistent notification (Android) showing route progress | MVP stable |
| 1.3 | Opt-in geofenced arrival detection | Permission-acceptance data; App Review preparation |
| 3.0 | In-app navigation reconsidered | RN Navigation SDK wrapper at 1.0 **and** map parity — [ADR-0004](adr/0004-external-navigation-handoff.md) |

## 13. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Handoff adopted as the delivery mechanism, not a fallback | Navigation SDK and Maps SDK cannot coexist | Architecture |
| 2026-08-06 | Chunk size derived from URL length rather than fixed at 9 | Address length varies; a fixed count truncates silently | Architecture |
| 2026-08-06 | Automatic arrival detection deferred to 1.3, opt-in | Background location is the highest App Review risk in the product | Product owner |

## 14. Rationale

The design is driven by one constraint that cannot be engineered around: **Apple Maps and Waze
accept a single destination.** Everything else follows. Since the user must return to the app
between stops, the return is optimised to the point of being a single decision — because it is
the interaction that happens most often in the product, dozens of times a day, while the user
is standing beside a van.

Chunking exists to make Google Maps worth choosing. A user who selects Google Maps drives eight
stops before returning, while a Waze user returns after every one. That difference is real, and
it is surfaced honestly rather than hidden: the provider chooser can note which apps support
multiple stops, letting users make an informed choice rather than discovering the difference by
experience.

Persisting progress before launching the external app is the single most important
implementation detail here. The app is backgrounded for the entire drive and may be killed at
any point by the OS. Progress written after the launch — or held only in memory — would be lost
exactly when the user has spent the most effort.

Manual arrival marking in the MVP is a deliberate choice against a more impressive alternative.
Geofenced detection requires background location, which is the most scrutinised permission in
App Review and the one users most often decline. A false positive would advance the route while
the driver is still parking. One tap is cheap; a wrong route position is not.

## 15. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| In-app turn-by-turn via the Navigation SDK | Owns the experience; no return loop; monetizable | Cannot coexist with the Maps SDK; would force rebuilding the planning map on a Beta pre-1.0 component. [ADR-0004](adr/0004-external-navigation-handoff.md) |
| Google Maps only | Simplest; the only multi-stop provider | Waze is strongly preferred by many drivers in the target segment, and fails entirely when Google Maps is absent |
| Send the whole route to Google Maps in one link | One handoff for the entire day | Exceeds both the waypoint limit and the URL ceiling. Not possible |
| Keep the user in-app with a WebView | No app switching; preserves session | Violates the Google Maps terms and delivers a worse navigation experience than the native app |
| Automatic arrival detection in the MVP | Removes the return loop entirely; feels magical | Requires background location — the highest App Review risk and frequently declined. A false positive advances the route wrongly |
| Fixed chunk size of 9 | Simpler; predictable | Long addresses breach the 2,048-character ceiling before nine waypoints, silently truncating the route |
