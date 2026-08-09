/**
 * HMAC, and the one secret it needs.
 *
 * Web Crypto rather than a Deno- or Node-specific module, so this file runs
 * unchanged in both and the webhook's verification path is exercisable by the
 * test suite rather than only in production — which, for the check that stands
 * between an attacker and free entitlement, is the difference that matters
 * (`CLAUDE.md` §9 rule 6).
 */

interface DenoEnv {
  env: { get: (key: string) => string | undefined };
}
declare const Deno: DenoEnv | undefined;

export function revenueCatSecret(): string {
  const value = typeof Deno === 'undefined' ? undefined : Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (value === undefined || value === '') {
    // Fail at wiring rather than at verification: a webhook handler running
    // without its secret would reject every legitimate event, which looks like
    // a RevenueCat outage rather than our misconfiguration.
    throw new Error('Missing required secret: REVENUECAT_WEBHOOK_SECRET');
  }
  return value;
}

/** Hex-encoded HMAC-SHA256, the form RevenueCat sends. */
export async function hmacSha256(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));

  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
