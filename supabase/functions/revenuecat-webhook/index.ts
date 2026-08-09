import { handleRevenueCatWebhook } from '../_shared/endpoints/revenuecat-webhook';
import { serveWith } from '../_shared/serve';
import { defaultLimits } from '../_shared/runtime';

/**
 * `POST /revenuecat-webhook` — the **only** writer of `user_entitlements`
 * (docs/33_API_CONTRACTS.md).
 *
 * No decisions here; signature verification and ordering live in the shared
 * module, where they are tested. An unverified webhook is an open door to free
 * entitlement (CLAUDE.md §9 rule 6), so that check is not something to leave in
 * an unchecked file.
 */
serveWith(handleRevenueCatWebhook, defaultLimits);
