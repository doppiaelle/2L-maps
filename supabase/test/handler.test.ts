import { z } from 'zod';

import { createHandler, createQuotaHandler } from '../functions/_shared/handler';
import type { HandlerContext } from '../functions/_shared/handler';
import type { AuthenticatedUser, UpstreamOutcome } from '../functions/_shared/pipeline';

/**
 * The handler's job is ordering, so these tests are almost all about what did
 * *not* happen: upstream not called, quota not consumed, a bill not incurred.
 */

const schema = z.object({ value: z.string().min(3) });
type Request_ = z.infer<typeof schema>;

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
      execute: async (sql: string) => {
        executed.push(sql);
      },
    },
    tokens: {
      verify: async (header: string | null) =>
        overrides.userId !== undefined ? overrides.userId : header === null ? null : 'user-1',
    },
    limits: {
      monthly: { '/test': 100 },
      burst: { '/test': { max: 10, windowSeconds: 60 } },
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
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
    const { context } = contextWith();

    const response = await handler(post({ value: 'ab' }), context);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('does not call upstream for a body that is not JSON at all', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
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
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
    const { context } = contextWith({ userId: null });

    const request = new Request('https://edge.test/test', { method: 'GET' });
    expect((await handler(request, context)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('does not leak why the request was rejected', async () => {
    // The client built the request, so the user cannot act on the specifics,
    // and echoing them describes our internals to whoever sent it.
    const { callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
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
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
    const { context } = contextWith({ userId: null });

    const response = await handler(post({ value: 'valid' }), context);
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('rejects a lapsed subscriber without calling upstream', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
    const { context } = contextWith({ entitled: false });

    const response = await handler(post({ value: 'valid' }), context);
    expect(response.status).toBe(402);
    expect(calls).toHaveLength(0);
  });

  it('serves a valid request and records it', async () => {
    const { calls, callUpstream } = upstreamSpy();
    const handler = createHandler({ endpoint: '/test', schema, callUpstream });
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
      endpoint: '/test',
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
