# 24 — Performance

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md) · [`22_TESTING.md`](22_TESTING.md) · [`31_COST_MODEL.md`](31_COST_MODEL.md)

---

> **This document is the single source of truth for performance budgets.** Other documents cite
> these numbers; none restates them.

---

## 1. Purpose

This document defines the performance budgets, the reference devices they are measured on, the
techniques that hold them, and how regressions are caught.

The context matters: this app is opened for seconds at a time, one-handed, between stops, often
on a phone that is several years old and thermally throttled from sitting on a windscreen mount
in the sun.

## 2. Goals

1. Set budgets that reflect the real device population, not the developer's phone.
2. Keep every interaction at 60 fps, including with 25 markers on screen.
3. Keep perceived latency low even when the network is slow.
4. Catch regressions before release rather than in reviews.

**Non-goals.** No micro-benchmarks. No optimisation without a measurement.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Budgets | This document | The only source |
| Measurement | QA, on reference devices | Not on simulators |
| Regression detection | CI, per release | [`22_TESTING.md`](22_TESTING.md) |

---

## 4. Text diagrams

```
  WHERE THE FRAME BUDGET GOES — 25 stops, sheet at full detent

  ┌────────────────────────────────────────────┐
  │ map: 25 markers + polyline                 │  memoised by id+state,
  │                                            │  decoded once, clustered
  ├────────────────────────────────────────────┤  ← 16 ms frame boundary
  │ sheet: virtualised list, native gestures   │  no JS-thread work
  │                                            │  during a drag
  └────────────────────────────────────────────┘

  Measured on battery, warm, on a 3-year-old device — not on a
  cool plugged-in flagship, which is nobody's actual condition.
```

## 5. Reference devices

**Budgets are met on these, not on the newest hardware.**

| Tier | Device class | Why |
|---|---|---|
| **Low** | Android, mid-range, 3+ years old, 4 GB RAM | Elena's device class; the majority of Android users in this segment |
| **Low** | iPhone, 3+ generations old | Marco's device class; professionals do not upgrade annually |
| Reference | Current mid-range | Sanity check only |

**Measurement conditions:** on battery, not plugged in; after 10 minutes of use so thermal
throttling has begun; with a real network, not a local server. A phone mounted on a windscreen in
August is thermally throttled, and that is the condition that matters.

---

## 6. Budgets

### Startup

| Metric | Budget | Notes |
|---|---|---|
| Cold start to interactive | **< 2.5 s** | Splash held until state restoration completes ([`10`](10_NAVIGATION_FLOW.md)) |
| Warm start | < 800 ms | |
| State restoration | < 300 ms | Part of cold start |
| Time to first meaningful paint | < 1.5 s | Map may still be loading |

The splash is deliberately held rather than showing an empty Plan that then fills in. A visible
flash reads as a defect and costs more perceived quality than the extra 300 ms.

### Interaction — the 60 fps set

| Metric | Budget |
|---|---|
| Stop list scroll, 25 stops | **60 fps, zero dropped frames** |
| Sheet detent transition | < 300 ms, gesture-driven, interruptible |
| Marker render, 25 stops | < 16 ms per frame |
| Marker reorder animation | 400 ms, 60 fps throughout |
| Map pan and zoom | 60 fps |
| Row selection | < 100 ms to visible feedback |

### Network-bound

| Metric | Budget | Notes |
|---|---|---|
| Autocomplete keystroke → suggestions | **< 400 ms perceived** | Debounce ≥ 300 ms, so the request has ~100 ms |
| Optimization T1 → result | **< 3 s p95** | Progress shown after 1 s |
| Optimization T2 sync | < 8 s | Above this, it becomes an async job |
| Route load from cache | < 200 ms | Local |
| Coordinate re-hydration, 25 stops | < 1.5 s | Batched |

**Perceived latency is what is budgeted**, not request time. Autocomplete gets 400 ms *perceived*
because the debounce is deliberate and the local address book answers instantly — the user is
rarely waiting on the network at all.

### Resources

| Metric | Budget |
|---|---|
| Memory, steady state with a 25-stop route | < 250 MB |
| App download size | < 60 MB |
| Battery, one hour of route driving | < 8% |
| Storage, 100 saved routes | < 20 MB |

Battery matters more here than in most apps: the phone is mounted, the screen is on, and the
user is between charges for a working day.

---

## 7. Techniques

### Rendering

1. **Virtualise above 20 rows.** Twenty-five stops with per-row state exceeds what a plain map
   renders smoothly.
2. **Memoise markers and rows** by id and state. Recreating them per render is the single most
   common cause of map jank in this class of app.
3. **Decode the polyline once**, at result receipt, and memoise it. Decoding per render is the
   second most common cause.
4. **Cluster above 15 markers.**
5. **Fixed row height per Dynamic Type size**, so virtualisation can calculate without measuring.

### Gestures and animation

6. **No JS-thread work during a gesture.** Sheet and map interactions run on the native driver or
   Reanimated worklets.
7. **Interruptible animations.** A user grabbing the sheet mid-transition takes control
   immediately.
8. **Test with the JS thread deliberately blocked** — if the sheet still drags smoothly, the
   gesture is genuinely native.

### Network and cost

9. **Debounce every keystroke that costs money.** Autocomplete is the dominant COGS line
   ([`31_COST_MODEL.md`](31_COST_MODEL.md)); the debounce serves performance and cost
   simultaneously.
