# ADR-0030 — HERE platform and in-app navigation target

**Status:** Accepted
**Date:** 2026-08-18
**Deciders:** Product owner
**Supersedes when implemented:** ADR-0004, ADR-0005, ADR-0007, ADR-0012, ADR-0021,
ADR-0026, ADR-0027, and ADR-0028 in the location-provider areas they govern

---

## Context

The implemented product plans and saves multi-stop routes, draws a synthetic SVG preview, and
hands driving to an external navigator. Google still supplies server-side address search,
geocoding, routing, and waypoint optimization, while Supabase owns authentication, product data,
quota, and History.

The approved product direction requires a real map in the 2L visual language and full in-app
turn-by-turn navigation, including positioning, voice instructions, rerouting, lanes, warnings,
traffic-aware behaviour where licensed, offline support, and navigation-session restoration. The
external navigator remains only as a small control for the current leg.

This is a provider and product-boundary decision. It is not evidence that HERE credentials,
Navigate rights, or final pricing already exist.

## Decision

HERE becomes the target provider for:

- address and place search;
- geocoding and reverse geocoding;
- routing and multi-stop sequencing/optimization;
- vector map rendering and custom map style;
- positioning and in-app turn-by-turn navigation;
- supported online/offline navigation features.

Supabase remains the product backend and system of record for authentication, profiles,
entitlements, quotas, favourites, routes, History, provider-neutral location records, usage
accounting, and retryable sync. History is never delegated to the map provider.

The mobile app uses HERE SDK Navigate for capabilities that belong on-device. Metered HERE REST
requests continue through Supabase Edge Functions and the existing server-side authorization and
quota pipeline. Domain contracts and persisted rows use internal IDs, not a HERE or Google
identifier as their primary key.

Google location services are removed only after a gated HERE cutover. Google OAuth may remain as
an authentication provider until a separate decision replaces it.

The proprietary HERE SDK package, credentials, quote, and contract are not committed to this
public repository. CI receives the pinned package through an approved private artifact channel.

## Consequences

**Positive.** A single location platform can support the approved branded map and full in-app
navigation. External navigation becomes an escape hatch rather than the primary driving flow.

**Positive.** Keeping Supabase prevents a provider migration from becoming an identity, billing,
History, and entitlement rewrite. Provider-neutral IDs make future changes less destructive.

**Positive.** Disposable test data allows a clean schema reset instead of preserving
Google-shaped records with no business value.

**Negative.** HERE SDK Navigate requires commercial onboarding and a quote. Until it is accepted,
the core navigation target is blocked and its COGS cannot be priced honestly.

**Negative.** Full navigation adds safety, offline-data, background-location, audio, lifecycle,
battery, legal, privacy, and physical-road verification obligations that the planner did not have.

**Negative.** Existing Google-era documentation and ADRs remain true for the current
implementation until each cutover lands. For a time, readers must observe explicit Current/Target
labels.

## Evidence and references

Checked 2026-08-18:

- [HERE SDK examples: Android, iOS, and Flutter support](https://github.com/heremaps/here-sdk-examples)
- [HERE SDK Flutter onboarding and Navigate access](https://docs.here.com/here-sdk/docs/flutter-get-started)
- [HERE SDK Flutter navigation](https://docs.here.com/here-sdk/docs/flutter-navigation)
- [HERE Style Editor](https://docs.here.com/style-editor/docs/style-editor-intro)
- [Migration program](../41_HERE_MIGRATION_PROGRAM.md)

## Alternatives considered

| Alternative | Attraction | Why rejected |
|---|---|---|
| Retain Google location services | Lowest engineering change | Does not satisfy the approved map/navigation direction |
| HERE APIs without HERE SDK | Backend migration can start early | Does not provide full in-app map/navigation |
| Replace Supabase as well | Superficially one fewer vendor | HERE does not replace product identity, History, quota, or relational state |
| Remove Google OAuth now | Complete Google exit | Couples an independent account migration to the highest-risk location change |
| Store History in HERE | Provider consolidation | History is first-party user/product data and must remain portable |
