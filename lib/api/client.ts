import { z } from 'zod';

/**
 * The typed client for our own Edge Functions.
 *
 * Every response is parsed before use. A response shape assumed rather than
 * validated is how a provider's silent change becomes a crash in the field
 * (CLAUDE.md §3), and this boundary is the one place where that check is cheap.
 *
 * The client branches on the error `code`, never on the `message`
 * (docs/33_API_CONTRACTS.md §6). Messages are for humans and are allowed to
 * change; code that parses one breaks the first time somebody improves the
 * wording, and it breaks silently.
 */

/** The error envelope, identical across every endpoint. */
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    degradationHint: z.string().optional(),
  }),
});

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'NO_ENTITLEMENT'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'INVALID_REQUEST'
  | 'MISSING_SESSION_TOKEN'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'PARTIAL_RESULT'
  | 'INTERNAL'
  /** Not from the server: the request never reached it. */
  | 'NETWORK_UNAVAILABLE'
  /** The server answered in a shape the contract does not describe. */
  | 'MALFORMED_RESPONSE';

export interface ApiFailure {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly degradationHint: string | null;
}

export type ApiResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly failure: ApiFailure };

export interface ApiClientOptions {
  readonly baseUrl: string;
  /** Returns the current Supabase JWT, or null when signed out. Called per
   *  request rather than captured, so a refreshed token is picked up without
   *  rebuilding the client. */
  getAccessToken: () => Promise<string | null>;
  /** Injected so a test substitutes the network at this seam rather than
   *  patching a global. */
  readonly fetchImpl?: typeof fetch;
  /** Deadline per request. Shorter than the function's own limit, so we always
   *  return something rather than hanging until the platform kills us. */
  readonly timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

const failure = (
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  degradationHint: string | null = null,
): ApiFailure => ({ code, message, details, degradationHint });

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Call an endpoint and parse the response against `schema`.
   *
   * `signal` lets a caller cancel a request its input has superseded — an
   * in-flight autocomplete for text the user has already replaced is a request
   * we are paying for and will discard (docs/24_PERFORMANCE.md).
   */
  async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<ApiResult<T>> {
    return this.request(path, schema, { method: 'POST', body: JSON.stringify(body) }, signal);
  }

  async get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<ApiResult<T>> {
    return this.request(path, schema, { method: 'GET' }, signal);
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<ApiResult<T>> {
    // Already cancelled before we got here — usually a keystroke superseded by
    // the next one while the token was being read. Issuing the request anyway
    // would pay for a result nobody will look at.
    if (signal?.aborted === true) {
      return { ok: false, failure: failure('NETWORK_UNAVAILABLE', 'Request cancelled') };
    }

    // Tracked with a flag rather than re-read in the catch. Control-flow analysis
    // narrows `signal.aborted` to false after the guard above and never widens
    // it, because it cannot see that the signal changes while the fetch is in
    // flight — which is exactly when a cancellation happens.
    let cancelledByCaller = false;
    signal?.addEventListener(
      'abort',
      () => {
        cancelledByCaller = true;
      },
      { once: true },
    );

    const token = await this.getAccessToken();
    if (token === null) {
      // Not worth a round trip: the server would answer 401 and we would have
      // spent a request to learn what we already know.
      return { ok: false, failure: failure('UNAUTHENTICATED', 'Sign in to continue') };
    }

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const composed = composeSignals(signal, timeout.signal);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: composed,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      // The thrown value is deliberately not read. A transport error's message
      // can carry the request URL, and the URL carries the bearer token in some
      // engines' formatting — none of that may reach a user-facing failure.
      // A caller's own cancellation is not a failure to report — it asked.
      if (cancelledByCaller) {
        return { ok: false, failure: failure('NETWORK_UNAVAILABLE', 'Request cancelled') };
      }
      const timedOut = timeout.signal.aborted;
      return {
        ok: false,
        failure: timedOut
          ? failure('UPSTREAM_TIMEOUT', 'That took too long', {}, 'RETRY_LATER')
          : failure('NETWORK_UNAVAILABLE', 'No connection', {}, 'T0_AVAILABLE'),
      };
    } finally {
      clearTimeout(timer);
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, failure: toFailure(payload, response.status) };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // The contract and the server disagree. Failing loudly here is far better
      // than letting a half-shaped object reach a screen and crash there, where
      // the cause is three layers away.
      return {
        ok: false,
        failure: failure('MALFORMED_RESPONSE', 'Something went wrong on our side'),
      };
    }

    return { ok: true, data: parsed.data };
  }
}

/** Map a non-2xx response onto the taxonomy. */
function toFailure(payload: unknown, status: number): ApiFailure {
  const envelope = errorEnvelopeSchema.safeParse(payload);
  if (envelope.success) {
    const { code, message, details, degradationHint } = envelope.data.error;
    return {
      code: code as ApiErrorCode,
      message,
      details: details ?? {},
      degradationHint: degradationHint ?? null,
    };
  }

  // A non-2xx that does not carry the envelope came from somewhere that is not
  // our function — a gateway, a proxy, an outage page. Status is all we have.
  return failure(status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL', 'Something went wrong', {
    status,
  });
}

/**
 * Combine the caller's cancellation with our timeout.
 *
 * `AbortSignal.any` exists in modern runtimes but not in every React Native
 * engine we support, so this falls back rather than assuming it.
 */
function composeSignals(caller: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (caller === undefined) return timeout;

  const anyOf = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyOf === 'function') return anyOf([caller, timeout]);

  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  if (caller.aborted || timeout.aborted) abort();
  caller.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return controller.signal;
}
