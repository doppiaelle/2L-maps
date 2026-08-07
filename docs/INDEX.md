# Documentation Index

The specification set for **2L Maps** — a multi-stop route optimizer for the single mobile
professional.

**Start here:** [`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) for the product thesis,
architecture and the binding glossary. Then [`../CLAUDE.md`](../CLAUDE.md) before writing any
code.

---

## Reading paths

**"I am about to write code."**
[`../CLAUDE.md`](../CLAUDE.md) §0 → [`00`](00_PROJECT_OVERVIEW.md) §8 glossary → the document
owning your area (see §Areas below) → [`29`](29_DEFINITION_OF_DONE.md).

**"I want to understand the product."**
[`00`](00_PROJECT_OVERVIEW.md) → [`01`](01_PRODUCT_REQUIREMENTS.md) →
[`02`](02_USER_PERSONAS.md) → [`03`](03_USER_JOURNEYS.md) → [`04`](04_FEATURES.md)

**"I want to understand why it is built this way."**
[`adr/`](adr/) in order. Twelve decisions, each with its rejected alternatives.

**"I am responsible for the money."**
[`31`](31_COST_MODEL.md) → [`20`](20_SUBSCRIPTIONS.md) →
[ADR-0002](adr/0002-target-segment-and-monetization.md) →
[ADR-0003](adr/0003-tiered-optimization-cascade.md) →
[ADR-0011](adr/0011-server-side-quota-enforcement.md)

**"I am shipping a release."**
[`25`](25_DEPLOYMENT.md) → [`26`](26_APP_STORE.md) → [`27`](27_PLAY_STORE.md) →
[`29`](29_DEFINITION_OF_DONE.md)

---

## Documents

### Foundation

| # | Document | Answers |
|---|---|---|
| 00 | [Project Overview](00_PROJECT_OVERVIEW.md) | What is this, what is it not, and what do the words mean |
| — | [`CLAUDE.md`](../CLAUDE.md) | The rules all development follows |
| 30 | [Claude Rules](30_CLAUDE_RULES.md) | How the rule system works and how conflicts resolve |
| — | [`_TEMPLATE.md`](_TEMPLATE.md) | The mandatory 14-section structure |
| — | [`README.md`](../README.md) | Repository entry point |

### Product

| # | Document | Answers |
|---|---|---|
| 01 | [Product Requirements](01_PRODUCT_REQUIREMENTS.md) | What must be true for this to ship |
| 02 | [User Personas](02_USER_PERSONAS.md) | Who this is for, concretely |
| 03 | [User Journeys](03_USER_JOURNEYS.md) | How they use it, end to end |
| 04 | [Features](04_FEATURES.md) | What exists, in and out of the MVP |
| 28 | [Roadmap](28_ROADMAP.md) | What comes later and what triggers it |
| 35 | [Risk Register](35_RISK_REGISTER.md) | What could go wrong, who owns it |

### Core technical domain

| # | Document | Answers |
|---|---|---|
| 15 | [Route Optimization](15_ROUTE_OPTIMIZATION.md) | VRP, TSP, the T0–T3 cascade, recalculation |
| 14 | [Google Maps Integration](14_GOOGLE_MAPS_INTEGRATION.md) | Markers, clustering, polylines, styles, layers |
| 16 | [Navigation Handoff](16_INTERNAL_NAVIGATION.md) | External handoff, chunking, leg-by-leg, arrival |
| 31 | [Cost Model](31_COST_MODEL.md) | What every action costs and whether the price works |
| 12 | [Database](12_DATABASE.md) | Tables, relations, indexes, RLS, migrations |
| 13 | [Backend](13_BACKEND.md) | Edge Functions and the seven-step pipeline |
| 33 | [API Contracts](33_API_CONTRACTS.md) | Every endpoint: input, output, errors, limits, retry |

### Experience

| # | Document | Answers |
|---|---|---|
| 05 | [Information Architecture](05_INFORMATION_ARCHITECTURE.md) | How the app is organised |
| 06 | [UX Guidelines](06_UX_GUIDELINES.md) | Interaction principles, three-tap rule, one-handed use |
| 07 | [Design System](07_DESIGN_SYSTEM.md) | Tokens, colour, type, spacing, motion |
| 08 | [Screen Specifications](08_SCREEN_SPECIFICATIONS.md) | Every screen and every state |
| 09 | [Component Library](09_COMPONENT_LIBRARY.md) | Every component: states, a11y, performance |
| 10 | [Navigation Flow](10_NAVIGATION_FLOW.md) | Routes, deep links, transitions |
| 11 | [State Management](11_STATE_MANAGEMENT.md) | Zustand, React Query, offline queue |
| 23 | [Accessibility](23_ACCESSIBILITY.md) | WCAG AA, screen readers, Dynamic Type |
| 34 | [Localization](34_LOCALIZATION.md) | IT/EN, units, address formats |

### Platform

| # | Document | Answers |
|---|---|---|
| 17 | [Offline Mode](17_OFFLINE_MODE.md) | What works without a network, and what honestly cannot |
| 18 | [Permissions](18_PERMISSIONS.md) | Location, notifications, app-scheme queries |
| 19 | [Security](19_SECURITY.md) | Keys, RLS, secrets, rotation, threat model |
| 20 | [Subscriptions](20_SUBSCRIPTIONS.md) | Trial, entitlements, RevenueCat, restore |
| 21 | [Analytics](21_ANALYTICS.md) | Events, funnels, crash reporting, privacy limits |
| 24 | [Performance](24_PERFORMANCE.md) | Budgets and how they are held |
| 32 | [Legal & Compliance](32_LEGAL_COMPLIANCE.md) | Google terms, GDPR, EU auto-renewal law |

### Delivery

| # | Document | Answers |
|---|---|---|
| 22 | [Testing](22_TESTING.md) | Unit, integration, E2E, contract, regression |
| 25 | [Deployment](25_DEPLOYMENT.md) | EAS, Fastlane, GitHub Actions, versioning, rollback |
| 26 | [App Store](26_APP_STORE.md) | Review guidelines, privacy manifest, submission |
| 27 | [Play Store](27_PLAY_STORE.md) | Data Safety, testing tracks, release |
| 29 | [Definition of Done](29_DEFINITION_OF_DONE.md) | When a change is actually finished |

### Architecture Decision Records

| ID | Decision |
|---|---|
| [0001](adr/0001-documentation-language-and-structure.md) | English documentation, 41 files, 14-section template |
| [0002](adr/0002-target-segment-and-monetization.md) | Single professional, 5–25 stops; 7-day trial to paid |
| [0003](adr/0003-tiered-optimization-cascade.md) | Cost-aware cascade T0–T3, not a single engine |
| [0004](adr/0004-external-navigation-handoff.md) | No in-app navigation; multi-provider handoff |
| [0005](adr/0005-map-engine-and-route-preview.md) | `react-native-maps` behind an `<AppMap>` facade |
| [0006](adr/0006-mandatory-backend-proxy.md) | All web-service calls proxied through Edge Functions |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | `place_id` durable; coordinates a 30-day cache |
| [0008](adr/0008-offline-scope.md) | Offline is your own data, never offline maps |
| [0009](adr/0009-visual-direction.md) | Monochrome base, single mint accent, red for alerts only |
| [0010](adr/0010-mobile-only-scope.md) | Mobile only; stop list is a sheet, never a sidebar |
| [0011](adr/0011-server-side-quota-enforcement.md) | Entitlements and quotas enforced server-side only |
| [0012](adr/0012-long-term-osm-exit-path.md) | MapLibre + Valhalla recorded as the exit path |

---

## Areas → owning documents

When changing code, read the owning document and its ADRs first.

| Area | Owning documents | ADRs |
|---|---|---|
| Optimization, tier selection | [`15`](15_ROUTE_OPTIMIZATION.md), [`31`](31_COST_MODEL.md) | 0003 |
| Map rendering, markers, styles | [`14`](14_GOOGLE_MAPS_INTEGRATION.md), [`09`](09_COMPONENT_LIBRARY.md) | 0005, 0009 |
| Navigation handoff | [`16`](16_INTERNAL_NAVIGATION.md), [`18`](18_PERMISSIONS.md) | 0004 |
| Database, migrations | [`12`](12_DATABASE.md) | 0007 |
| Edge Functions, upstream calls | [`13`](13_BACKEND.md), [`33`](33_API_CONTRACTS.md) | 0006, 0011 |
| Billing, paywall, entitlements | [`20`](20_SUBSCRIPTIONS.md), [`26`](26_APP_STORE.md), [`32`](32_LEGAL_COMPLIANCE.md) | 0002, 0011 |
| UI components, styling | [`07`](07_DESIGN_SYSTEM.md), [`09`](09_COMPONENT_LIBRARY.md), [`23`](23_ACCESSIBILITY.md) | 0009, 0010 |
| Screens, flows | [`08`](08_SCREEN_SPECIFICATIONS.md), [`10`](10_NAVIGATION_FLOW.md), [`05`](05_INFORMATION_ARCHITECTURE.md) | 0010 |
| State, offline | [`11`](11_STATE_MANAGEMENT.md), [`17`](17_OFFLINE_MODE.md) | 0008 |
| Release, CI | [`25`](25_DEPLOYMENT.md), [`22`](22_TESTING.md) | — |

---

## Single sources of truth

A number lives in exactly one document. Everywhere else, it is cited. **A figure appearing
twice with different values is a defect**, caught by the consolidation audit.

| What | Lives only in |
|---|---|
| API limits, quotas, timeouts, retry policy | [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) |
| Prices, COGS, margins, break-even | [`31_COST_MODEL.md`](31_COST_MODEL.md) |
| Schema, indexes, RLS policies | [`12_DATABASE.md`](12_DATABASE.md) |
| Design tokens, type scale, contrast ratios | [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) |
| Performance budgets | [`24_PERFORMANCE.md`](24_PERFORMANCE.md) |
| Glossary | [`00_PROJECT_OVERVIEW.md`](00_PROJECT_OVERVIEW.md) §8 |

---

## Requirement traceability

Every requirement from the originating brief, mapped to the document that satisfies it.

| Requirement | Covered by |
|---|---|
| Manual address entry | [`04`](04_FEATURES.md), [`08`](08_SCREEN_SPECIFICATIONS.md) |
| Google Places search | [`14`](14_GOOGLE_MAPS_INTEGRATION.md), [`33`](33_API_CONTRACTS.md) |
| Address list import | [`04`](04_FEATURES.md), [`12`](12_DATABASE.md) |
| Manual reordering | [`08`](08_SCREEN_SPECIFICATIONS.md), [`09`](09_COMPONENT_LIBRARY.md) |
| Automatic optimization | [`15`](15_ROUTE_OPTIMIZATION.md) |
| Optional return to origin | [`15`](15_ROUTE_OPTIMIZATION.md) |
| Saved routes, history | [`12`](12_DATABASE.md), [`04`](04_FEATURES.md) |
| VRP, TSP, fallback, caching, ETA, traffic, recalculation, waypoints, round trip, one way, priorities, constraints, API limits, future scale | [`15`](15_ROUTE_OPTIMIZATION.md) |
| Internal navigation, deep-link fallback | [`16`](16_INTERNAL_NAVIGATION.md) |
| Cluster, custom, selected markers; polylines; preview; zoom; camera; gestures; dark mode; satellite; traffic layer; incidents; saved places; favourites | [`14`](14_GOOGLE_MAPS_INTEGRATION.md), [`09`](09_COMPONENT_LIBRARY.md) |
| Per-component responsibility, states, animation, a11y, performance, interaction, errors, loading, skeletons | [`09`](09_COMPONENT_LIBRARY.md) |
| Supabase tables, relations, indexes, RLS, storage, migrations, evolution | [`12`](12_DATABASE.md) |
| API input, output, errors, timeout, retry, caching, rate limits | [`33`](33_API_CONTRACTS.md) |
| Unit, integration, UI, E2E, performance, regression, store validation | [`22`](22_TESTING.md) |
| GitHub Actions, Fastlane, TestFlight, Play tracks, production, rollback, versioning | [`25`](25_DEPLOYMENT.md) |
| Bottom sheet, gestures, animation, one-handed use, three taps | [`06`](06_UX_GUIDELINES.md), [`08`](08_SCREEN_SPECIFICATIONS.md) |
| Subscriptions | [`20`](20_SUBSCRIPTIONS.md) |
| Analytics, Crashlytics, Sentry | [`21`](21_ANALYTICS.md) |
| Permissions | [`18`](18_PERMISSIONS.md) |
| Security | [`19`](19_SECURITY.md) |
| Offline mode | [`17`](17_OFFLINE_MODE.md) |
| Accessibility | [`23`](23_ACCESSIBILITY.md) |
| Performance | [`24`](24_PERFORMANCE.md) |
| App Store, Play Store | [`26`](26_APP_STORE.md), [`27`](27_PLAY_STORE.md) |
| Definition of Done | [`29`](29_DEFINITION_OF_DONE.md) |
| Project constitution | [`../CLAUDE.md`](../CLAUDE.md), [`30`](30_CLAUDE_RULES.md) |

---

## Status

All waves are complete. Every document below is written, reviewed against the 14-section
template, and pushed.

| Wave | Documents | Status |
|---|---|---|
| 0 — Kernel | `_TEMPLATE`, `INDEX`, `00`, `CLAUDE.md`, `30`, `adr/0001–0012` | ✅ Complete |
| 1 — Product | `01`, `02`, `03`, `04`, `28`, `35` | ✅ Complete |
| 2 — Core technical | `15`, `14`, `16`, `31`, `12`, `13`, `33` | ✅ Complete |
| 3 — Experience | `05`, `06`, `07`, `08`, `09`, `10`, `11`, `23`, `34` | ✅ Complete |
| 4 — Platform | `17`, `18`, `19`, `20`, `21`, `24`, `32` | ✅ Complete |
| 5 — Delivery | `22`, `25`, `26`, `27`, `29`, `README` | ✅ Complete |
| 6 — Consolidation | Cross-link and consistency audit | ✅ Complete |

**File count.** The approved set is 41 documents: the 33 named in the brief plus 8 extensions,
counting `adr/` as one entry. On disk that is **52 files** — 38 in `docs/`, 12 in `docs/adr/`,
and `CLAUDE.md` and `README.md` at the root — because the single ADR entry expands to twelve
records. Both numbers are correct; they count different things.

**Audit results, wave 6.**

| Check | Result |
|---|---|
| All 41 approved documents present, none a stub | ✅ Shortest file is well above placeholder length |
| 14 mandatory sections in every numbered document | ✅ 36/36 conform. 66 sections were added: `Responsibilities` ×1, `Text diagrams` ×3, `Flows` ×33, `Architectural decisions` ×29 |
| Heading numbering contiguous | ✅ 36/36 |
| Relative links resolve | ✅ 0 broken, excluding the deliberate placeholders in `_TEMPLATE.md` |
| Heading anchors resolve | ✅ 0 broken |
| Section (`§N`) cross-references | ✅ 0 unresolved; every reference reconciled against its pre-renumbering target |
| Risks C1–C16 traced outside the register | ✅ All 16, by identifier |
| ADRs 0001–0012 cited by an owning document | ✅ All 12 |
| Contradictory figures across documents | ✅ None — stop caps, retention, pricing, budgets and contrast ratios agree |
| Application source files in the repository | ✅ None, as required |

The section check is the one that matters most in hindsight: an earlier pass matched heading
names loosely and reported the template as satisfied while two of its fourteen sections were
absent from most documents. A conformance check that cannot fail is not a check — which is the
same argument [`01_PRODUCT_REQUIREMENTS.md`](01_PRODUCT_REQUIREMENTS.md) makes about
requirements that state no verification method.