10. **Check the local address book before the network.** A reused `place_id` is free and instant.
11. **Batch re-hydration.** Twenty-five sequential Place Details calls would take seconds.
12. **Cancel in-flight requests** when the user's input supersedes them.

### Startup

13. **Defer non-critical initialisation.** Analytics, RevenueCat and Sentry initialise after the
    first frame.
14. **Restore state before the first render**, and hold the splash while doing so.

---

## 8. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | 25 stops, sheet full, Dynamic Type 200% | 60 fps maintained; virtualisation recalculates row height |
| 2 | Rapid marker tapping | Debounced; only the final selection animates |
| 3 | Optimization completes during a sheet drag | Result applies on gesture end, never mid-gesture |
| 4 | Slow network, 3G | Progress after 1 s; timeouts per [`33`](33_API_CONTRACTS.md); T0 offered |
| 5 | Thermally throttled device | Budgets still met — this is the measurement condition, not an exception |
| 6 | Low memory warning | Non-essential caches released; the draft route is never evicted |
| 7 | 100 saved routes in history | Virtualised; loads under 200 ms from local storage |
| 8 | Backgrounded during optimization | Request continues; the result applies on return |
| 9 | Map and list both rendering 25 items | Shared memoised data; markers and rows derive from one source |

## 9. Error handling

| Failure | Detection | Result |
|---|---|---|
| Frame drops during scroll | Profiling in CI | Regression; release blocked |
| Cold start over budget | Startup measurement | Regression; investigated before release |
| Memory growth over a session | Leak detection | Investigated as a defect |
| Optimization exceeds p95 | Server metrics | Async threshold lowered, or waiting UX strengthened |
| Battery drain over budget | Manual testing | Investigated; background work is the usual cause |

## 10. Best practices

1. **Measure before optimising, and record the measurement in the pull request.** An unmeasured
   optimisation is a guess that adds complexity.
2. **Measure on reference devices, on battery, warm.**
3. **Budget perceived latency**, not request time.
4. **Memoise anything rendered per stop.**
5. **Keep gestures off the JS thread**, and verify by blocking it.
6. **Prefer removing work to making work faster.** The address book beats a faster autocomplete.
7. **Never evict the draft route** under memory pressure — it is the user's unsaved work.

## 11. Checklist

- [ ] Cold start measured on both reference devices, on battery, warm.
- [ ] 60 fps verified with 25 stops on the low-tier Android device.
- [ ] Sheet gestures verified smooth with the JS thread deliberately blocked.
- [ ] Markers and rows verified memoised.
- [ ] Polyline verified decoded once per result.
- [ ] Autocomplete debounce verified at ≥ 300 ms.
- [ ] Optimization p95 measured against the 3 s budget.
- [ ] Memory measured over a 30-minute session.
- [ ] Battery measured over an hour of simulated route driving.
- [ ] Download size measured against the 60 MB budget.
- [ ] Dynamic Type 200% verified at 60 fps on the densest screen.

## 12. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | All budgets met on reference devices | — |
| 1.x | Automated performance regression testing in CI | Post-launch |
| 1.x | Startup profiling and deferred-initialisation tuning | If cold start approaches budget |
| 2.0 | Budgets revisited if stop counts rise above 25 | Gate D3 |

## 13. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Budgets set against 3-year-old reference devices | The target segment does not upgrade annually | Architecture |
| 2026-08-06 | Measurement required on battery, warm | Windscreen-mounted phones are thermally throttled | Architecture |
| 2026-08-06 | Perceived latency budgeted rather than request time | The debounce is deliberate; the address book answers instantly | Architecture |
| 2026-08-06 | Draft route exempt from memory-pressure eviction | It is unsaved user work | Architecture |

## 14. Rationale

The budgets are set against old, warm devices because that is the population. A professional who
bought a phone three years ago and mounts it on a windscreen in August is the modal user, not the
edge case — and an app tested only on a cool, new, plugged-in device will be measurably worse for
almost everyone who actually uses it.

Budgeting *perceived* latency rather than request time changes what gets optimised. Autocomplete
has a 300 ms deliberate debounce, so a purely technical budget would look bad while the experience
is fine; conversely, an instant response from the local address book means most interactions
never touch the network. The right optimisation is usually to remove the request, not to speed it
up — which is also the right cost optimisation ([`31_COST_MODEL.md`](31_COST_MODEL.md)).

The 60 fps requirement at 25 stops is the hardest budget and the one that constrains the
component design most. It is why rows have fixed heights per type size, why markers and rows
derive from one memoised source, and why virtualisation is mandatory. These are not
optimisations applied later; they are the design.

Exempting the draft route from memory-pressure eviction is a small rule protecting the largest
failure. Under pressure the OS will ask for memory, and evicting a cache is correct — evicting
the user's unsaved arrangement is the P3 violation that ends the relationship.

## 15. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Budgets against current flagship devices | Easier to meet; simpler testing | Would ship an app that is slow for most of its actual users |
| Measurement on simulators | Fast; automatable; consistent | Simulators do not throttle, do not have real GPUs, and do not reproduce network conditions |
| No virtualisation below 50 rows | Simpler; fine on new devices | 25 stateful rows drop frames on the low-tier reference device |
| Shorter autocomplete debounce for responsiveness | Feels snappier | Multiplies the dominant cost line, and the address book already provides instant results |
| Optimising the JS bundle first | Standard advice; measurable | The bottleneck here is native rendering with 25 markers, not JS parse time |
| Performance work after launch | Ship faster; optimise with real data | The techniques listed are architectural — memoisation, virtualisation, native gestures — and retrofitting them means rewriting components |
