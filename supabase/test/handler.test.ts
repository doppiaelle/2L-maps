import { z } from 'zod';

import { createHandler, createQuotaHandler } from '../functions/_shared/handler';
import type { HandlerContext } from '../functions/_shared/handler';
import type { UpstreamOutcome } from '../functions/_shared/pipeline';

/**
 * The handler's job is ordering, so these tests are almost all about what did
 * *not* happen: upstream not called, quota not consumed, a bill not incurred.
 */

const schema = z.object({ value: z.string().min(3) });
type Request_ = z.infer<typeof schema>;

/**
 * The endpoint under test is a real one.
 *
 * Allowances are per plan and live in `plans.ts`, so an invented endpoint name
 * has no allowance and fails closed with INTERNAL — which is the correct
 * behaviour and a useless fixture. Using `/optimize` means these tests run
 * against the allowance table the product actually ships.
 */
const ENDPOINT = '/optimize';

const contextWith = (overrides: { entitled?: boolean; userId?: string | null } = {}) => {
  const executed: string[] = [];
  const context: HandlerContext = {
    database: {
      queryOne: (async (sql: string) => {
        if (sql.includes('user_entitlements')) {
          return overrides.entitled === false ? { status: 'lapsed' } : { status: 'active' };
        }
        // Quota and rate-limit counters: nothing used yet.
        return { used: 0 };
      }) as HandlerContext['database']['queryOne'],
      queryMany: (async () => []) as HandlerContext['database']['queryMany'],
      execute: async (sql: string) => {
        executed.push(sql);
      },
    },
    tokens: {
      verify: async (header: string | null) =>
        overrides.userId !== undefined ? overrides.userId : header === null ? null : 'user-1',
    },
    limits: {
      burst: { [ENDPOINT]: { max: 10, windowSeconds: 60 } },
    },
  };
  return { context, executed };
};

const post = (body: unknown, authorized = true) =>
  new Request('https://edge.test/test', {
    method: 'POST',
    ...(authorized ? { headers: { authorization: 'Bearer jwt' } } : {}),
    body: JSON.stringify(body),
  });

const upstreamSpy = () => {
  const calls: Request_[] = [];
  const callUpstream = async (request: Request_): Promise<UpstreamOutcome<{ echoed: string }>> => {
    calls.push(request);
    return { result: { echoed: request.value }, tier: 'T1', units: 1 };
  };
  return { calls, callUpstream };
};

describe('validation precedes anything metered', () => {
  it('does not call upstream for a malformed body', async () => {
    // A malformed request that reached upstream is a billed call for a result
    // nobody can use.
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context } = contextWith();

    const response = await handler(post({ value: 'ab' }), context);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('does not call upstream for a body that is not JSON at all', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context } = contextWith();

    const request = new Request('https://edge.test/test', {
      method: 'POST',
      headers: { authorization: 'Bearer jwt' },
      body: 'not json',
    });

    expect((await handler(request, context)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('refuses the wrong method before looking at credentials', async () => {
    // A routing mistake, not an access decision — there is nothing to protect.
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context } = contextWith({ userId: null });

    const request = new Request('https://edge.test/test', { method: 'GET' });
    expect((await handler(request, context)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('does not leak why the request was rejected', async () => {
    // The client built the request, so the user cannot act on the specifics,
    // and echoing them describes our internals to whoever sent it.
    const { callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context } = contextWith();

    const response = await handler(post({ value: 'ab' }), context);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain('value');
    expect(body.error.message).not.toContain('min');
  });
});

describe('the pipeline still runs in front of upstream', () => {
  it('rejects an unauthenticated caller without calling upstream', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context } = contextWith({ userId: null });

    const response = await handler(post({ value: 'valid' }), context);
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('serves a lapsed subscriber on the free allowance rather than locking them out', async () => {
    // This assertion is the reverse of what it used to be, and the reversal is
    // ADR-0015: a lapsed subscriber is on the `free` plan, not out of the
    // product. Their own routes are never held hostage — only the allowance
    // shrinks, and when it runs out the answer is 429 with T0 still available,
    // not 402.
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context } = contextWith({ entitled: false });

    const response = await handler(post({ value: 'valid' }), context);
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('fails closed on an endpoint with no configured allowance', async () => {
    // A configuration gap is not a free pass. Adding a metered endpoint and
    // forgetting to give it an allowance must refuse, not wave the call through
    // to a bill.
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: '/not-configured', schema, callUpstream });
    const { context } = contextWith();

    const response = await handler(post({ value: 'valid' }), context);
    expect(response.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it('serves a valid request and records it', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: ENDPOINT, schema, callUpstream });
    const { context, executed } = contextWith();

    const response = await handler(post({ value: 'valid' }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ echoed: 'valid' });
    expect(calls).toHaveLength(1);
    expect(executed.some((sql) => sql.includes('usage_events'))).toBe(true);
  });

  it('serves a cache hit without calling upstream', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({
      endpoint: ENDPOINT,
      schema,
      callUpstream,
      readCache: async () => ({ echoed: 'from-cache' }),
    });
    const { context } = contextWith();

    const response = await handler(post({ value: 'valid' }), context);
    expect(await response.json()).toEqual({ echoed: 'from-cache' });
    expect(calls).toHaveLength(0);
  });
});

describe('the unmetered quota read', () => {
  it('answers the user who has run out', async () => {
    // Putting this through the metered pipeline would check an allowance in
    // order to report that allowance, and deny the answer to exactly the user
    // who most needs it.
    const handler = createQuotaHandler(async (userId) => ({ userId, plan: 'free' }));
    const { context } = contextWith();

    const request = new Request('https://edge.test/usage-quota', {
      method: 'GET',
      headers: { authorization: 'Bearer jwt' },
    });

    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: 'user-1', plan: 'free' });
  });

  it('still requires a caller', async () => {
    const handler = createQuotaHandler(async () => ({}));
    const { context } = contextWith({ userId: null });

    const request = new Request('https://edge.test/usage-quota', { method: 'GET' });
    expect((await handler(request, context)).status).toBe(401);
  });
});
