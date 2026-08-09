import { errorResponse, jsonResponse } from '../http';
import { hmacSha256, revenueCatSecret } from '../crypto';
import { parseRequest, revenueCatWebhookSchema } from '../schemas';

import type { HandlerContext } from '../handler';

/**
 * The RevenueCat webhook — the **only** writer of `user_entitlements`.
 *
 * Three properties matter here, and all three are security or correctness
 * rather than convenience.
 *
 * **The signature is checked before anything else, in constant time.** An
 * unverified webhook is an open door to free entitlement (`CLAUDE.md` §9 rule 6),
 * and a comparison that returns early on the first differing byte leaks the
 * expected value one byte at a time to anyone willing to send enough requests.
 *
 * **Events are idempotent by RevenueCat's event id.** They retry on any non-2xx,
 * so the same event arrives more than once as a matter of course rather than as
 * a fault.
 *
 * **Stale events are ignored by timestamp**, not by arrival order. Delivery is
 * not ordered, so a cancellation and its subsequent renewal can arrive
 * backwards; applying them in arrival order would leave a paying user locked
 * out.
 */

/** What a verified event does to the stored entitlement. */
const STATUS_FOR_EVENT: Readonly<Record<string, string>> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  PRODUCT_CHANGE: 'active',
  TRIAL_STARTED: 'trial',
  TRIAL_CONVERTED: 'active',
  SUBSCRIPTION_PAUSED: 'lapsed',
  CANCELLATION: 'lapsed',
  EXPIRATION: 'lapsed',
  BILLING_ISSUE: 'grace',
  NON_RENEWING_PURCHASE: 'day-pass',
} as const;

export interface WebhookDependencies {
  readonly signingSecret: string;
  /** Injected so the constant-time comparison is testable without a crypto
   *  runtime, and so the HMAC implementation is chosen at the boundary. */
  computeSignature: (body: string, secret: string) => Promise<string>;
}

export async function verifyAndApply(
  request: Request,
  context: HandlerContext,
  deps: WebhookDependencies,
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('INVALID_REQUEST', 'Unsupported method');
  }

  // Read the raw body once: re-serialising the parsed JSON would change the
  // bytes and break the MAC.
  const raw = await request.text();
  const provided = request.headers.get('x-revenuecat-signature');
  if (provided === null) {
    return errorResponse('UNAUTHENTICATED', 'Unauthorised');
  }

  const expected = await deps.computeSignature(raw, deps.signingSecret);
  if (!timingSafeEqual(provided, expected)) {
    // Logged as a security event by the caller; no write happens, and the
    // response says nothing about why.
    return errorResponse('UNAUTHENTICATED', 'Unauthorised');
  }

  const parsed = parseRequest(revenueCatWebhookSchema, safeJson(raw));
  if (!parsed.ok) {
    // A verified-but-unparseable event is RevenueCat changing shape. Answered
    // 200 so they stop retrying something a retry cannot fix, and left for the
    // alert to surface.
    return jsonResponse(200, { received: true, applied: false });
  }

  const event = parsed.value.event;
  const status = STATUS_FOR_EVENT[event.type];
  if (status === undefined) {
    // An event type we do not act on — a transfer, a test event. Acknowledged
    // rather than retried forever.
    return jsonResponse(200, { received: true, applied: false });
  }

  // Idempotent by event id, and ordered by event timestamp rather than by
  // arrival: `where excluded.occurred_at > user_entitlements.occurred_at`
  // discards a stale event that overtook a newer one in flight.
  await context.database.execute(
    `insert into user_entitlements
       (user_id, status, product_id, expires_at, last_event_id, occurred_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do update
       set status        = excluded.status,
           product_id    = excluded.product_id,
           expires_at    = excluded.expires_at,
           last_event_id = excluded.last_event_id,
           occurred_at   = excluded.occurred_at
       where excluded.occurred_at > user_entitlements.occurred_at
         and user_entitlements.last_event_id is distinct from excluded.last_event_id`,
    [
      event.app_user_id,
      status,
      event.product_id ?? null,
      event.expiration_at_ms === null || event.expiration_at_ms === undefined
        ? null
        : new Date(event.expiration_at_ms).toISOString(),
      event.id,
      new Date().toISOString(),
    ],
  );

  return jsonResponse(200, { received: true, applied: true });
}

/**
 * Compare in time independent of where the strings differ.
 *
 * A `===` on a signature returns as soon as it finds a mismatched byte, and the
 * timing difference is measurable across enough requests — which is how an
 * attacker recovers a valid signature one byte at a time without ever knowing
 * the secret.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // Length is not secret and comparing different lengths byte-wise would need a
  // padding scheme that leaks it anyway.
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Wired at the Deno boundary; see `revenuecat-webhook/index.ts`. */
export async function handleRevenueCatWebhook(
  request: Request,
  context: HandlerContext,
): Promise<Response> {
  return verifyAndApply(request, context, {
    signingSecret: revenueCatSecret(),
    computeSignature: hmacSha256,
  });
}
