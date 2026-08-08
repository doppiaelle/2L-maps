# ADR-0014 — Android-first verification via a CI-built development build

> **Status:** Accepted
> **Date:** 2026-08-07
> **Supersedes:** none. Amends the verification requirements of [`../29_DEFINITION_OF_DONE.md`](../29_DEFINITION_OF_DONE.md)
> **Related:** [ADR-0005](0005-map-engine-and-route-preview.md) · [ADR-0013](0013-implementation-execution-model.md) · [`../25_DEPLOYMENT.md`](../25_DEPLOYMENT.md)

## Context

The specification requires verification on a physical device, both platforms, before a change is
done. That requirement was written without checking what the product owner actually has, and
what they have is an Android phone, no Mac, and no budget for the Apple Developer Program.

Three facts decide this, and one of them corrects an error made earlier in this project.

**Android needs nothing we lack.** `expo prebuild` and Gradle both run on a Linux CI runner, at
the standard minute rate rather than the 10× macOS rate. A build is free and takes minutes.

**iOS cannot be installed on a phone without paying Apple.** A physical install requires a
provisioning profile, which requires the Developer Program. This is Apple's rule and no
architecture avoids it.

**"On a device" and "in your hands" are not the same thing, and conflating them produced a wrong
recommendation.** An iOS *simulator* build needs no paid account — only macOS to compile it —
and can be streamed to a browser and operated by hand. That option was initially presented as
impossible. It is not, and the record should say so.

It was nonetheless declined, because with an Android phone available the development build is
strictly better: a real device, real GPS, real installed navigation apps, and no third-party
streaming service or minute allowance in the loop.

## Decision

**Verification is Android-first, on a physical device, through a development build produced by
CI.**

1. **The app stays one cross-platform codebase.** No iOS code is removed and no iOS capability is
   dropped. React Native and the facades already make this free; deleting iOS support would cost
   more to reinstate later than keeping it costs now.
2. **CI produces an Android development build** as a downloadable artifact. It is installed once,
   after which every change arrives over the local network the way Expo Go works — QR code,
   instant reload, no rebuild.
3. **iOS is explicitly unverified**, and says so in the documents rather than being quietly
   assumed to work. It is verified and released when a Mac or the Developer Program exists.
4. **Two requirements are marked unverifiable rather than weakened**: handoff to installed
   navigation apps on iOS, and the performance budgets on an iPhone. Both keep their thresholds;
   neither is claimed as met.
5. **Expo Go remains unusable**, and the reason is sharper than "native modules". Detecting which
   navigation apps are installed depends on build-time manifest declarations
   (`LSApplicationQueriesSchemes`, Android `<queries>`) which Expo Go cannot carry, because it
   ships its own manifest. In-app purchases need native configuration it does not have either.
   Those are the product's two edges, so a container that cannot express them cannot verify it.
6. **EAS Build is not used.** Gradle on GitHub Actions produces the same artifact with no monthly
   build ceiling and no subscription, which removes a fixed cost from the model.

## Consequences

**Positive.** Verification happens on real hardware, with real GPS, real network conditions and
real navigation apps installed — the conditions the product actually runs in. It costs nothing
and needs no third-party service. Dropping EAS removes $19/month from the fixed costs and the
15-builds-a-month ceiling.

**Negative.** Half the target platform is unverified for as long as this holds. That is a real
risk and is recorded as one rather than absorbed silently: an iOS defect will be found later and
more expensively than an Android one.

**Neutral.** The CI keystore's SHA-1 must be registered against the Google Maps Android key
alongside the release keystore's. This is the failure that produces a grey map with no error
message, and it is the kind of thing discovered at the worst possible moment if it is not written
down first ([`../25_DEPLOYMENT.md`](../25_DEPLOYMENT.md)).

**Deferred.** iOS verification, App Store submission, and the performance budgets on iPhone. Each
opens on a stated condition rather than a date.

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| iOS simulator streamed to a browser | Restores iOS to hands-on verification with no Apple payment | Genuinely viable, and was wrongly presented as impossible at first. Declined because a simulator has no installed navigation apps — so the handoff, the product's exit path, still cannot be verified — and because an Android phone gives a strictly better test for free |
| Expo Go | Simplest possible loop, and familiar | Cannot declare the query schemes that make provider detection work, and cannot do in-app purchases. It would verify the middle of the product and neither of its edges |
| EAS Build | Fewer native details to maintain; the documented path | Adds a subscription and a monthly build ceiling for an artifact Gradle produces free on Linux |
| Release APK downloaded per change | No dev-client dependency | A full reinstall for every change, instead of a QR code. The development build costs one extra dependency and removes that friction permanently |
| Drop iOS from the MVP entirely | Least code, least ambiguity | Reinstating a platform costs far more than keeping a cross-platform codebase that already compiles for it |
| Lower the performance budgets to what a simulator can measure | Keeps every gate green | The numbers would be true and meaningless. Simulators do not throttle and have no real GPU, which the performance document already says |
