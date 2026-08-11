/**
 * What Google said when it refused.
 *
 * **This exists because the documentation is not reachable from where this code
 * is written, and guessing at it has now cost three deployments.**
 * `includedPrimaryTypes: ['address']` was written from memory; Places refused
 * every request carrying it and address search stopped answering for everybody.
 * The status code — 400 — said only that we were wrong about something.
 *
 * Google says considerably more than that, and both adapters were throwing it
 * away. The envelope is:
 *
 * ```json
 * { "error": { "code": 400, "status": "INVALID_ARGUMENT",
 *              "message": "Invalid value at 'included_primary_types[0]' …" } }
 * ```
 *
 * That message names the field and the value. It is more precise than the
 * reference page, it is current by construction, and it arrives at the exact
 * moment it is needed. **Reading it is how this codebase learns an API it cannot
 * browse** — so the rule is now: an upstream refusal is never reduced to a
 * number.
 *
 * ## What may be logged
 *
 * The message is Google's, but it can quote our request back — and our request
 * contains what the user typed. An address is personal data and may not reach a
 * log line ([`CLAUDE.md`](../../../../CLAUDE.md) §9 rule 7), so every caller
 * passes the values it sent and they are removed before anything is written.
 * Redaction happens here rather than at each call site, because a call site that
 * forgets is a breach and there is no test that can see the omission.
 */

/** Google's own error, as much of it as is safe and useful to keep. */
export interface GoogleError {
  /** The enum — `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED`. Stable,
   *  machine-readable, and the first thing worth branching on. */
  readonly status: string;
  /** The sentence, redacted and bounded. */
  readonly message: string;
}

/**
 * How much of the message to keep.
 *
 * Long enough for "Invalid value at 'included_primary_types[0]' (TYPE_ENUM),
 * \"address\"", which is the whole point of reading it at all. Short enough that
 * a pathological body cannot fill the log.
 */
export const MAX_MESSAGE_LENGTH = 400;

const REDACTED = '‹redacted›';

/**
 * Anything shaped like a coordinate, whatever the caller remembered to pass.
 *
 * A latitude and longitude locate a person, so this is a floor and not the
 * mechanism: `redact` still takes the values explicitly. This catches the pair
 * a future call site forgets, which is the only kind of omission that matters.
 */
const COORDINATE_PATTERN = /-?\d{1,3}\.\d{3,}/g;

/**
 * Read Google's error envelope out of a response body.
 *
 * Returns `null` rather than throwing for anything unrecognised: a refusal we
 * cannot read is still a refusal, and the caller already has the HTTP status.
 */
export function readGoogleError(body: unknown, redact: readonly string[] = []): GoogleError | null {
  if (typeof body !== 'object' || body === null) return null;

  const error = (body as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null) return null;

  const fields = error as Record<string, unknown>;
  const status = typeof fields['status'] === 'string' ? fields['status'] : 'UNKNOWN';
  const message = typeof fields['message'] === 'string' ? fields['message'] : '';

  return { status, message: scrub(message, redact) };
}

/**
 * Remove what the user gave us from a message we did not write.
 *
 * Longest values first: redacting "via roma" before "via roma 12" would leave
 * the house number behind, and a house number with a street name already gone
 * is still one more fact about a person than belongs here.
 */
export function scrub(message: string, redact: readonly string[]): string {
  let scrubbed = message;

  for (const value of [...redact].filter((v) => v.length > 0).sort((a, b) => b.length - a.length)) {
    scrubbed = scrubbed.split(value).join(REDACTED);
  }

  scrubbed = scrubbed.replace(COORDINATE_PATTERN, REDACTED);

  return scrubbed.length > MAX_MESSAGE_LENGTH
    ? `${scrubbed.slice(0, MAX_MESSAGE_LENGTH)}…`
    : scrubbed;
}

/**
 * Write the refusal where it can be found.
 *
 * One shape for both adapters, so a search for `google_refused` finds every
 * upstream refusal the product has ever had regardless of which API produced it.
 */
export function logGoogleRefusal(api: string, httpStatus: number, error: GoogleError | null): void {
  console.error(
    JSON.stringify({
      event: 'google_refused',
      api,
      httpStatus,
      googleStatus: error?.status ?? null,
      message: error?.message ?? null,
    }),
  );
}
