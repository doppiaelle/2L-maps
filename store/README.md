# Store assets and declarations

Everything the two stores need that is not the binary. Kept in the repository because each of
these is a claim about the app's behaviour, and a claim that lives only in a console drifts from
the code without anyone noticing.

| File | Goes to | Reviewed against |
|---|---|---|
| `PrivacyInfo.xcprivacy` | Apple, via prebuild | [`../docs/21_ANALYTICS.md`](../docs/21_ANALYTICS.md) — what is actually collected |
| `data-safety.md` | Google Play console, by hand | The same document |
| `metadata/` | Both, via Fastlane | [`../docs/26_APP_STORE.md`](../docs/26_APP_STORE.md), [`../docs/27_PLAY_STORE.md`](../docs/27_PLAY_STORE.md) |

**Nothing here is generated.** Each is written once and re-read before every submission that
touches the paywall, the analytics, or the permissions — those three are what a rejection is
usually about.
