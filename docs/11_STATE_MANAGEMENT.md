# 11 — State Management

> **Status:** Approved
> **Owner:** Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`12_DATABASE.md`](12_DATABASE.md) · [`17_OFFLINE_MODE.md`](17_OFFLINE_MODE.md) · [`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)

---

## 1. Purpose

This document specifies where every piece of state lives, how it is persisted, how offline
mutations queue and reconcile, and how the app survives process death without losing work.

The governing constraint is [`06_UX_GUIDELINES.md`](06_UX_GUIDELINES.md) P3: **never lose the
user's work.** Most of the design below exists to make that true under interruption, network
loss and process death.

## 2. Goals

1. One home per kind of state; no duplicated sources of truth.
2. Survive process death at any point with no data loss.
3. Queue offline mutations and reconcile without conflict pathology.
4. Keep optimistic updates safe — a failed request must never corrupt visible state.

**Non-goals.** No schema ([`12`](12_DATABASE.md)), no API contracts
([`33`](33_API_CONTRACTS.md)).

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Server state | React Query | Caching, staleness, retry, invalidation |
| Global client state | Zustand, feature-scoped | Draft route, selection, sheet detent |
| Persistence | MMKV via a Zustand persist adapter | Survives process death |
| Mutation queue | Dedicated store | Drains on reconnection |

---

## 4. Text diagrams

### The four homes

```
  ┌────────────────────────────────────────────────────────┐
  │ REACT QUERY — server state                             │
  │   saved routes · history · entitlement · quota         │
  │   optimization results                                 │
  │   owns: caching, staleness, refetch, retry             │
  └────────────────────────────────────────────────────────┘
                              │  never copied into ↓
  ┌────────────────────────────────────────────────────────┐
  │ ZUSTAND — global client state, feature-scoped          │
  │   draft route (stops, order, round-trip flag)          │
  │   route progress (current stop, completed, skipped)    │
  │   selection · sheet detent · provider preference       │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │ useState — local UI                                    │
  │   menu open · input focus · transient toggles          │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │ EXPO ROUTER — navigation state                         │
  └────────────────────────────────────────────────────────┘
```

**Server data is never copied into Zustand.** A copy becomes a second source of truth that will
disagree with the first ([`../CLAUDE.md`](../CLAUDE.md) §4).

The draft route lives in Zustand rather than React Query because it is genuinely client-owned
until saved: the user builds it locally, and it must survive process death whether or not it has
ever been sent to the server.

### Persistence tiers

```
  PERSISTED (survives process death)          IN-MEMORY (does not)
  ────────────────────────────────            ──────────────────────
  draft route + stop order                    sheet detent
  route progress ◀── written before           map camera
                     every handoff            selected stop
  mutation queue                              search input
  provider preference                         modal drafts (background only)
  last optimization result
  auth session
```

---

## 5. Flows

**Where a new piece of state goes.** One question, four homes, and the answer is never "both".

```
  does the server own the truth?   ──yes──▶  React Query
            │ no
            ▼
  do unrelated screens need it?    ──yes──▶  Zustand, in a feature-scoped store
            │ no
            ▼
  is it which screen is showing?   ──yes──▶  Expo Router
            │ no
            ▼
                                             useState, local to the component
```

**An offline mutation's life.**

```
  user acts ──▶ optimistic local update ──▶ queued with an idempotency key
                                                  │
                          network returns ────────┤
                                                  ▼
                                    replayed in order ──▶ server accepts ──▶ queue entry cleared
                                                  │
                                                  └──▶ server rejects ──▶ local state reconciled
                                                                          to the server's truth,
                                                                          user told what changed
```

**Process death.** The draft route persists; server caches do not need to. Rehydration restores
the user's unsaved arrangement first, then refetches — in that order, so the user never sees an
empty list while a query is in flight.

**Why copying is forbidden.** A query result written into a store creates a second source of
truth that will disagree with the first the moment one of them refetches. The disagreement is
silent, and silent disagreement about the user's route is the most expensive bug this product
can have.

## 6. Server state — React Query

| Query | Stale time | Cache time | Notes |
|---|---|---|---|
| Saved routes | 5 min | 24 h | Persisted for offline read |
| Route detail | 5 min | 24 h | Persisted |
| History | 5 min | 24 h | Persisted |
| Entitlement | 1 min | 1 h | Refetched on foreground |
| Quota usage | 1 min | 10 min | Refetched before a metered action |
| Optimization result | — | — | A mutation, not a query |

**Persisted query cache** is what makes offline read work: the address book, saved routes and
history are all served from it without a network.

**Entitlement refetches on foreground** because a purchase may have completed elsewhere and
webhook delivery is asynchronous ([`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md)).

