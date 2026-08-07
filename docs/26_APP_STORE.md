# 26 — App Store

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-06
> **Related:** [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md) · [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) · [`18_PERMISSIONS.md`](18_PERMISSIONS.md)

---

## 1. Purpose

This document specifies what App Review will examine, what is most likely to be rejected, and the
justifications and evidence prepared in advance.

**This product has an above-average rejection risk**, concentrated in one place: a free trial
that converts automatically to a paid subscription is the most common rejection cause for
subscription apps (risk C12).

## 2. Goals

1. Pass review on the first submission.
2. Have every likely question answered before it is asked.
3. Keep the store listing truthful — particularly about offline capability.
4. Make resubmission fast if it is needed.

**Non-goals.** No ASO strategy. No paid acquisition.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Submission and review response | Product owner | — |
| Compliance evidence | Product owner | Prepared before submission |
| Metadata and screenshots | Product owner | Both languages |
| Technical declarations | Architecture | Must match behaviour |

---

## 4. Text diagrams

### Risk concentration

```
  REJECTION LIKELIHOOD          GUIDELINE           MITIGATION
  ────────────────────          ─────────           ──────────
  ████████████████  HIGH        3.1.2 trial         pre-written compliant
                                disclosure          paywall; verified each
                                                    submission

  ████████          MEDIUM      5.1.1 permission    in-context requests;
                                justification       nothing at launch

  ████              LOW         2.1 completeness    demo account with an
                                                    active subscription

  ██                LOW         4.2 minimum         the app does something
                                functionality       Google Maps does not

  █                 LOW         5.2.5 trademark     naming decision (C9)
                                                    before submission
```

---

## 5. Flows

**Submission to approval.**

```
  build ──▶ metadata · screenshots · privacy manifest · demo account · review notes
                        │
                        ▼
               App Review ──── approved ──▶ release (manual, not automatic)
                        │
                     rejected
                        │
                        ▼
      which guideline? ──▶ 3.1.2 (trial disclosure) ──▶ paywall copy, prepared below
                       ──▶ 5.1.1 (permissions)      ──▶ purpose strings, prepared below
                       ──▶ other                    ──▶ addressed, then resubmitted
                        │
                        ▼
              response drafted in advance, not improvised under time pressure
```

**Why the response is written before the rejection.** The two most likely rejections are known,
and both are arguments about intent rather than defects. Writing the justification while
building the feature produces a better argument than writing it days into a stalled release.

**Any paywall change re-enters this flow.** Copy touching duration, price, renewal or
cancellation is re-read against Guideline 3.1.2 before it ships — this is the single most likely
cause of rejection for this product (risk C12).

## 6. Guideline 3.1.2 — the primary risk

Everything here must be visible **in the purchase flow itself**, without scrolling and without
following a link:

| Required | Our paywall |
|---|---|
| Subscription title | "2L Maps Pro" |
| Duration | Monthly or annual, clearly labelled |
| Price | "€9.99 per month" — never obscured or de-emphasised |
| Trial duration | "Free for 7 days" |
| **Price after trial and renewal period** | "then €9.99 per month" |
| Automatic renewal stated | "renews automatically unless cancelled" |
| How to cancel | "Cancel anytime in your App Store settings" |
| Terms of service link | Present and functional |
| Privacy policy link | Present and functional |
| Restore purchases | **Visible control on the paywall**, not hidden in Settings |

