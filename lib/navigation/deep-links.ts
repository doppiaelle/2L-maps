/**
 * Deep links, parsed and validated before anything navigates.
 *
 * A deep link is **untrusted input** (`CLAUDE.md` §3): it arrives from a
 * notification, a browser, a message, or anything else on the device that can
 * open a URL. It is `unknown` until parsed, exactly like a network response.
 *
 * The rule this file enforces is that a link resolves to a *working* surface
 * rather than a viewing one ([`docs/10_NAVIGATION_FLOW.md`](../../docs/10_NAVIGATION_FLOW.md)
 * §6): `2lmaps://route/{id}` opens Plan with that route loaded, not a read-only
 * detail screen, because opening a route is something the user does in order to
 * work on it ([`docs/05_INFORMATION_ARCHITECTURE.md`](../../docs/05_INFORMATION_ARCHITECTURE.md)).
 *
 * Parsing is separated from resolving on purpose. Whether the route exists and
 * belongs to this user is a server question answered after navigation, and
 * conflating it with "is this URL well formed" would mean a malformed link and
 * a deleted route produce the same message.
 */

/** Declared in `app.config.ts`. A link with any other scheme is not ours. */
export const APP_SCHEME = 'twolmaps';

/** The public scheme in the documentation, kept working because it has been
 *  written down and may already have been shared. Both resolve identically. */
export const LEGACY_SCHEME = '2lmaps';

export type DeepLinkTarget =
  | { readonly kind: 'route'; readonly routeId: string }
  | { readonly kind: 'history' }
  | { readonly kind: 'settings'; readonly section: 'subscription' | null };

export type DeepLinkResolution =
  | { readonly ok: true; readonly target: DeepLinkTarget }
  /**
   * Every failure lands on Plan. The reason is carried anyway, because
   * `not-ours` is somebody else's link arriving by mistake and `malformed-id`
   * is a link of ours that was truncated or tampered with — the first is noise,
   * the second is worth logging (docs/10 §10).
   */
  | { readonly ok: false; readonly reason: 'not-ours' | 'unknown-path' | 'malformed-id' };

/** Canonical v4-shaped UUID, which is what `routes.id` is (docs/12_DATABASE.md).
 *  Checked here so a crafted id never reaches a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Parse a deep link.
 *
 * Deliberately hand-rolled rather than delegated to `expo-linking`'s parser:
 * that returns a loose shape with optional everything, and the point here is to
 * end up with a value that cannot be wrong. It also keeps this function pure,
 * so every launch scenario is tested without a device.
 */
export function parseDeepLink(url: string): DeepLinkResolution {
  const separator = url.indexOf('://');
  if (separator === -1) return { ok: false, reason: 'not-ours' };

  const scheme = url.slice(0, separator).toLowerCase();
  if (scheme !== APP_SCHEME && scheme !== LEGACY_SCHEME) return { ok: false, reason: 'not-ours' };

  // Query and fragment are dropped before splitting: nothing in this product
  // takes a deep-link parameter, and accepting one would be an input surface
  // added for no feature.
  const path = url.slice(separator + 3).split(/[?#]/)[0] ?? '';
  const segments = path.split('/').filter((segment) => segment !== '');

  const [first, second] = segments;

  switch (first) {
    case undefined:
      // `twolmaps://` on its own. Opening the app at Plan is exactly right, and
      // it is not an error to report.
      return { ok: false, reason: 'unknown-path' };

    case 'route': {
      if (second === undefined || !UUID.test(second)) return { ok: false, reason: 'malformed-id' };
      return { ok: true, target: { kind: 'route', routeId: second.toLowerCase() } };
    }

    case 'history':
      return { ok: true, target: { kind: 'history' } };

    case 'settings': {
      // An unrecognised subsection opens Settings rather than failing: the user
      // asked for Settings and we can honour that much.
      const section = second === 'subscription' ? 'subscription' : null;
      return { ok: true, target: { kind: 'settings', section } };
    }

    default:
      return { ok: false, reason: 'unknown-path' };
  }
}

/** Whether a failed link is worth recording. Somebody else's URL arriving by
 *  mistake is noise; one of ours that did not parse is a defect or an attempt. */
export function isWorthLogging(
  reason: Exclude<DeepLinkResolution, { ok: true }>['reason'],
): boolean {
  return reason === 'malformed-id';
}
