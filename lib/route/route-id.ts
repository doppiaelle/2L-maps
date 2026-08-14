/**
 * The identifier a new route carries.
 *
 * **A route needs a real UUID from the moment it exists.** The store opened with
 * the literal string `'draft'` and nothing ever replaced it: `reset(routeId)`
 * was called from no screen in the repository. `/optimize` validates
 * `routeId` as `z.string().uuid()`, so the first optimization of every new
 * install would have been refused with 400 INVALID_REQUEST — the same failure
 * that made address search return nothing, waiting one step further along.
 *
 * Generated here rather than taken from a library because `expo-crypto` cannot
 * be installed in this environment, and because the requirement is weaker than
 * it looks: this is a row key the client chooses for its own draft, not a
 * capability, a session or anything an attacker gains by guessing. Ownership is
 * enforced by RLS on `user_id`, never by the unguessability of this value
 * ([`docs/19_SECURITY.md`](../../docs/19_SECURITY.md)).
 *
 * If that ever stops being true — an id that grants access to something — this
 * must be replaced by a CSPRNG, and the reason it was acceptable is written
 * above so the change is obvious rather than archaeological.
 */

/** Version 4, variant 1 — the shape `z.string().uuid()` accepts. */
export function newRouteId(random: () => number = Math.random): string {
  return newUuidV4(random);
}

function newUuidV4(random: () => number): string {
  const hex: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    hex.push(
      Math.floor(random() * 256)
        .toString(16)
        .padStart(2, '0'),
    );
  }

  // Byte 6 high nibble is the version; byte 8 high bits are the variant. Both
  // are fixed rather than random, and a generator that skips them produces a
  // string that looks like a UUID and fails validation.
  hex[6] = `4${(hex[6] ?? '00').slice(1)}`;
  const variant = ((parseInt((hex[8] ?? '00').slice(0, 1), 16) & 0x3) | 0x8).toString(16);
  hex[8] = `${variant}${(hex[8] ?? '00').slice(1)}`;

  const joined = hex.join('');
  return [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20, 32),
  ].join('-');
}

/** Whether a stored id is one the server will accept, so a draft persisted
 *  before this existed can be migrated rather than refused at optimize time. */
export function isRouteId(value: unknown): value is string {
  return isUuidV4(value);
}

function isUuidV4(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * The identifier one stop carries inside a draft.
 *
 * **It used to embed the place id, and that overran the contract.** A stop was
 * `${placeId}:${Date.now()}` (`add-stop`) or `${placeId}:${Date.now()}:${index}`
 * (`import`), while `stopInput.stopId` accepts at most 64 characters. Google's
 * base64-form place ids for interpolated street addresses — "V. Collatina, 00132
 * Roma RM" is one — run to 90 characters and beyond, so the id alone was over
 * the limit before the timestamp was added. `/optimize` answered 400 and the
 * screen said "Could not optimize", with nothing in the logs, because the schema
 * rejection happens before the pipeline runs.
 *
 * Embedding it was never necessary. The place id travels in its own field on the
 * same object; this only has to be **unique within one route**, which is what
 * makes two deliveries in the same building two stops rather than one.
 *
 * It is a UUID anyway because `stops.id` is a UUID in Supabase. A shorter local
 * id worked for optimize and then failed at History, after the route itself had
 * already been saved on this phone.
 */
export function newStopId(random: () => number = Math.random): string {
  return newUuidV4(random);
}

/** Whether a stored stop id can be written to the database. */
export function isStopId(value: unknown): value is string {
  return isUuidV4(value);
}
