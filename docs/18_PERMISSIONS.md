# 18 — Permissions

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md) · [`26_APP_STORE.md`](26_APP_STORE.md) · [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)

---

## 1. Purpose

This document specifies every permission and platform capability the app requests, when it is
requested, what happens when it is denied, and the build-time declarations required for each.

Two of these carry real risk: **background location** is the most scrutinised permission in App
Review (risk C7), and **application-scheme queries** are a build-time declaration that silently
breaks the navigation handoff if omitted.

## 2. Goals

1. Request the minimum set, at the moment each is needed.
2. Ensure no journey is blocked by a denial.
3. Get the build-time declarations right the first time.
4. Prepare App Review justifications before they are demanded.

**Non-goals.** No GDPR analysis ([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Request timing | Client | In context, never at launch |
| Denial handling | Client | Every denial has a working alternative |
| Build-time declarations | [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md) | Config plugins |
| Review justifications | [`26_APP_STORE.md`](26_APP_STORE.md) | Pre-written |

---

## 4. Text diagrams

### Permission timeline

```
  first launch      ─── NOTHING REQUESTED ───
                        The user has not yet seen the product.

  first stop added  ─── location, when in use ───
                        "to set your starting point"
                        Denied → origin becomes a searched address.
                        Nothing is blocked.

  first handoff     ─── no permission ───
                        Scheme queries are BUILD-TIME declarations,
                        not runtime prompts.

  route completed   ─── notifications ───
                        "to show route progress"
                        Denied → in-app progress only.

  settings, opt-in  ─── location, always ───
                        For automatic arrival detection.
                        Release 1.3. Never requested automatically.
```

**Nothing is requested at first launch.** A permission prompt before the user has seen any value
is refused far more often, and iOS gives no second chance.

---

## 5. Flows

**How a permission is requested.** Never on launch, always at the moment the user asked for the
thing that needs it.

```
  user takes an action that needs a capability
            │
            ▼
  in-context explanation: what it enables, stated in the user's terms
            │
            ▼
  system prompt ──── granted ────▶ action proceeds
            │
         denied
            │
            ▼
  the action still completes by another route, or its absence is explained
  — never a dead end, never a re-prompt loop
```

**Denial is a supported state, not a failure.** Location denied means the user types a start
address instead of tapping "My location". Every capability in this document has a path that
works without it, because a permission prompt on launch is the single most reliable way to lose
a user before they see the product.

**Granting it has to produce something visible, and for a long time it did not.** "My location"
sets the route's *origin*, which is a field on the draft rather than a stop — a device position
has no `place_id` and a list keyed by one cannot hold it
([ADR-0007](adr/0007-place-id-durable-coordinates-perishable.md)). No screen drew that field, so
tapping the row granted the permission, closed the modal, and changed nothing the driver could
see; it read exactly like a control that does not work. The stop list now opens with a **From**
row naming where the round starts, and the return option beside it reads *"Back to my
location"* when the origin is the device
([`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md) §7).

**Build-time capabilities follow a different flow.** `LSApplicationQueriesSchemes` and the
Android `<queries>` element are declared at build time and cannot be requested later: adding a
navigation provider is therefore a release, not a setting
([`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md)).

## 6. Permissions

### Location — when in use · **MVP**

**Purpose:** set the origin to the user's current position, and show their position on the map.

**Requested:** when the user first adds a stop, with the reason stated in context before the
system prompt appears.

| Platform | Declaration |
|---|---|
| iOS | `NSLocationWhenInUseUsageDescription` — "2L Maps uses your location to set your starting point and show your position on the map." |
| Android | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` |

**On denial:** the origin becomes a searched address. **No journey is blocked.** The app does not
re-prompt; it offers a path to Settings only if the user later taps a control that needs it.

Coarse location is accepted as sufficient — precise location improves the origin but is not
required, and Android 12+ lets users grant coarse only.

### Location — always · **release 1.3, opt-in only**

**Purpose:** geofenced automatic arrival detection, removing the return-to-app step
([`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md)).

**This is the highest App Review risk in the product** (C7). It requires
`UIBackgroundModes: location` on iOS, which reviewers examine closely and reject when the
justification is weak.

| Platform | Declaration |
|---|---|
| iOS | `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]` |
| Android | `ACCESS_BACKGROUND_LOCATION` — requires a separate request after foreground is granted |