### Optimistic updates — and their limit

Optimistic updates are used for cheap, reversible, local operations: adding, removing,
reordering and relabelling stops. Each writes to the draft store immediately.

**Optimization is never optimistic.** There is nothing to guess — the result is the whole point,
and a speculative reorder that then failed would violate P3 by scrambling the user's visible
order. During optimization the list is unchanged; only the action control shows progress
([`08_SCREEN_SPECIFICATIONS.md`](08_SCREEN_SPECIFICATIONS.md)).

---

## 7. Client state — Zustand

Small, feature-scoped stores. No single global store.

| Store | Holds | Persisted |
|---|---|---|
| `draftRouteStore` | Stops, order, origin, round-trip flag, last result | **Yes** |
| `routeProgressStore` | Current index, completed, skipped, active route id | **Yes** |
| `preferencesStore` | Navigation provider, theme override, units | **Yes** |
| `mutationQueueStore` | Pending offline operations | **Yes** |
| `uiStore` | Sheet detent, selected stop, camera | No |

Stores expose **actions, not setters**. `markStopCompleted(id)` rather than
`setCompletedStops(array)` — the store owns its invariants, so no caller can leave it in an
impossible state.

### Route progress — the critical store

Written **before** every external handoff, never after
([`16_INTERNAL_NAVIGATION.md`](16_INTERNAL_NAVIGATION.md)). The app is backgrounded for the
entire drive and may be killed at any moment; a write ordered after the launch would be lost
exactly when the user has invested the most.

---

## 8. Offline mutations

### Queue

Every mutation performed offline is appended with its type, payload, timestamp and a client-
generated id. The queue is persisted and drains in order on reconnection.

```
  offline edit ──▶ apply locally ──▶ append to queue ──▶ persist
                        │
                   user sees the change immediately
                        │
  reconnect ──▶ drain in order ──▶ per-item success or conflict
                        │
                   conflicts surfaced only where genuine
```

**Client-generated ids** mean a row created offline keeps its identity through sync, so
references to it never break.

### Conflict resolution

| Situation | Resolution |
|---|---|
| Same field, two devices | Last-write-wins **per field**, by timestamp |
| Different fields, same route | Both applied; no conflict |
| Delete versus edit | Delete wins; the edit is discarded with a notice |
| **Reorder versus reorder** | **Genuine conflict.** Both versions presented; the user chooses |
| Create versus create | Both kept — two devices creating routes is not a conflict |

Only reordering produces a surfaced conflict. Everything else resolves deterministically without
asking, because a dialog for a case the system can decide is noise.

### Idempotency

Every queued mutation carries an idempotency key, so a drain interrupted by another network loss
can safely replay without duplicating server-side effects
([`33_API_CONTRACTS.md`](33_API_CONTRACTS.md)).

---

## 9. Architectural decisions

| ID | Decision | Applies to |
|---|---|---|
| [0011](adr/0011-server-side-quota-enforcement.md) | Entitlement and quota are server state | Why they live in React Query and never in Zustand |
| [0008](adr/0008-offline-scope.md) | Offline means your own data | The mutation queue and what it may contain |
| [0007](adr/0007-place-id-durable-coordinates-perishable.md) | Coordinates expire | Why persisted state stores `place_id` and treats coordinates as cache |

**Decided here:** the draft route is the only client state that is persisted eagerly and never
evicted. Everything else can be refetched; the user's unsaved arrangement cannot.

## 10. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Process death mid-optimization | Order restored unchanged; the request is not resumed; the user re-optimizes |
| 2 | Process death mid-handoff | Progress restored — it was written before the launch |
| 3 | Optimization completes while backgrounded | Result applied on return, not discarded |
| 4 | Stop added during optimization | Request cancelled; a fresh optimization includes the new stop |
| 5 | Queue drains partially, then reconnection fails | Successful items are removed; the rest stay queued |
| 6 | Queued mutation references a deleted route | Discarded silently — the route is gone |
| 7 | Entitlement changes while offline | Cached entitlement used; refetched and reconciled on reconnection |
| 8 | Two optimizations requested rapidly | Earlier cancelled; only the latest applies |
| 9 | Persisted state from an older app version | Migrated by a versioned schema; unmigratable state is discarded with an explanation |
| 10 | Storage full | Write fails; the user is told; in-memory state continues to work |

