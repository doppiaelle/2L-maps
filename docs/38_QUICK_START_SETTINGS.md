# 38 — Quick Start Settings

> **Status:** Approved
> **Owner:** Product owner
> **Last reviewed:** 2026-08-18
> **Related:** [`37_GO_LIVE_RUNBOOK.md`](37_GO_LIVE_RUNBOOK.md) · [`19_SECURITY.md`](19_SECURITY.md)

---

> ⚠️ **Migration notice — current setup only.** This guide provisions the implemented
> Google-era application. It must not be used as the HERE target setup. Google location secrets
> will be removed after cutover; Supabase values remain; Google OAuth remains initially.
>
> The replacement sequence is controlled by
> [`41_HERE_MIGRATION_PROGRAM.md`](41_HERE_MIGRATION_PROGRAM.md). The only product-owner
> prerequisites currently missing are: create a HERE Base Plan account, register Android and iOS
> apps, request/accept an acceptable Navigate quote, and make the licensed Flutter SDK package
> available through a private channel. Until then, do not delete working Google location secrets
> or claim that HERE navigation is configured.

## 1. Purpose

**The shortest path from nothing to the app running on an Android phone.**

The shape of it is: **collect eight values from two consoles, paste them into three places, run
two workflows.** Nothing is ever pasted into a file, into the app, or into this repository — the
build reads them from GitHub, the server reads them from Supabase.

This is not [`37_GO_LIVE_RUNBOOK.md`](37_GO_LIVE_RUNBOOK.md). That is the full go-live
procedure and it is what to read before real users. **This one leaves out everything a first
test does not need:** analytics, advertising, billing, Apple sign-in, iOS, Cloud Map Styling
and a release keystore.

---

## 2. Does any of this cost money?

**No.** Nothing in this document is a purchase, and no step commits you to spending.

| Service | Card needed? | What you pay for testing |
|---|---|---|
| **Supabase** | No | €0 — free tier, no card at all |
| **GitHub Actions** | No | €0 — Linux runners, free on public repositories |
| **OpenRouter** *(optional)* | No | €0 — free models |
| **Google Cloud** | **Yes, a card must be on file** | €0 in practice — see below |

**Google is the only one that asks for a card**, and it asks in order to *enable* the Maps APIs
at all, not in order to charge you. Every Google Maps API has a **free monthly allowance —
roughly 10,000 calls per month per Essentials SKU** since March 2025
([`33_API_CONTRACTS.md`](33_API_CONTRACTS.md) §8). One person testing makes tens of calls a
day, not thousands.

**A budget is not a payment and not a commitment.** It is a threshold that sends you an email.
Setting a €20 budget does not reserve, charge or promise €20 — it means "tell me if I ever
approach this", and you will not.

**The thing that actually stops spending is the per-API quota** in step 3. A budget notifies
after the fact; a quota refuses the request. Set both, and a runaway loop becomes a broken
feature instead of a bill.

---

## 3. The eight values, and where each one ends up

Write these down as you go. **Every one of them is collected in part A and pasted in part B** —
nothing is used anywhere else, and nothing goes into a file in this repository.

| # | Value | Collected in | Pasted into |
|---|---|---|---|
| ① | Supabase **Project URL** | Step 1 | GitHub repository secret `SUPABASE_URL` |
| ② | Supabase **anon key** | Step 1 | GitHub repository secret `SUPABASE_ANON_KEY` |
| ③ | Supabase **project ref** | Step 1 | GitHub *environment* secret `SUPABASE_PROJECT_REF` |
| ④ | Supabase **database password** | Step 1 | GitHub *environment* secret `SUPABASE_DB_PASSWORD` |
| ⑤ | Supabase **access token** | Step 1 | GitHub *environment* secret `SUPABASE_ACCESS_TOKEN` |
| ⑥ | Google **Android API key** | Step 4 | GitHub repository secret `MAPS_API_KEY_ANDROID` |
| ⑦ | Google **server API key** | Step 4 | Supabase secret `GOOGLE_SERVER_API_KEY` |
| ⑧ | Google **OAuth client ID + secret** | Step 5 | Supabase → Authentication → Providers → Google |

Six go to GitHub, two go to Supabase. That is the whole picture.

---

# Part A — collect the eight values

## Step 1 — Supabase: create the project → gives you ①②③④⑤

