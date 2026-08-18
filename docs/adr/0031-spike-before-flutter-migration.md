# ADR-0031 — Guidance-kernel spike before the Flutter migration

**Status:** Accepted
**Date:** 2026-08-18
**Deciders:** Product owner
**Related:** ADR-0010, ADR-0013, ADR-0014, ADR-0030

---

## Context

The current client is React Native with Expo. HERE officially supports Android, iOS, and Flutter;
it does not list React Native as a HERE SDK platform. A React Native client would therefore need
project-owned Kotlin and Swift modules even for HERE SDK Explore.

The earlier version of this decision used a spike to compare a React Native bridge with HERE SDK
Navigate through Flutter. Navigate has now been removed from the plan. Flutter remains the target
because it is an official HERE SDK Explore platform and the new guidance engine can be written as
portable, testable Dart rather than split across JavaScript, Kotlin, and Swift.

The new uncertainty is larger than map integration: can a small team build conservative,
high-quality essential guidance from HERE Routing API v8 maneuvers and operating-system location
updates without pretending to reproduce HERE Navigate?

## Decision

Run a timeboxed technical spike before the production Flutter migration. The spike validates the
app-owned guidance kernel; it does not compare production runtimes.

The spike begins only after:

- HERE confirms the planned use is allowed under the selected plan, including the optimization
  path;
- Explore credentials and the exact Flutter package are available;
- the package can reach CI through a private channel.

The spike builds a disposable Flutter vertical slice with:

1. HERE SDK Explore map load and the first custom 2L style on Android and iOS;
2. a Supabase fixture/adapter returning polyline, `turnByTurnActions`, route handle, summary, and
   version metadata;
3. replayable location traces for clean driving, GPS noise, parallel roads, missed turns,
   roundabouts, pauses, jumps, and app interruption;
4. a pure-Dart route projection and along-route progress engine;
5. maneuver selection and staged visual/TTS announcements;
6. confidence states that suppress guidance when position is ambiguous;
7. sustained deviation detection and bounded rerouting;
8. arrival detection, next-leg transition, restoration, and current-leg external handoff;
9. foreground/background behaviour on Android and iOS;
10. measurements for binary size, cold start, first map frame, CPU, memory, battery, GPS cadence,
    API transactions, and false/late/missed maneuver events.

The spike is capped at seven engineering days after prerequisites are available. Five days proved
map/SDK integration in the old plan; the extra two cover the minimum location-replay and safety
evidence required by app-owned guidance.

### Passing thresholds

Exact numeric thresholds are set in the spike PR before code so results cannot move the goalposts.
At minimum, the spike fails if any of these is true:

- a supported target platform cannot render the Explore map reproducibly in CI and on device;
- guidance advances maneuvers on a nearby parallel road without entering an ambiguous state;
- brief GPS noise produces reroute loops;
- a missed turn does not produce either a safe reroute or a visible degraded state;
- restoration can resume a different route/version silently;
- the user can lose both in-app guidance and the current-leg external fallback;
- API use scales with GPS update frequency rather than route/reroute events;
- the product can only pass by adding a Navigate-exclusive capability.

Flutter becomes the production runtime if this spike passes. If it fails, the response is to
reduce the guidance promise, retain external navigation, or change provider/license—not to hide
the failing scenario or grow an unsupported React Native bridge.

## Consequences

**Positive.** The rewrite is validated against the real Explore package and the real hard part:
route following under imperfect location input.

**Positive.** Pure Dart geometry, state machines, replay fixtures, and thresholds can be tested
without moving a vehicle, then verified with controlled road tests.

**Positive.** Removing the React Native comparator keeps the spike focused. Flutter is no longer
being selected for Navigate; it is selected because HERE supports its Explore plugin and the
project wants one cross-platform guidance implementation.

**Negative.** The spike code is intentionally disposable except for fixtures, measurements, and
contracts that are deliberately promoted later.

**Negative.** Passing simulated traces is necessary but insufficient. Production still requires
controlled physical-road testing on both platforms, including poor GPS and background transitions.

**Negative.** Explore does not supply HERE Positioning, map matching, route progress, navigation
events, or offline maps. All behaviour in those areas is ours and must degrade honestly.

## Evidence and references

Checked 2026-08-18:

- [HERE SDK examples and supported platforms](https://github.com/heremaps/here-sdk-examples)
- [HERE SDK Flutter licenses](https://docs.here.com/here-sdk/docs/flutter-introduction-editions)
- [HERE Routing turn-by-turn actions](https://docs.here.com/routing/docs/routing-v8-guidance)
- [HERE Routing rerouting](https://docs.here.com/routing/docs/routing-v8-adjust-route-after-deviation)
- [Migration program and gate checklist](../41_HERE_MIGRATION_PROGRAM.md)

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Rewrite in Flutter immediately | Matches HERE's published Explore support path | Commits before license, package, guidance, and platform evidence |
| Retain a React Native comparator | Answers whether the current UI can survive | No longer tests the principal risk; Explore still has no official RN plugin |
| Build a full React Native bridge | Reuses current UI | Adds two native integration surfaces around a guidance engine that already needs one shared implementation |
| Evaluate only with public examples | No account required | Examples do not prove credentials, package delivery, custom guidance, or this app's lifecycle |
| Test only ideal simulated movement | Fast green result | Misses the exact GPS ambiguity and reroute failure modes that justify the spike |
| Promise feature parity with Navigate | Stronger marketing | The excluded positioning, map-matching, warners, and offline stack cannot be recreated safely in this scope |
