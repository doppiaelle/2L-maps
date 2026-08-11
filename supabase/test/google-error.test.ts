import {
  MAX_MESSAGE_LENGTH,
  readGoogleError,
  scrub,
} from '../functions/_shared/upstream/google-error';

/**
 * Reading what Google said, and never repeating what the user typed.
 *
 * Two properties, and they pull against each other. The message has to survive
 * intact enough to be worth reading — it is the only description of these APIs
 * available from an environment that cannot reach their documentation, and
 * writing `includedPrimaryTypes` from memory instead has now cost three
 * deployments. And it may not carry an address, because an address is personal
 * data and a log line is forever (`CLAUDE.md` §9 rule 7).
 *
 * So the tests come in pairs: one that the diagnosis survives, one that the
 * person does not appear in it.
 */

describe('reading the envelope', () => {
  it('keeps the enum and the sentence', () => {
    // The exact shape of a Places rejection, which is what this was written for.
    const error = readGoogleError({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: `Invalid value at 'included_primary_types[0]' (TYPE_ENUM), "address"`,
      },
    });

    expect(error?.status).toBe('INVALID_ARGUMENT');
    // The field name and the offending value both survive — without them the
    // message is no better than the status code it came with.
    expect(error?.message).toContain('included_primary_types[0]');
    expect(error?.message).toContain('address');
  });

  it('reports an unreadable body as no error rather than throwing', () => {
    // A refusal we cannot parse is still a refusal, and the caller already has
    // the HTTP status. Throwing here would turn a diagnosable failure into an
    // exception inside the diagnosis.
    expect(readGoogleError(null)).toBeNull();
    expect(readGoogleError('<html>502 Bad Gateway</html>')).toBeNull();
    expect(readGoogleError({ nothing: 'useful' })).toBeNull();
  });

  it('survives an envelope missing the fields it wants', () => {
    const error = readGoogleError({ error: { code: 404 } });
    expect(error).toEqual({ status: 'UNKNOWN', message: '' });
  });
});

describe('what may never reach a log line', () => {
  it('removes the address the user typed', () => {
    const error = readGoogleError(
      {
        error: {
          status: 'INVALID_ARGUMENT',
          message: `Request contains an invalid argument: input "Via Privata dei Tulipani 4"`,
        },
      },
      ['Via Privata dei Tulipani 4'],
    );

    expect(error?.message).not.toContain('Tulipani');
    // The diagnosis is still there. Redaction that removes the reason is a
    // different failure with better optics.
    expect(error?.message).toContain('invalid argument');
  });

  it('removes the longer address first, so a house number is not left behind', () => {
    // "Via Roma" redacted before "Via Roma 12" would leave "‹redacted› 12",
    // which is a street already known plus the number — the whole address.
    expect(scrub('at Via Roma 12 and Via Roma', ['Via Roma', 'Via Roma 12'])).not.toContain('12');
  });

  it('removes anything shaped like a coordinate, asked for or not', () => {
    // The floor rather than the mechanism: callers pass their values
    // explicitly, and this catches the call site that forgets. A latitude and
    // longitude locate a person.
    const scrubbed = scrub('waypoint 45.698312,9.677351 was rejected', []);
    expect(scrubbed).not.toContain('45.698');
    expect(scrubbed).not.toContain('9.677');
    expect(scrubbed).toContain('was rejected');
  });

  it('leaves a place id alone', () => {
    // A place id names a building, not a person (ADR-0007), and it is the most
    // useful thing in the line when Google refuses one.
    expect(scrub('place ChIJd8BlQ2BZwokRAFUEcm_qrcA not found', [])).toContain('ChIJd8BlQ2');
  });

  it('bounds a pathological message', () => {
    const scrubbed = scrub('x'.repeat(5_000), []);
    expect(scrubbed.length).toBe(MAX_MESSAGE_LENGTH + 1);
    expect(scrubbed.endsWith('…')).toBe(true);
  });

  it('ignores an empty redaction value rather than redacting everything', () => {
    // `''.split()` on every character would replace the whole message.
    expect(scrub('Requested entity was not found.', [''])).toBe('Requested entity was not found.');
  });
});
