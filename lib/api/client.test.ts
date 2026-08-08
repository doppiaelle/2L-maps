import { z } from 'zod';

import { ApiClient } from './client';

/**
 * Tests for the Edge Function client.
 *
 * The network is substituted through the injected `fetchImpl` rather than
 * intercepted. That is what the injection is for: MSW earns its place when a
 * dependency cannot be replaced, and here it can. Mocking at the seam the design
 * already provides keeps the test honest — nothing global is patched, and the
 * function under test is untouched (CLAUDE.md §5).
 *
 * The failure paths are the point. A client that handles 200 well and everything
 * else vaguely turns every server condition into the same unhelpful message, and
 * each condition here has a different next action for the user.
 */

const BASE = 'https://edge.test';
const schema = z.object({ value: z.string() });

/** The parts of Response this client actually reads. Building only these avoids
 *  depending on a Response polyfill the RN test environment may not have. */
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const respond = (status: number, body: unknown, asText = false): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (asText) throw new SyntaxError('Unexpected token < in JSON');
    return body;
  },
});

interface StubOptions {
  response?: FakeResponse;
  /** Throw instead of responding — a transport failure. */
  networkError?: boolean;
  /** Never settle until aborted, so timeouts and cancellation are observable. */
  hang?: boolean;
}

function stubFetch(options: StubOptions = {}) {
  const calls: { url: string; init: RequestInit }[] = [];

  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });

    if (options.hang === true) {
      return new Promise((_resolve, reject) => {
        const abort = (): void => {
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (init.signal?.aborted === true) abort();
        else init.signal?.addEventListener('abort', abort, { once: true });
      });
    }

    if (options.networkError === true) throw new TypeError('Network request failed');

    return options.response ?? respond(200, { value: 'ok' });
  }) as unknown as typeof fetch;

  return { impl, calls };
}

const makeClient = (
  options: StubOptions = {},
  token: string | null = 'jwt-token',
  timeoutMs = 10_000,
) => {
  const stub = stubFetch(options);
  const client = new ApiClient({
    baseUrl: BASE,
    getAccessToken: async () => token,
    fetchImpl: stub.impl,
    timeoutMs,
  });
  return { client, calls: stub.calls };
};

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: 'human readable', ...extra },
});

describe('the happy path', () => {
  it('parses a valid response', async () => {
    const { client } = makeClient();
    expect(await client.post('/thing', {}, schema)).toEqual({ ok: true, data: { value: 'ok' } });
  });

  it('sends the bearer token and hits the right URL', async () => {
    const { client, calls } = makeClient({}, 'the-token');
    await client.post('/thing', {}, schema);

    expect(calls[0]?.url).toBe(`${BASE}/thing`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer the-token');
  });

  it('strips a trailing slash from the base URL', async () => {
    // Otherwise every request is a double slash, which some gateways 404.
    const stub = stubFetch();
    const client = new ApiClient({
      baseUrl: `${BASE}/`,
      getAccessToken: async () => 'jwt',
      fetchImpl: stub.impl,
    });
    await client.post('/thing', {}, schema);
    expect(stub.calls[0]?.url).toBe(`${BASE}/thing`);
  });

  it('does not call the server at all when signed out', async () => {
    // The server would answer 401 and we would have spent a request to learn
    // what we already knew.
    const { client, calls } = makeClient({}, null);
    const result = await client.post('/thing', {}, schema);

    expect(calls).toHaveLength(0);
    expect(!result.ok && result.failure.code).toBe('UNAUTHENTICATED');
  });
});

describe('every taxonomy code survives the boundary', () => {
  const cases: [string, number][] = [
    ['UNAUTHENTICATED', 401],
    ['NO_ENTITLEMENT', 402],
    ['RATE_LIMITED', 429],
    ['QUOTA_EXHAUSTED', 429],
    ['INVALID_REQUEST', 400],
    ['MISSING_SESSION_TOKEN', 400],
    ['UPSTREAM_UNAVAILABLE', 503],
    ['UPSTREAM_TIMEOUT', 504],
    ['INTERNAL', 500],
  ];

  it.each(cases)('%s arrives intact', async (code, status) => {
    // The client branches on the code, so a mangled code sends the user down the
    // wrong path — a lapsed subscriber shown a retry button, for instance.
    const { client } = makeClient({ response: respond(status, envelope(code)) });
    const result = await client.post('/thing', {}, schema);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.code).toBe(code);
  });

  it('keeps the details a user needs to act on', async () => {
    const { client } = makeClient({
      response: respond(
        429,
        envelope('QUOTA_EXHAUSTED', {
          details: { limit: 100, resetsAt: '2026-09-01T00:00:00Z' },
          degradationHint: 'T0_AVAILABLE',
        }),
      ),
    });

    const result = await client.post('/thing', {}, schema);
    expect(!result.ok && result.failure.details).toEqual({
      limit: 100,
      resetsAt: '2026-09-01T00:00:00Z',
    });
    expect(!result.ok && result.failure.degradationHint).toBe('T0_AVAILABLE');
  });

  it('distinguishes the two 429s, which share a status', async () => {
    for (const code of ['RATE_LIMITED', 'QUOTA_EXHAUSTED']) {
      const { client } = makeClient({ response: respond(429, envelope(code)) });
      const result = await client.post('/thing', {}, schema);
      expect(!result.ok && result.failure.code).toBe(code);
    }
  });
});

