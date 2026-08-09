# Play Data safety — the answers

Google's Data safety form is filled in by hand in the console; this file is what it is filled in
*from*, so the answers are reviewable in a diff rather than remembered.

It must match [`../docs/21_ANALYTICS.md`](../docs/21_ANALYTICS.md) and
`PrivacyInfo.xcprivacy` in this directory. Three declarations of the same behaviour that disagree
is worse than one that is wrong, because it is not obvious which is the lie.

## Data collected

| Type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Purchase history | Yes | No | No | Entitlement — the server decides access from it (ADR-0011) |
| User ID | Yes | No | No | The account the entitlement belongs to |
| Crash logs | Yes | No | Yes | Diagnostics, with no personal payload |
| Approximate location | **No** | — | — | See below |
| Precise location | **No** | — | — | See below |
| Address / place data | **No** | — | — | See below |

## Why location is "no"

The app asks for location to centre the map and to bias autocomplete. It is **used**, and it is
never **collected**: nothing leaves the device with a coordinate attached to a user, and the
Edge Functions receive a `place_id` rather than a position
([`../docs/18_PERMISSIONS.md`](../docs/18_PERMISSIONS.md)).

Google's form asks about collection, not use. Answering "yes" here to be cautious would be
inaccurate in the other direction, and the console's own guidance is explicit that transient
in-app use is not collection.

## Why addresses are "no"

A route's stops are stored server-side as `place_id`s, and the coordinates and formatted
addresses beside them are purged at thirty days by a job
([`../docs/12_DATABASE.md`](../docs/12_DATABASE.md), ADR-0007). What is retained indefinitely is
the identifier and the user's own label — the label is user content, which the form treats
separately and which is not shared.

## Security practices

- In transit encryption: **yes**, all traffic is HTTPS with no exception.
- Deletion request path: **yes**, account deletion removes the rows by cascade.
- Independent security review: **no**. Answering otherwise without one is a false statement on a
  legal form.