**Go to:** [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**

- Name: anything. Region: **`eu-central-1`** if you are in Italy.
- It generates a **database password**. **Copy it now** — it is shown once. → this is **④**

Wait for the project to finish provisioning, then:

**Go to:** **Settings → API**

- **Project URL** — looks like `https://abcdefgh.supabase.co` → this is **①**
- **Project API keys → `anon` `public`** — a long string starting `eyJ` → this is **②**
- The **project ref** is the part of the URL before `.supabase.co`, e.g. `abcdefgh` → this is **③**

> ⚠️ On the same page there is a **`service_role`** key. **Do not copy it anywhere.** The anon
> key is public by design and grants nothing on its own — every table has row-level security.
> The service-role key bypasses all of it.

**Go to:** [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
→ **Generate new token** → name it `2l-maps-ci` → copy it → this is **⑤**

## Step 2 — Google Cloud: project, billing, budget

**Go to:** [console.cloud.google.com](https://console.cloud.google.com) → **Select a project →
New project** → name it `2l-maps`.

**Go to:** **Billing** → link a billing account, adding a card if you have none.

> This is the card step. It enables the APIs; it does not charge you. See §2.

**Go to:** **Billing → Budgets & alerts → Create budget**

- Amount: **€20/month**
- Alert thresholds: 50%, 90%, 100%

## Step 3 — Google Cloud: enable four APIs, then cap them

**Go to:** **APIs & Services → Library**. Search each name, open it, press **Enable**:

| API | Used for |
|---|---|
| Maps SDK for Android | Drawing the map |
| Routes API | Optimizing the stop order |
| **Places API (New)** | Address search — the one with "(New)", not the legacy "Places API" |
| Geocoding API | Turning pasted addresses into places |

Then, for **each** of the four:

**Go to:** **APIs & Services → [the API] → Quotas & System Limits** → find the per-day request
quota → **Edit** → set **500 per day**.

> 500 a day is far more than one person can use and turns a runaway loop into a dead feature
> rather than a bill. This is the control that actually stops spending.

## Step 4 — Google Cloud: two API keys → gives you ⑥⑦

**Go to:** **APIs & Services → Credentials → Create credentials → API key**

Do this **twice**. Each time, press **Edit API key** immediately after it is created and apply
the restrictions below — an unrestricted key found in a repository is drained within hours by
automated scanners.

### Key ⑥ — name it `2l-maps-android`

| Field | Set it to |
|---|---|
| Application restrictions | **Android apps** → Add → |
| · Package name | `com.doppiaelle.twolmaps` |
| · SHA-1 certificate fingerprint | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| API restrictions | **Restrict key** → tick **Maps SDK for Android** only |

**Where it goes:** GitHub repository secret `MAPS_API_KEY_ANDROID`, in step 6.
**You never paste it into the app yourself** — the build workflow injects it when it compiles
the APK.

> The SHA-1 above is not a secret and is already known before any build exists: Expo ships a
> fixed `debug.keystore`, so every development build is signed with it. It is also not a release
> credential, which is why it may only ever be paired with a key restricted to the Maps SDK
> ([`19_SECURITY.md`](19_SECURITY.md) §5).

### Key ⑦ — name it `2l-maps-server`

| Field | Set it to |
|---|---|
| Application restrictions | **None** — it is called from a server, which has no package name |
| API restrictions | **Restrict key** → tick **Routes API**, **Places API (New)**, **Geocoding API** |

**Where it goes:** Supabase secret `GOOGLE_SERVER_API_KEY`, in step 7. **Never into the app.**

## Step 5 — Google Cloud: an OAuth client for sign-in → gives you ⑧

**Go to:** **APIs & Services → Credentials → Create credentials → OAuth client ID**

If it asks you to configure a consent screen first: **External** → app name `2L Maps` → your own
email in both contact fields → Save and continue through the remaining screens. No verification
is needed while you are the only user.

| Field | Set it to |
|---|---|
| Application type | **Web application** |
| Name | `2l-maps-auth` |
| Authorised redirect URIs → Add URI | `https://<③>.supabase.co/auth/v1/callback` |

Substitute **③** — your project ref. With `abcdefgh` it reads
`https://abcdefgh.supabase.co/auth/v1/callback`.

> **Web, not Android**, even though this is an Android app. The browser talks to Supabase's auth
> server, and Supabase talks to Google. An Android OAuth client is for an app that talks to
> Google directly, which this one never does.

Copy the **Client ID** and the **Client secret** → together these are **⑧**

---

# Part B — paste them into three places

## Step 6 — GitHub secrets, in two different scopes

**Go to:** your repository on GitHub → **Settings → Secrets and variables → Actions**

### 6a — Repository secrets

Press **New repository secret**, three times:

| Name (type it exactly) | Value |
|---|---|
| `MAPS_API_KEY_ANDROID` | ⑥ |
| `SUPABASE_URL` | ① |
| `SUPABASE_ANON_KEY` | ② |

### 6b — Environment secrets

Same page → **Environments** tab → **New environment** → name it exactly **`staging`** → Create.

Now, **inside that environment**, press **Add environment secret**, three times:

| Name (type it exactly) | Value |
|---|---|
| `SUPABASE_PROJECT_REF` | ③ |
| `SUPABASE_DB_PASSWORD` | ④ |
| `SUPABASE_ACCESS_TOKEN` | ⑤ |

> **The split is not arbitrary and it is the easiest thing to get wrong.** The migration
> workflow runs against a named GitHub Environment, so its secrets must live inside that
> environment. The build workflow does not, so its secrets are repository-wide. A migration
> secret set at repository level is simply invisible to the workflow that needs it, and the
> error message does not say so.

## Step 7 — Supabase: the server key

**Go to:** Supabase → **Settings → Edge Functions → Secrets** → **Add new secret**

| Name | Value |
|---|---|
| `GOOGLE_SERVER_API_KEY` | ⑦ |

Optional, only if you want AI-assisted import today — **the import works without it**, because
the line splitter is the primary path and needs no key:

| Name | Value |
|---|---|
| `PARSE_PROVIDER` | `openrouter` |
| `OPENROUTER_API_KEY` | a key from [openrouter.ai](https://openrouter.ai) → Keys |

> **Do not set** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or
> `SUPABASE_DB_URL` here. The platform injects all four into every function automatically;
> setting them by hand creates a second copy that will eventually be wrong.
>
> Before switching the parser to OpenRouter, read [ADR-0017](adr/0017-parse-provider-switch.md):
> many free inference endpoints retain prompts for training, and a pasted delivery list is your
> customers' addresses rather than your own. Fine for test data, a deliberate decision before
> real ones.

## Step 8 — Supabase: turn on Google sign-in

**Go to:** Supabase → **Authentication → Providers → Google** → toggle **Enable**

| Field | Value |
|---|---|
| Client ID | the client ID from ⑧ |
| Client secret | the client secret from ⑧ |

Save. Then **Authentication → URL Configuration** → under **Redirect URLs**, make sure this
line is present, adding it if not:

```
twolmaps://auth-callback
```

> Sign-in is the first thing the app does and every other screen is behind it. A redirect the
> auth server does not recognise is refused with an error page in a browser you did not ask to
> open.

---

# Part C — run it

**Go to:** your repository on GitHub → **Actions**

1. **`migrate`** → *Run workflow* → environment **`staging`** → *Run workflow*.
   Creates every table, policy and function, and schedules the coordinate purge job.
   **Do this before the build.** Otherwise sign-in succeeds and everything after it fails.

   > **The first run ends red, and that is expected.** The migrations apply
   > successfully; the last step then fails because `types/database.generated.ts` does
   > not exist in the repository yet — this run is what produces it. Open the run →
   > **Artifacts** → **`database-types`** → download → commit the file to
   > `types/database.generated.ts` → re-run the workflow. **Your database is already
   > migrated either way**, so you can also just carry on to the build and tidy this up
   > later.
2. **`deploy-functions`** → *Run workflow* → environment **`staging`** → *Run workflow*.
   About a minute.

   > **Without this, address search returns nothing and the parser does nothing**, with
   > no error anywhere. The migrations create the tables; this deploys the code that
   > talks to Google. Sign-in and the map work without it, which is what makes its
   > absence so hard to spot.

3. **`android-preview`** → *Run workflow* → leave **Which build** on **`standalone`** →
   *Run workflow*.

   **First run: 15–25 minutes. After that: 5–10.** Gradle downloads its own
   distribution and every Android dependency before compiling anything, and only the
   second run finds them cached. A build that has been going for half an hour is
   almost certainly working rather than stuck — Gradle prints an `EXECUTING [12m]`
   progress line, and GitHub kills a job at six hours regardless.

   When it finishes: open the run → **Artifacts** → **`2l-maps-standalone`** →
   download → unzip → send the `.apk` to your phone → open it. Android will warn
   about installing from an unknown source; that is expected.

   The APK is built for **`arm64-v8a` only** — every Android phone sold since about
   2017. It will not install on an x86 emulator or a 32-bit device; if you ever need
   one, add the architectures back in `.github/workflows/android-preview.yml`.

### The two variants, and why `standalone` is the default

| | `standalone` | `dev-server` |
|---|---|---|
| Contains the JavaScript | **Yes** — install and it runs | No — it fetches it over the network |
| On first open | The app | A dashboard asking for a server URL |
| Needs a computer | No | **Yes** — one running `npx expo start` on the same wifi |
| To see a change | Run this workflow again, 5–10 min | Save the file; the phone reloads in seconds |

**If you pick `dev-server` without a machine running Metro, the app cannot start at
all** — the dashboard it shows is not an error, it is the build waiting for a server
that does not exist. That is what makes `standalone` the right default, even though
its edit-to-phone loop is far slower.

**Both are signed with the same key**, so the SHA-1 you registered in step 4 is
correct for either and nothing needs changing to switch between them.

If you do have a computer with Node, the fast loop is worth setting up later: clone
the repository, `npm ci`, `npx expo start`, install the `dev-server` APK once, and
scan the QR code it prints.

---

## 4. Checking it worked

In order. Each row exercises a different piece, so wherever it stops tells you which step to
revisit.

| Do this | Should happen | If it does not |
|---|---|---|
| Open the app, tap **Continue with Google** | A Google page opens; after choosing an account the app comes back signed in | See below |
| Look at the map | Streets and labels | Key ⑥ — see §5 below |
| Type three characters in **Add stop** | Address suggestions appear | Step 7 `GOOGLE_SERVER_API_KEY`, or Places API **(New)** not enabled |
| Add two stops, tap **Optimize** | The order changes and a line draws | Routes API not enabled |
| Tap **Start** | Google Maps or Waze opens with the route | That app is not installed on the phone |
| Close the app fully, reopen it | The route is still there | Step 6a |
| Open **History** | The route is listed | `migrate` did not run, or failed |
| Add a stop, then reopen **Add stop** | It is there under Recent, instantly | Nothing — this one is local |

### "Sign-in is not available in this build"

This is not about Google or Supabase configuration. It means the app was built
**without `SUPABASE_URL` and `SUPABASE_ANON_KEY`** — `readSupabaseConfig` returned null,
so there is no auth client at all.

Those two are *repository* secrets (step 6a), not environment secrets. If they were
added after the build ran, or added to the `staging` environment by mistake, the build
compiled them in as empty. Check the spelling, check the scope, and run
`android-preview` again.

"Sign-in did not complete" is the other message and means something different: the
client exists and the round trip failed. That one points at steps 5 and 8.

## 5. A grey map

The one failure with no error message anywhere, so it is worth naming: **a grey rectangle means
the Maps key rejected the app.** Tiles never load and nothing is reported. Three causes, in
order of likelihood:

1. **The SHA-1 does not match.** The `android-preview` run prints the fingerprint the APK was
   actually signed with — open the run log and compare it to what you registered on key ⑥.
2. **The package name is not exactly** `com.doppiaelle.twolmaps`.
3. **The key's API restrictions** do not include Maps SDK for Android.

## 6. Decision log

| Date | Decision | Rationale | Decided by |
|---|---|---|---|
| 2026-08-10 | A quick-start separate from the go-live runbook | The runbook is correct and long; a first test abandoned halfway through a correct document is a first test that does not happen | Product owner |
| 2026-08-10 | Analytics, ads, billing and iOS excluded | Each is a separate account for something that cannot be observed on a first run | Product owner |
| 2026-08-10 | Collect-then-paste structure, with every value numbered | The first draft said a key "goes in the app", which is not a place anybody can go. Every value now names its destination before it is created | Product owner |
| 2026-08-10 | §2 states plainly that nothing here is a purchase | A budget threshold reads as a spending commitment, and the free allowances are the reason none of this costs anything | Product owner |
