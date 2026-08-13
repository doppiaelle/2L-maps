# 40 — UI Implementation Audit

> **Status:** Implemented in source; Android artifact/device acceptance follows the `main` CI run
> **Last reviewed:** 2026-08-13
> **Visual authority:** supplied Figma overview and UI brief override legacy screen prose

## 1. Audit outcome

The earlier UI change was incremental and did not mount the approved compositions. This pass
traced every requested screen from `app/(app)/index.tsx`, through feature views and stores, into
tests and the Android artifact workflow. The application now mounts the new UI rather than merely
documenting it.

The Figma MCP connection was available but its Starter-plan call quota was exhausted during this
audit. Therefore this implementation was checked against the supplied exported overview image and
written brief, not against fresh Figma layer measurements. This limitation remains visible.

## 2. Requirement-to-code matrix

| Requirement | Runtime implementation | Verification |
|---|---|---|
| Login brand composition | `app/(auth)/sign-in.tsx`, `assets/brand/logo.png` | Typecheck, bundle, Android artifact, phone checklist |
| Route header and hierarchy | `features/route-planning/PlanView.tsx`, `components/navigation/AppHeader.tsx` | Plan component tests |
| 02A inline search, dropdown, dimming | `features/places/InlineStopSearch.tsx`, mounted by `app/(app)/index.tsx` | Stable test IDs and phone checklist |
| Reset current route | Draft-store reset mounted as a minimal endpoint-control utility | Store tests and phone checklist |
| Persistent start/end choices | `RouteEndpointControls.tsx`, preferences and versioned draft migration | Pure endpoint/store tests |
| Current location shortcut | First search offer plus permission-aware endpoint application | Search and endpoint tests |
| Procedural navigation environment | `lib/map/scenery.ts`, `components/map/RouteCanvas.tsx` | Generator and canvas tests |
| Pan, pinch, segment selection | `RouteCanvas.tsx`, viewport and selection helpers | Viewport/selection/canvas tests |
| Zoom, recenter, compass, scale | `RouteCanvas.tsx` | Canvas component tests |
| Numbered stops and mint route | `RouteCanvas.tsx`, `lib/design/tokens.ts` | Canvas/style/token tests |
| Map summary and confirmation | `PlanView.tsx` | Plan tests and phone checklist |
| Compact History cards | `features/routes/HistoryView.tsx` | History tests |
| Sync attempt before external navigation | Awaited `useRouteSync().sync()` in the handoff critical path; durable local route remains usable on remote failure | Route/handoff integration tests |
| Reopen without re-optimizing | Saved optimized order hydration | History integration test asserts zero optimize calls |
| Provider and theme selection | `features/settings/SettingsView.tsx` | Preference/store tests and phone checklist |
| Subscription comparison | `features/settings/SubscriptionView.tsx`, live server plan, checkout honestly unavailable | Typecheck and phone checklist |
| Two-item dock and Settings utility | `components/navigation/Dock.tsx`, `app/(app)/index.tsx` | Dock/UI tests |
| Standalone APK on each main push | `.github/workflows/android-preview.yml` | GitHub Actions run and artifact presence |

## 3. Procedural map contract

The route polyline is the only geographically authoritative drawing. The generator resamples that
path and builds two connected route-following road corridors. Cross streets join and extend beyond
those corridors; resulting cells become blocks; anonymous buildings, parks and squares are
contained by and aligned to their parent blocks. The durable route ID is the seed, so the same
route produces the same environment on every render.

At national scale the urban generator emits nothing and the existing coastline fallback is used.
This prevents a city block from silently representing hundreds of kilometres.

## 4. Android artifact flow

1. Push the verified commit to `main` or the PR branch.
2. Run `android-preview` when hosted minutes are available; otherwise use a local or self-hosted
   Android build path from [`25_DEPLOYMENT.md`](25_DEPLOYMENT.md).
3. Open its successful `development build (APK)` job.
4. Download artifact `2l-maps-standalone`.
5. Unzip and install the ARM64 APK on the Android phone.
6. Record commit SHA and workflow URL with the checklist screenshots.

No local Android Studio, SDK, ADB, Metro server or Maestro installation is required. CI success
proves buildability; it does not prove pixels or touch interactions on the phone.

## 5. Physical-phone acceptance checklist

- Login: logo has transparent edges and no black rectangle; copy and Google action fit.
- Route: brand header, Settings, `Your route`, search field, stop list and CTA match the compact
  supplied composition.
- Search Open: Route remains visible and dimmed; results show place and address; selection adds a
  stop and closes the overlay.
- Optimized Map: first impression is an urban navigation map; mint route dominates; roads connect;
  buildings sit inside blocks; numbered stops lie on the route; pan, pinch, zoom, recenter,
  compass, segment selection and Confirm work.
- History: populated routes are rounded compact cards with mint metrics and trailing action.
- Settings: Google Maps, Apple Maps and Waze are directly selectable once; Subscription opens the
  Free / Day pass / Pro comparison; Light, System and Dark update every surface.
- Repeat all six screens in Light and Dark at the supplied reference viewport.

## 6. Evidence required to close device acceptance

Source implementation is complete when verification, bundle, prebuild and Android artifact CI are
green. Device acceptance remains open until the exact CI artifact is installed and screenshots for
Login, Route, Search Open, Optimized Map, History and Settings are attached for both themes.
