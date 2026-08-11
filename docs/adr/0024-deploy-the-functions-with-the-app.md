# ADR-0024 — The Edge Functions deploy with the app, not when someone remembers

**Status:** Accepted
**Date:** 2026-08-11
**Amends:** `.github/workflows/deploy-functions.yml`
**Related:** [ADR-0023](0023-legs-name-their-stops.md), [ADR-0006](0006-mandatory-backend-proxy.md)

## Context

ADR-0023 fixed optimization. Both halves of the contract changed in one commit,
the contract test ran the server's real output through the client's real parser,
and it passed. The next build reached a phone and optimization was still broken,
with the same message, for the same reason.

**Only half the change had shipped.** `android-preview` builds and publishes an
APK on every push to `main`. `deploy-functions` was `workflow_dispatch` only. So
the new client met the old server, and `z.string().nullable()` — which requires
the key to be *present*, null or not — rejected every response exactly as before.

The reasoning behind the manual trigger was not silly: a deploy replaces code
that spends money on Google's APIs, so a human should press it. But it was
reasoning about the deploy in isolation. Held next to a client that deploys
itself, what it actually guarantees is **drift** — and drift between two halves
of a contract is the single failure mode this codebase has now produced three
times: `locale: null` in the request direction, the leg ids in the response
direction, and now the same leg ids again in the *deploy* direction.

## Decision

**A change under `supabase/functions/**` deploys on push to `main`**, which is
the trigger the app already has. `workflow_dispatch` stays for the case nothing
in the repository can detect: a secret changing in the dashboard.

**Migrations are deliberately excluded.** A schema change is not undone by
pushing again, and `migrate` stays a decision somebody makes.

**And the client stops requiring fields it does not read.** The leg ids are
`.nullish()`, not `.nullable()`. This is the more important half of the
decision, because it is the half that does not depend on a workflow being right:
nothing in the product consumes `fromStopId` or `toStopId`, and a field nobody
reads must never be able to fail a response. The rule generalises — **a response
schema should require only what the caller would break without.**

## Consequences

**The two halves move together.** A contract change is one push.

**A deploy can now happen without a human.** That is the property the old
workflow was protecting, and it is genuinely given up. The mitigation is the one
already in place for the app: `verify` gates the merge, and the functions have
their own `deno check` job in it.

**The contract test grew a case for the old shape.** `client-contract.test.ts`
now also parses a response with the ids absent — the exact body the deployed
server was sending. A test for a version of the server that no longer exists is
worth keeping: it is what documents that the client does not depend on the two
being in step.

**Secrets remain manual and remain invisible to CI.** `GOOGLE_SERVER_API_KEY`,
`ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` are set in the Supabase dashboard.
Nothing in this repository can tell whether they are present or valid, which is
why a missing one surfaces as an upstream failure at runtime rather than as a
failed build — and why the endpoints log `upstreamStatus` when a call is refused.