## 11. Error handling

| Failure | Detection | Result | Fallback |
|---|---|---|---|
| Persist write fails | Storage error | User informed; session continues in memory | In-memory only |
| Restoration fails | Hydration error | Empty state with an explanation | Fresh start |
| State version mismatch | Version check | Migrated, or discarded with an explanation | Fresh start |
| Queue item permanently fails | Retry exhausted | Item surfaced to the user with a discard or retry action | Manual |
| Optimistic update fails | Mutation error | **Rolled back to the exact prior state**; error shown | Prior state |
| Query cache corrupted | Read error | Cache cleared; refetched | Network |

**Rollback restores the exact prior state**, not a recomputed approximation. A partial rollback
is indistinguishable from data loss.

## 12. Best practices

1. **Server data never enters Zustand.**
2. **Stores expose actions, not setters** — invariants stay inside.
3. **Persist route progress before every handoff.**
4. **Never optimistically reorder.** The result is the point.
5. **Roll back to the captured prior state**, exactly.
6. **Version persisted state** from the first release; migration is unavoidable later.
7. **Surface conflicts only when genuine.** Everything else resolves silently.
8. **Test process death routinely**, not as an edge case.

## 13. Checklist

- [ ] No server data duplicated into Zustand.
- [ ] Route progress written before every handoff, verified by test.
- [ ] Process death tested at every step of every journey.
- [ ] Optimistic rollback restores exact prior state.
- [ ] Optimization verified never to mutate the list before completion.
- [ ] Queue drains in order and survives interrupted drains.
- [ ] Idempotency keys on every queued mutation.
- [ ] Persisted state versioned with a migration path.
- [ ] Reorder conflict surfaces; all others resolve silently.
- [ ] Offline read verified in genuine airplane mode.

## 14. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Four homes, persistence, queue, conflict resolution | — |
| 1.x | Background sync on reconnection without app foreground | Platform capability |
| 1.2 | Live Activity state mirroring | Release 1.2 |
| 2.0 | Multi-device real-time route sync | User demand |

## 15. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Four state homes fixed | Prevents the duplicate-source-of-truth failure | Architecture |
| 2026-08-06 | Draft route in Zustand, not React Query | Client-owned until saved; must survive process death | Architecture |
| 2026-08-06 | Optimization never optimistic | A failed speculative reorder would violate P3 | Architecture |
| 2026-08-06 | Only reorder conflicts surfaced | Everything else resolves deterministically; a dialog would be noise | Architecture |
| 2026-08-06 | Progress written before handoff | The app may never be resumed | Architecture |

## 16. Rationale

The four-homes rule addresses the most common architectural failure in this stack: copying
server data into a client store "so it is easier to access". The copy immediately becomes a
second source of truth, and the two disagree the first time a refetch happens while the copy is
being edited. React Query owns anything the server owns; Zustand owns only what the client
originates.

The draft route is the deliberate exception, and it is a real exception rather than a
convenience. Until saved, the draft exists nowhere but the device — it must survive process
death, work entirely offline, and be editable without a network. That is client-owned state by
definition.

Refusing to optimize optimistically is the clearest expression of P3. An optimistic reorder
would look impressive and would, on failure, leave the user staring at an order they did not
create and cannot undo. The list stays exactly as the user arranged it until a real result
arrives.

Writing progress before the handoff rather than after is a one-line ordering decision that
determines whether the product loses a user's day. Between launching Google Maps and the user
returning, the OS may kill the app at any point; a write scheduled for "after" never happens.

## 17. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| One global Zustand store | Simple; everything in one place | Becomes a god object; unrelated updates re-render unrelated screens |
| React Query for the draft route | One state library; automatic caching | The draft has no server representation until saved and must work fully offline |
| Redux Toolkit | Mature; excellent devtools; familiar | Substantially more boilerplate for a state surface this small |
| Optimistic optimization | Feels instant; more impressive | A failure would scramble the user's manual order — the exact P3 violation |
| Full CRDT sync | Conflict-free by construction; elegant | Enormous complexity for a single-user, single-device-at-a-time product |
| Last-write-wins on whole records | Simplest conflict rule | Loses concurrent edits to different fields, which is the common case across two devices |