**Requested only from Settings**, never automatically, and only after the user has driven at
least one route — so the feature they are enabling is something they have already experienced the
absence of.

**On denial, which is the expected common case:** manual stop progression continues to work
exactly as before. Nothing degrades. The feature is genuinely optional, which is what makes the
justification honest.

**Review justification, pre-written:**

> The app plans multi-stop routes for professional drivers. With the user's explicit opt-in,
> background location detects arrival at each planned stop so the driver does not need to
> interact with the phone while working. The feature is off by default, is enabled only from
> Settings, and the app remains fully functional without it — arrival is otherwise marked
> manually. No location data is transmitted to our servers or to third parties; geofence
> evaluation happens on-device.

That last sentence must remain true. If background location data is ever transmitted, this
justification becomes false and the review posture changes entirely.

### Notifications · **MVP for local, 1.2 for Live Activities**

**Purpose:** local notifications showing route progress and the next stop.

**Requested:** after the first completed route, not before — the user has now experienced the
return loop and understands what the notification would save them.

| Platform | Declaration |
|---|---|
| iOS | `UNUserNotificationCenter` authorisation; `NSSupportsLiveActivities` for 1.2 |
| Android | `POST_NOTIFICATIONS` (Android 13+) |

**On denial:** in-app progress only. Nothing is blocked.

**No marketing or engagement notifications, ever.** The permission is used solely for progress in
an active route. This is both a product decision and what makes the request defensible.

---

## 7. Build-time capabilities

These are **not** runtime permissions. They are declarations that must be correct at build time,
and their absence produces silent failure rather than a prompt.

### Application scheme queries — **the silent failure**

Detecting which navigation apps are installed requires declaring the schemes in advance.

| Platform | Declaration |
|---|---|
| iOS | `LSApplicationQueriesSchemes`: `comgooglemaps`, `waze`, `maps` |
| Android | `<queries>` with the corresponding package names and intent filters |

**If a scheme is undeclared, `canOpenURL` returns false and the provider is invisible** — even
though the app is installed. The user simply never sees Waze as an option, with no error
anywhere. This is a build-time defect that testing on a device with all apps installed will not
catch unless it is specifically checked.

