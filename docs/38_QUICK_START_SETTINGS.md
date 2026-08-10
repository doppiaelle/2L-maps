# 38 — Quick Start Settings

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-10
> **Related:** [`37_GO_LIVE_RUNBOOK.md`](37_GO_LIVE_RUNBOOK.md) · [`19_SECURITY.md`](19_SECURITY.md)

---

## 1. Purpose

**The shortest path from nothing to the app running on an Android phone.** Nine steps, in order,
each one saying where to go, what to do, and what to copy where.

This is not [`37_GO_LIVE_RUNBOOK.md`](37_GO_LIVE_RUNBOOK.md). That document is the full
go-live procedure — every account, every limit, every store requirement — and it is what to
read before shipping to real users. **This one deliberately leaves out everything the first
test does not need.**

**Left out on purpose, and safe to leave out:** analytics (Firebase), advertising (AdMob and a
consent platform), billing (RevenueCat and Play Console products), Apple sign-in, iOS
altogether, Cloud Map Styling, and a release keystore. None of them blocks a first run, and
each is a separate account to create for something that cannot yet be observed.

**Order matters in exactly one place: step 1 comes first.** Spend caps go on before a
credential exists, because the risk starts the moment a key exists rather than the moment code
calls it.

---

## 2. What you end up with

An APK on your phone that signs in with Google, shows a map, searches addresses, optimizes a
route, hands it to Google Maps or Waze, and remembers everything you did.

Roughly 45 minutes, most of it waiting for consoles to save.

---

## 3. The nine steps

### Step 1 — Google Cloud: spend caps, before anything else

