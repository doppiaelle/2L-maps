import { createQuotaHandler } from '../_shared/handler';
import { serveWith } from '../_shared/serve';
import { defaultLimits } from '../_shared/runtime';
import { readUsageQuota } from '../_shared/endpoints/usage-quota';

/**
 * `/usage-quota` — the authoritative source of plan and allowances
 * ([ADR-0011](../../../docs/adr/0011-server-side-quota-enforcement.md)).
 *
 * Unmetered: it consumes no quota and calls nothing upstream, so it can still
 * answer the user who has run out — which is exactly who asks.
 */
serveWith(
  createQuotaHandler((userId) => readUsageQuota(userId)),
  defaultLimits,
);
