import { createQuotaHandler } from '../_shared/handler.ts';
import { serveWith } from '../_shared/serve.ts';
import { defaultLimits } from '../_shared/runtime.ts';
import { readUsageQuota } from '../_shared/endpoints/usage-quota.ts';

/**
 * `/usage-quota` — the authoritative source of plan and allowances
 * ([ADR-0011](../../../docs/adr/0011-server-side-quota-enforcement.md)).
 *
 * Unmetered: it consumes no quota and calls nothing upstream, so it can still
 * answer the user who has run out — which is exactly who asks.
 */
serveWith(
  // The context is passed, not dropped. `readUsageQuota` reads the entitlement
  // row and the month's usage through it, so a call without it answers every
  // request with an internal error — which is what this file used to do.
  createQuotaHandler((userId, context) => readUsageQuota(userId, context)),
  defaultLimits,
);