**iOS caps the list at 50 schemes**, and App Review questions unexplained entries. Declare
exactly the providers offered, no more
([`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md)).

### Other declarations

| Capability | Purpose | Notes |
|---|---|---|
| Sign in with Apple | Authentication | **Required by Apple** when any other social sign-in is offered |
| Associated domains | Universal links | Deep links into saved routes |
| In-app purchase | Subscriptions | StoreKit / Play Billing |
| Files | CSV import | Document picker; no broad storage permission needed |

**Photo library and camera are deliberately not requested.** Stop photos are a phase-1.2
consideration and would add a permission and a privacy-manifest entry for a feature nobody has
asked for.

---

## 8. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0004](adr/0004-external-navigation-handoff.md) | External handoff | Why the query schemes list exists, and why it stays short |
| [0008](adr/0008-offline-scope.md) | Offline is your own data | Why no storage permission is needed for map data |
| [0002](adr/0002-target-segment-and-monetization.md) | Single professional | Why background location is opt-in and deferred, not core |

**Decided here:** background location is not requested in the MVP. It would enable automatic
stop completion, and it is the permission most likely to draw a rejection under Guideline 5.1.1
([`26_APP_STORE.md`](26_APP_STORE.md)). The manual and notification-based paths deliver most of
the value at none of the risk.

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Location denied at first prompt | Origin becomes a searched address; no re-prompt; no blocked journey |
| 2 | Location granted, then revoked in Settings | Detected on next use; origin falls back gracefully |
| 3 | Coarse location only (Android 12+) | Accepted; origin uses coarse position |
| 4 | Background location denied after foreground granted | Manual progression continues; feature reported as unavailable, not broken |
| 5 | Notifications denied | In-app progress only |
| 6 | Provisional notification authorisation (iOS) | Accepted; notifications deliver quietly |
| 7 | Navigation app installed but scheme undeclared | **Build-time defect.** Provider invisible with no error — caught only by the §12 checklist |
| 8 | User has no navigation app installed | Web universal link, which needs no declaration |
| 9 | Permission changed while backgrounded | Re-evaluated on foreground, not cached across sessions |
| 10 | Android 13 notification permission on upgrade | Requested at the same in-context moment as a fresh install |

## 10. Error handling

| Failure | Result | Fallback |
|---|---|---|
| Location unavailable (hardware, airplane mode) | Origin falls back to searched address | Manual origin |
| Location times out | Last known position, with its age shown | Manual origin |
| Geofence registration fails | Feature silently reverts to manual progression | Manual |
| Notification scheduling fails | Logged; in-app progress unaffected | In-app |
| `canOpenURL` returns false for a declared scheme | App genuinely not installed; provider hidden | Other providers, web link |

**No permission failure produces a blocking error.** Every one degrades to a working alternative,
which is why the app can honestly claim each permission is optional.

## 11. Best practices

1. **Request nothing at launch.**
2. **Explain in context before the system prompt.** The system prompt is a one-shot resource on
   iOS.
3. **Never re-prompt.** Offer a Settings path only when the user reaches for the feature.
4. **Every denial has a working alternative**, and no journey is blocked.
5. **Verify scheme declarations against a device with the apps installed** — this is the failure
   that testing does not surface on its own.
6. **Declare the minimum.** Every extra entry is a review question.
7. **Keep the background-location justification true.** If data ever leaves the device, rewrite it.
8. **Re-evaluate permissions on foreground**, never cache across sessions.

## 12. Checklist

- [ ] Nothing requested at first launch.
- [ ] Every request preceded by an in-context explanation.
- [ ] Every denial verified to leave all journeys working.
- [ ] iOS usage-description strings written, specific, and localised.
- [ ] `LSApplicationQueriesSchemes` verified on a device with Google Maps and Waze installed.
- [ ] Android `<queries>` verified equivalently.
- [ ] Sign in with Apple present alongside Google Sign-In.
- [ ] Background location off by default and requested only from Settings.
- [ ] Review justification written and matching actual behaviour.
- [ ] No unused permission or scheme declared.
- [ ] Permissions re-evaluated on foreground.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Location when in use; notifications; scheme queries | — |
| 1.2 | Live Activities | Release 1.2 |
| 1.3 | Background location, opt-in | Permission-acceptance data; review preparation |
| 1.2+ | Camera and photos **only if** stop photos ship | Feature demand |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Nothing requested at launch | Pre-value prompts are refused far more often, and iOS gives one chance | Design |
| 2026-08-06 | Background location deferred to 1.3, opt-in | Highest App Review risk; genuinely optional | Product owner |
| 2026-08-06 | Notifications requested after the first completed route | The user has experienced the problem it solves | Design |
| 2026-08-06 | Scheme list restricted to the three providers offered | Every extra entry is a review question | Architecture |

## 15. Rationale

Permissions are requested late and sparingly because each one is a one-shot resource with a
declining success rate the earlier it is asked. A prompt at first launch, before the user has
seen a single optimized route, is asking for trust that has not been earned — and on iOS a
denial is close to permanent, since almost nobody revisits Settings to grant a permission they
already refused.

The design goal that **no denial blocks any journey** is what makes this defensible. Location
improves the origin but a searched address works identically. Notifications improve the return
loop but in-app progress works. Background location removes a tap. Each is genuinely optional,
and stating that in the review justification is honest rather than tactical.

Scheme queries deserve their prominence because they are the most likely thing in this document
to be got wrong. They are invisible in code review, they produce no error, and the failure mode
is a missing option in a picker — which looks like a product decision rather than a defect.
Verifying them on a device with the apps installed is the only reliable check.

Deferring background location to release 1.3 concentrates the highest review risk in a release
that ships nothing else critical. If it is rejected, the release ships without it and nothing is
lost.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Request location at first launch | Origin ready before it is needed; conventional | Highest refusal rate, and iOS effectively gives one chance |
| Background location in the MVP | Removes the return loop entirely; the strongest UX improvement | Highest App Review risk, concentrated in the release that must not be delayed |
| Declare many navigation schemes preemptively | Supports more apps without an update | iOS caps at 50 and reviewers question unexplained entries |
| Marketing notifications | Re-engagement; retention | Would make the notification request harder to justify and is hostile in a working tool |
| Block the origin flow when location is denied | Simpler; one code path | A denial would break the product for users who declined a genuinely optional permission |
| Require precise location | Better origin accuracy | Android 12+ users can grant coarse only; precise is not needed for a starting point |
