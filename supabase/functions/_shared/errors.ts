/**
 * The error taxonomy.
 *
 * Every internal response carries a machine-readable `code`, and the client
 * branches on the code, never on the message (docs/33_API_CONTRACTS.md §6).
 * Messages are for humans and are allowed to change; a client that parses one
 * breaks silently the first time somebody improves the wording.
 *
 * Every code here has a user-visible outcome and a next action, which is rule 5
 * of CLAUDE.md §0 expressed as a type: adding a failure mode means adding it to
 * this union, and the compiler then asks what the user should do about it.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'NO_ENTITLEMENT'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'INVALID_REQUEST'
  | 'MISSING_SESSION_TOKEN'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'PARTIAL_RESULT'
  | 'INTERNAL';

/** How the client may degrade rather than simply failing. */
export type DegradationHint = 'T0_AVAILABLE' | 'RETRY_LATER' | 'CACHED_RESULT_AVAILABLE' | 'NONE';

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly degradationHint?: DegradationHint;
  };
}

/** The HTTP status each code maps to. Both 429s are deliberate: velocity and
 *  allowance are different problems with different user actions, and the code
 *  distinguishes them where the status cannot. */
const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NO_ENTITLEMENT: 402,
  RATE_LIMITED: 429,
  QUOTA_EXHAUSTED: 429,
  INVALID_REQUEST: 400,
  MISSING_SESSION_TOKEN: 400,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
  PARTIAL_RESULT: 200,
  INTERNAL: 500,
};

export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}

/**
 * Codes that indicate a defect on our side rather than a condition the user
 * caused. These alert; the others are ordinary outcomes and must not.
 *
 * An `INVALID_REQUEST` reaching the server means the client built something
 * malformed, which no user action can fix — paging on it is the point.
 */
const OUR_DEFECT: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'INVALID_REQUEST',
  'MISSING_SESSION_TOKEN',
  'INTERNAL',
]);

export function shouldAlert(code: ErrorCode): boolean {
  return OUR_DEFECT.has(code);
}

export interface ErrorOptions {
  readonly details?: Readonly<Record<string, unknown>>;
  readonly degradationHint?: DegradationHint;
}

/**
 * Build the error envelope.
 *
 * Messages are deliberately generic for our own defects: an internal error
 * message that leaks a stack trace, a query or a credential is a disclosure, and
 * error objects are the most common way secrets reach a log (CLAUDE.md §9 rule 8).
 */
export function errorEnvelope(
  code: ErrorCode,
  message: string,
  options: ErrorOptions = {},
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.degradationHint === undefined
        ? {}
        : { degradationHint: options.degradationHint }),
    },
  };
}

/** A failure carrying its taxonomy code, so a throw still produces a contract-shaped response. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly options: ErrorOptions;

  constructor(code: ErrorCode, message: string, options: ErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.options = options;
  }

  toEnvelope(): ErrorEnvelope {
    return errorEnvelope(this.code, this.message, this.options);
  }
}