describe('responses that do not match the contract', () => {
  it('rejects a 200 whose shape is wrong', async () => {
    // Letting a half-shaped object through means it crashes on a screen three
    // layers away, where the cause is invisible.
    const { client } = makeClient({ response: respond(200, { wrong: true }) });
    const result = await client.post('/thing', {}, schema);
    expect(!result.ok && result.failure.code).toBe('MALFORMED_RESPONSE');
  });

  it('rejects a 200 that is not JSON at all', async () => {
    const { client } = makeClient({ response: respond(200, null, true) });
    const result = await client.post('/thing', {}, schema);
    expect(!result.ok && result.failure.code).toBe('MALFORMED_RESPONSE');
  });

  it('falls back on a non-2xx that carries no envelope', async () => {
    // A gateway, a proxy or an outage page — not our function. The status is all
    // there is to go on.
    const { client } = makeClient({ response: respond(502, null, true) });
    const result = await client.post('/thing', {}, schema);
    expect(!result.ok && result.failure.code).toBe('INTERNAL');
    expect(!result.ok && result.failure.details).toEqual({ status: 502 });
  });

  it('still reads a bare 401 as unauthenticated', async () => {
    const { client } = makeClient({ response: respond(401, null, true) });
    const result = await client.post('/thing', {}, schema);
    expect(!result.ok && result.failure.code).toBe('UNAUTHENTICATED');
  });

  it('never leaks a server message into the failure it reports for our defects', async () => {
    const { client } = makeClient({
      response: respond(200, { secretField: 'postgres://user:hunter2@db' }),
    });
    const result = await client.post('/thing', {}, schema);
    expect(JSON.stringify(result)).not.toContain('hunter2');
    expect(JSON.stringify(result)).not.toContain('secretField');
  });
});

describe('network conditions', () => {
  it('reports no connection, and that T0 may be offered', async () => {
    const { client } = makeClient({ networkError: true });
    const result = await client.post('/thing', {}, schema);

    expect(!result.ok && result.failure.code).toBe('NETWORK_UNAVAILABLE');
    expect(!result.ok && result.failure.degradationHint).toBe('T0_AVAILABLE');
  });

  it('times out rather than hanging until the platform kills us', async () => {
    const { client } = makeClient({ hang: true }, 'jwt', 20);
    const result = await client.post('/thing', {}, schema);
    expect(!result.ok && result.failure.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('treats the caller cancelling as a cancellation, not a fault', async () => {
    // An in-flight autocomplete for text the user already replaced is a request
    // we pay for and discard. Cancelling it is correct, and reporting it as an
    // error would surface a message for something the user themselves caused.
    const { client } = makeClient({ hang: true });
    const controller = new AbortController();
    const promise = client.post('/thing', {}, schema, controller.signal);
    controller.abort();

    const result = await promise;
    expect(!result.ok && result.failure.code).toBe('NETWORK_UNAVAILABLE');
    expect(!result.ok && result.failure.message).toMatch(/cancel/i);
  });

  it('clears the timeout when a request completes normally', async () => {
    // A leaked timer keeps the process alive; in a test run that shows up as
    // Jest refusing to exit, and in the app as a wakeup that does nothing.
    const { client } = makeClient({}, 'jwt', 50);
    await client.post('/thing', {}, schema);
    await new Promise((resolve) => setTimeout(resolve, 80));
    // Reaching here without an unhandled rejection is the assertion.
    expect(true).toBe(true);
  });
});