**Where:** [console.cloud.google.com](https://console.cloud.google.com) → create a project →
**Billing → Budgets & alerts**

1. Create a budget. €20/month is generous for testing and small enough to notice.
2. Set alert thresholds at 50%, 90%, 100%.

> A budget alert **notifies**, it does not stop spending. The thing that actually stops spending
> is the per-API quota in step 3. Set both.

### Step 2 — Google Cloud: enable four APIs

**Where:** **APIs & Services → Library**, search each by name and press Enable.

| API | Used for |
|---|---|
| Maps SDK for Android | Drawing the map in the app |
| Routes API | Optimizing the stop order |
| Places API (New) | Address search — **"(New)", not the legacy "Places API"** |
| Geocoding API | Turning pasted addresses into places |

### Step 3 — Google Cloud: cap each API

**Where:** **APIs & Services → [each API] → Quotas & System Limits**

Set a low daily cap on each — 500 requests a day is far more than one person testing can use
and turns a runaway loop into a dead feature rather than a bill.

### Step 4 — Google Cloud: two API keys

**Where:** **APIs & Services → Credentials → Create credentials → API key**

Create **two**, and restrict both. An unrestricted key found in a repository is drained within
hours by automated scanners.

**Key A — goes in the app.** Name it `2l-maps-android-client`.

| Setting | Value |
|---|---|
| Application restrictions | **Android apps** |
| Package name | `com.doppiaelle.twolmaps` |
| SHA-1 certificate fingerprint | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| API restrictions | **Maps SDK for Android only** |

> That SHA-1 is not a secret and is knowable before any build exists: Expo ships a fixed
> `debug.keystore`, so every development build from every machine is signed with it. It is also
> not a release credential, which is why it may only ever be paired with a key restricted to
> the Maps SDK ([`19_SECURITY.md`](19_SECURITY.md) §5).

**Key B — goes in Supabase, never in the app.** Name it `2l-maps-server`.

| Setting | Value |
|---|---|
| Application restrictions | **None** — it is called from a server, which has no package name |
| API restrictions | Routes API, Places API (New), Geocoding API |

### Step 5 — Supabase: create the project

**Where:** [supabase.com/dashboard](https://supabase.com/dashboard) → New project

Choose a region close to you (`eu-central-1` for Italy). **Save the database password** — it is
shown once and step 8 needs it.

Then **Settings → API** and copy three things:

| What | Looks like | Where it goes |
|---|---|---|
| Project URL | `https://abcdefgh.supabase.co` | GitHub secret `SUPABASE_URL` |
| `anon` `public` key | a long `eyJ…` string | GitHub secret `SUPABASE_ANON_KEY` |
| Project ref | `abcdefgh` — the part before `.supabase.co` | GitHub secret `SUPABASE_PROJECT_REF` |

> The anon key is **public by design**. It grants nothing on its own: every table has
> row-level security, and access is decided server-side ([ADR-0011](adr/0011-server-side-quota-enforcement.md)).
> The `service_role` key on the same page is the opposite — it bypasses everything. Never copy
> that one anywhere.

### Step 6 — Google Cloud: an OAuth client for sign-in

**Where:** **APIs & Services → Credentials → Create credentials → OAuth client ID**

If asked to configure a consent screen first: **External**, app name "2L Maps", your own email
for both contact fields, save. No verification is needed while you are the only user.

| Setting | Value |
|---|---|
| Application type | **Web application** — web, not Android |
| Authorised redirect URI | `https://<your-project-ref>.supabase.co/auth/v1/callback` |

> Web and not Android, even though this is an Android app. The browser talks to Supabase's auth
> server; Supabase talks to Google. An Android OAuth client would be for an app that talks to
> Google directly, which this one does not.

Copy the **Client ID** and **Client secret**.

### Step 7 — Supabase: turn on Google sign-in

**Where:** **Authentication → Providers → Google**

1. Enable it, paste the Client ID and Client secret from step 6, save.
2. Go to **Authentication → URL Configuration** and make sure the Redirect URLs list contains:

   ```
   twolmaps://auth-callback
   ```

> Sign-in is the first thing the app does and everything else is behind it. A redirect the auth
> server does not recognise is refused with an error page in a browser you did not ask to open.

### Step 8 — Supabase: the Edge Function secrets

**Where:** **Settings → Edge Functions → Secrets** (or `supabase secrets set NAME=value`)

| Secret name | Value |
|---|---|
| `GOOGLE_SERVER_API_KEY` | **Key B** from step 4 |

Optional, only if you want the AI import today:

| Secret name | Value |
|---|---|
| `PARSE_PROVIDER` | `openrouter` |
| `OPENROUTER_API_KEY` | a key from [openrouter.ai](https://openrouter.ai) → Keys |

> **Do not set** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or
> `SUPABASE_DB_URL`. The platform injects all four into every function; setting them by hand
> creates a second copy that will eventually be wrong.
>
> **Before switching the parser to OpenRouter, read [ADR-0017](adr/0017-parse-provider-switch.md).**
> Many free inference endpoints retain prompts for training, and a pasted delivery list is your
> customers' addresses rather than your own. Fine for test data; a decision to take deliberately
> before real ones. **The import works without any of this** — the line splitter is the primary
> path and needs no key at all.

### Step 9 — GitHub: the secrets, in two different places

Two scopes, and putting one in the wrong place fails with a confusing error.

**9a — Repository secrets.** **Settings → Secrets and variables → Actions → Repository secrets**

| Secret name | Value |
|---|---|
| `MAPS_API_KEY_ANDROID` | **Key A** from step 4 |
| `SUPABASE_URL` | the project URL from step 5 |
| `SUPABASE_ANON_KEY` | the anon key from step 5 |

**9b — Environment secrets.** Same page → **Environments** → New environment → name it exactly
`staging` → add three secrets **inside it**:

| Secret name | Value |
|---|---|
| `SUPABASE_PROJECT_REF` | the project ref from step 5 |
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → Generate new token |
| `SUPABASE_DB_PASSWORD` | the database password from step 5 |

> The split is not arbitrary: the migration workflow runs against a named GitHub Environment, so
> its secrets have to live in that environment. The build workflow does not, so its secrets are
> repository-wide. A migration secret set at repository level is simply invisible to the
> workflow that needs it.

---

## 4. Running it

**Where:** the repository on GitHub → **Actions**

1. **`migrate`** → Run workflow → environment `staging` → Run.
   Creates every table, policy, function and the coordinate purge job. **Do this before the
   build**, or the app signs in successfully and then fails on everything it tries to read.
2. **`android-preview`** → Run workflow → Run.
   Takes about ten minutes. When it finishes, open the run → **Artifacts** →
   `2l-maps-development-build` → download → unzip → transfer the `.apk` to your phone and open
   it. Android will ask permission to install from an unknown source; that is expected.

---

## 5. Checking it worked

In order — each one exercises a different piece, so where it stops tells you which step to
revisit.

| What you do | What should happen | If not |
|---|---|---|
| Open the app, tap **Continue with Google** | A Google page opens, you choose an account, the app comes back signed in | Steps 6 and 7 |
| The map appears | Streets and labels, not a grey rectangle | Step 4 Key A — check the SHA-1 and package name |
| Type three characters in **Add stop** | Address suggestions appear | Step 8 `GOOGLE_SERVER_API_KEY`, or step 2 Places API (New) |
| Add two stops, tap **Optimize** | The order changes and a route draws | Step 2 Routes API |
| Tap **Start** | Google Maps or Waze opens with the route | The app you chose is installed |
| Close the app entirely, reopen it | The route is still there | Step 9a Supabase secrets |
| Open **History** | The route is listed | Step 4 `migrate` ran successfully |
| Add a stop, reopen **Add stop** | It appears under Recent, with no network call | Nothing — this one is local |

---

## 6. What a grey map means

It is the one failure with no error message anywhere, so it is worth naming: **the map renders
grey when the Maps key rejects the app.** Tiles simply never load. Three causes, in order of
likelihood:

1. The SHA-1 in step 4 does not match the one the APK was signed with. The `android-preview`
   run prints the fingerprint it actually used — compare them.
2. The package name is not exactly `com.doppiaelle.twolmaps`.
3. The key's API restrictions do not include Maps SDK for Android.

---

## 7. Costs

| Item | Cost for testing |
|---|---|
| Google Cloud | Effectively €0. The free monthly allowances far exceed one person testing, and step 1 and step 3 cap what happens if something loops |
| Supabase | €0 on the free tier |
| GitHub Actions | €0 — the workflows run on Linux runners, billed at 1× and free for public repositories |
| OpenRouter | €0 on a free model |

Nothing in this document requires a payment method beyond the one Google Cloud asks for to
enable billing at all.

---

## 8. Decision log

| Date | Decision | Rationale | Decided by |
|---|---|---|---|
| 2026-08-10 | A quick-start separate from the go-live runbook | The runbook is correct and long; a first test abandoned halfway through it is a first test that does not happen | Product owner |
| 2026-08-10 | Analytics, ads, billing and iOS excluded | Each is a separate account for something that cannot be observed on a first run | Product owner |
| 2026-08-10 | Budget and quotas before any key is created | The risk begins when the credential exists, not when code calls it | Product owner |