Full copy in both languages: [`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md).

**The most common rejection pattern** is a paywall where "Free for 7 days" is large and the
recurring price is small, grey or below the fold. Ours states €0-today prominently **and** the
recurring price at equal legibility. The prominence difference is in position, never in
contrast or size that would obscure the price.

**Verified before every submission**, in both languages, by screenshot. An Italian user sees
Italian, and Italian compliance is separately required by consumer law
([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)).

---

## 7. Permissions — Guideline 5.1.1

| Permission | Usage string | Review note |
|---|---|---|
| Location, when in use | "2L Maps uses your location to set your starting point and show your position on the map." | Requested when the first stop is added, not at launch |
| Notifications | "2L Maps notifies you of your next stop while you are on a route." | Requested after the first completed route |
| Location, always | See below | **Not in the MVP** — release 1.3 |

**Background location justification** (prepared for release 1.3, risk C7):

> The app plans multi-stop routes for professional drivers. With the user's explicit opt-in,
> background location detects arrival at each planned stop so the driver does not need to
> interact with the phone while working. The feature is off by default, is enabled only from
> Settings, and the app remains fully functional without it — arrival is otherwise marked
> manually. No location data is transmitted to our servers or to third parties; geofence
> evaluation happens on-device.

**That final sentence must remain true.** If background location data is ever transmitted, this
justification becomes false and the submission posture changes fundamentally.

---

## 8. Review notes and demo account

App Review must be able to use the product fully. The notes accompanying every submission:

> **Demo account:** review@… / (password supplied in App Store Connect)
> This account has an **active subscription** so all features are available without purchasing.
>
> **What the app does:** the user enters several addresses and the app computes the most
> efficient visiting order, then hands off to Google Maps, Waze or Apple Maps for navigation.
> The app does not provide turn-by-turn guidance itself.
>
> **To test the core feature:** add three or more addresses, tap Optimize, observe the order
> change, tap Start.
>
> **Subscription:** 7-day free trial converting to €9.99/month. Trial terms, price, renewal
> period and cancellation are stated on the paywall before purchase.
>
> **Location:** requested only when adding the first stop, to set the starting point. The app
> works fully if declined.

The demo account is **pre-seeded with a saved route and history**, because a reviewer opening an
empty app cannot assess it and may reject under Guideline 2.1 for incompleteness.

---

## 9. Metadata and listing

| Field | Notes |
|---|---|
| Name | **Risk C9 — pending decision.** "Maps" may imply Google affiliation; the terms forbid using Google trademarks |
| Subtitle | States the differentiator: the order is computed, not just displayed |
| Description | **Must not imply offline maps.** Offline means saved routes and lists ([ADR-0008](adr/0008-offline-scope.md)) |
| Screenshots | Both languages; must show real functionality; a paywall screenshot must be compliant |
| Category | Navigation |
| Age rating | 4+ |
| Privacy nutrition label | Must match [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md) exactly |

**Two truthfulness constraints** are worth stating as absolutes: the listing must not claim
offline maps, and it must not claim turn-by-turn navigation. Both would be false, and both are
the kind of false claim that produces a rejection *and* a terms complaint.

---

## 10. Technical requirements

| Requirement | Status |
|---|---|
| `PrivacyInfo.xcprivacy` with required-reason APIs | Declared |
| No tracking, no advertising identifier, **no ATT prompt** | Confirmed |
| Sign in with Apple | **Required** because Google Sign-In is offered |
| Account deletion in-app | **Required**; implemented in Settings |
| iPad support | Scaled iPhone layout; no iPad-specific design ([ADR-0010](adr/0010-mobile-only-scope.md)) |
| Latest SDK and target | Per Apple's current minimum |
| Attribution to Google | Visible at every sheet detent |

Sign in with Apple and in-app account deletion are both hard requirements that cause rejection
when missing, and both are easy to overlook because neither is a product decision.

---

## 11. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0002](adr/0002-target-segment-and-monetization.md) | 7-day trial converting to paid | Guideline 3.1.2 exposure, the primary review risk |
| [0008](adr/0008-offline-scope.md) | No offline maps | Why no storage justification is needed |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only | Device family and screenshot requirements |
| [0004](adr/0004-external-navigation-handoff.md) | External handoff | The `LSApplicationQueriesSchemes` entries, which reviewers question |

**Decided here:** the demo account is seeded with a route that demonstrates the product end to
end, including a handoff. A reviewer who cannot reach the core value in the first minute is a
reviewer who evaluates the paywall in isolation, which is the worst possible framing for it.

## 12. Edge cases

| # | Condition | Response |
|---|---|---|
| 1 | Rejected under 3.1.2 | Reply with a screenshot showing every required element and its position |
| 2 | Rejected under 5.1.1 | The MVP requests only when-in-use, in context; supply the timing |
| 3 | Reviewer cannot reproduce optimization | Demo account is pre-seeded; supply exact steps |
| 4 | Reviewer asks why turn-by-turn is absent | Explain the handoff model; it is deliberate, not incomplete |
| 5 | Rejected under 4.2 minimum functionality | The app does what Google Maps does not: it reorders stops |
| 6 | Trademark question about the name | Resolve C9 **before** submission, not in response to a rejection |
| 7 | Reviewer declines location | The app must work fully — verified in the pre-submission checklist |
| 8 | Expedited review needed | Reserved for a genuine critical defect, never for schedule |

## 13. Error handling

| Failure | Response |
|---|---|
| Rejection | Address the specific guideline cited; never argue a first rejection |
| Repeated rejection on the same point | Request a call with App Review rather than resubmitting again |
| Metadata rejected | Correct and resubmit; metadata does not require a new build |
| Build rejected after release | Halt phased rollout; fix forward |

## 14. Best practices

1. **Re-verify Guideline 3.1.2 before every submission**, in both languages, by screenshot.
2. **Pre-seed the demo account** with a route and history.
3. **Never imply offline maps or turn-by-turn** anywhere in the listing.
4. **Request permissions in context** and verify every denial leaves the app usable.
5. **Answer the question actually asked.** A rejection cites a specific guideline; address it.
6. **Never argue a first rejection.** Comply, ship, and revisit later if it matters.
7. **Resolve the naming question before submitting**, not after a rejection.

## 15. Checklist

Before every submission:

- [ ] Paywall verified against all ten 3.1.2 elements, both languages, by screenshot.
- [ ] Restore purchases visible on the paywall.
- [ ] Terms and privacy links functional.
- [ ] Demo account active, subscribed, and pre-seeded with data.
- [ ] Review notes updated for this version.
- [ ] Usage strings present, specific and localised.
- [ ] Every permission denial verified to leave the app fully usable.
- [ ] Sign in with Apple present.
- [ ] Account deletion functional in-app.
- [ ] `PrivacyInfo.xcprivacy` matches actual collection.
- [ ] No ATT prompt; no advertising identifier.
- [ ] Listing free of offline-map and turn-by-turn claims.
- [ ] Google attribution visible at every sheet detent.
- [ ] Naming decision (C9) resolved.
- [ ] Screenshots current, both languages.

## 16. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| Pre-launch | C9 resolved; demo account seeded; paywall verified | Before first submission |
| MVP | First submission | — |
| 1.3 | Background location justification submitted | Release 1.3 |
| 1.x | Localised screenshots per market | Market expansion |

## 17. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | 3.1.2 identified as the primary rejection risk | Most common cause for trial-based subscription apps | Product owner |
| 2026-08-06 | Background location deferred to 1.3 | Concentrates the highest review risk away from the launch release | Product owner |
| 2026-08-06 | Demo account pre-seeded with data | An empty app cannot be assessed and risks a 2.1 rejection | Product owner |
| 2026-08-06 | Listing prohibited from claiming offline maps | Would be false and would breach the platform terms | Product owner |

## 18. Rationale

The document concentrates on Guideline 3.1.2 because that is where the risk actually is. The app
itself is unlikely to be rejected — it does something clearly useful that Google Maps does not, it
requests few permissions, and it collects little data. The subscription disclosure is the single
place where a well-built app routinely fails review, and it fails for presentational reasons
rather than functional ones.

Pre-seeding the demo account addresses a subtler risk. A reviewer who opens an empty route planner
sees a blank screen with an "add a stop" prompt, and has to type several addresses before the
product does anything. That is a poor first impression at best and a Guideline 2.1 incompleteness
rejection at worst. A seeded account demonstrates the feature in one tap.

The truthfulness constraints on the listing are not only ethical. Claiming offline maps would be
false to users *and* a violation of the Google Maps Platform terms, which prohibit tile caching —
so the same sentence would create two separate problems, one with Apple and one with Google.

Deferring background location to release 1.3 is a scheduling decision made for review reasons. It
is the only element likely to attract sustained scrutiny, and concentrating it in a release that
carries nothing else critical means a rejection costs a feature rather than a launch.

## 19. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Background location in the MVP | Best experience; removes the return loop | Highest review risk placed on the release that must not slip |
| Trial without automatic conversion | Avoids 3.1.2 entirely | Manual conversion collapses subscription rates; the compliant paywall is a solved problem |
| No trial | Simplest compliance | Very few users pay for an unfamiliar tool sight-unseen |
| Empty demo account | Nothing to maintain | Risks a 2.1 rejection and gives a poor first impression |
| Emphasising "offline" in the listing | Attractive to the target segment | Would be false and would breach the Google terms |
| Arguing a first rejection | Faster if you are right | Slower in practice. Comply, ship, revisit later if it still matters |
