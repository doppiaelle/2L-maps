# ADR-0031 — Spike before the Flutter migration

**Status:** Accepted
**Date:** 2026-08-18
**Deciders:** Product owner
**Related:** ADR-0010, ADR-0013, ADR-0014, ADR-0030

---

## Context

The current client is React Native with Expo. HERE officially supports Android, iOS, and Flutter;
it does not list React Native as a HERE SDK platform. The Android and iOS SDKs are native products,
so a React Native client would need project-owned Kotlin and Swift modules plus a JavaScript event
and lifecycle layer.

A Flutter client still means a mobile rewrite in Dart, but it uses HERE's supported Flutter plugin,
which wraps the native SDKs for both platforms. HERE also publishes a Flutter reference
application covering a substantial Navigate feature set.

Neither option should be chosen only from a support matrix. This product must prove navigation
event throughput, foreground/background behaviour, audio, restoration, offline maps, CI package
delivery, styling, performance, and both mobile targets using the exact licensed SDK.

## Decision

Run a timeboxed technical spike before production migration. The expected outcome is Flutter.

The spike builds:

1. a disposable Flutter vertical slice using the pinned HERE SDK package; and
2. a deliberately minimal React Native native-module comparator proving only integration cost,
   lifecycle, event delivery, crash isolation, and build reproducibility.

The Flutter slice must demonstrate on Android and iOS:

- map load and custom style;
- route rendering;
- simulated turn-by-turn guidance;
- voice/maneuver events, rerouting, lanes, and warnings available to the license;
- positioning and background/foreground transitions;
- offline map lifecycle;
- route/session restoration;
- current-leg external navigator handoff;
- measured binary size, cold start, first map frame, CPU, memory, battery, and HERE usage.

The spike is capped at five engineering days after its credentials and package prerequisites are
available. It contains no production schema migration and no attempt to port the whole UI.

Flutter becomes the production runtime if it passes the two-platform and navigation gates without
a blocking commercial or technical defect. A React Native bridge may replace it only by amending
this ADR with measured evidence that the bridge has lower lifecycle and maintenance risk.

## Consequences

**Positive.** The likely rewrite is validated against the real proprietary package before product
code and schema depend on it.

**Positive.** The small React Native comparator answers the practical “can we keep the current
app?” question without turning a proof into an unsupported production platform.

**Negative.** A small amount of spike code is intentionally disposable.

**Negative.** The production mobile feature roadmap pauses behind account and license
prerequisites. Documentation, provider-neutral backend design, and non-SDK prototypes may proceed,
but Navigate cannot be claimed or shipped.

**Negative.** If Flutter passes, most React Native presentation code is rewritten. Supabase
contracts, product logic, design tokens, fixtures, copy, and behaviour specifications should be
ported rather than mechanically translating component code.

## Evidence and references

Checked 2026-08-18:

- [HERE SDK examples and supported platforms](https://github.com/heremaps/here-sdk-examples)
- [HERE SDK for Flutter onboarding](https://docs.here.com/here-sdk/docs/flutter-get-started)
- [HERE SDK Flutter examples and reference application](https://docs.here.com/here-sdk/docs/flutter-examples)
- [Migration program and gate checklist](../41_HERE_MIGRATION_PROGRAM.md)

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Rewrite in Flutter immediately | Matches the published support path | Commits before license, package, platform, and performance evidence |
| Build a full React Native bridge | Reuses current UI | Makes the project owner of every native navigation boundary without official RN support |
| Android native first, iOS later | Fastest single-platform SDK proof | Can discover a fatal cross-platform gap after the architecture is fixed |
| Evaluate only with public examples | No account required | Examples do not prove credentials, licensed features, private package delivery, or this app's lifecycle |
| Keep Expo until the last wave | Minimizes visible churn | Encourages backend and UI contracts that assume the runtime being replaced |
