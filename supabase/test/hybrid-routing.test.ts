import { ApiError } from '../functions/_shared/errors';
import {
  createHybridRoutingAdapter,
  type HybridStop,
} from '../functions/_shared/upstream/hybrid-routing';

interface RecordedCall {
  readonly url: URL;
  readonly init: RequestInit;
}

const stops: readonly HybridStop[] = [
  { id: 'start', latitude: 45, longitude: 9 },
  { id: 'first', latitude: 45.1, longitude: 9.1 },
  { id: 'second', latitude: 45.2, longitude: 9.2 },
  { id: 'third', latitude: 45.3, longitude: 9.3 },
  { id: 'end', latitude: 45.4, longitude: 9.4 },
];

const orsResponse = (jobs: readonly number[] = [3, 1, 2]) => ({
  routes: [{ steps: jobs.map((job) => ({ type: 'job', job })) }],
  unassigned: [],
});

const hereResponse = {
  routes: [
    {
      routeHandle: 'route-handle',
      sections: [
        {
          polyline: 'first-polyline',
          summary: { length: 1200, duration: 300 },
          actions: [{ action: 'depart', length: 30, duration: 10 }],
        },
        {
          polyline: 'second-polyline',
          summary: { length: 800, duration: 240 },
          actions: [{ action: 'turn', length: 50, duration: 20 }],
        },
      ],
    },
  ],
};

function adapterReturning(
  responses: readonly { readonly status?: number; readonly body: unknown }[],
) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = responses[calls.length];
    if (response === undefined) throw new Error('unexpected upstream request');
    calls.push({ url: new URL(String(input)), init: init ?? {} });

    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response.body,
    } as Response;
  }) as typeof fetch;

  return {
    calls,
    adapter: createHybridRoutingAdapter({
      orsApiKey: 'server-only-ors-key',
      hereApiKey: 'server-only-here-key',
      fetchImpl,
    }),
  };
}

describe('server-mediated ORS to HERE routing', () => {
  it('uses one ORS optimization and one ordered HERE route', async () => {
    const { adapter, calls } = adapterReturning([{ body: orsResponse() }, { body: hereResponse }]);

    const result = await adapter.optimize(stops);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url.toString()).toBe('https://api.heigit.org/vroom/v0/optimization');
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      'server-only-ors-key',
    );
    expect(calls[0]?.url.toString()).not.toContain('server-only-ors-key');

    const body = JSON.parse(String(calls[0]?.init.body)) as {
      jobs: { id: number }[];
      vehicles: { profile: string }[];
    };
    expect(body.jobs.map((job) => job.id)).toEqual([1, 2, 3]);
    expect(body.vehicles[0]?.profile).toBe('driving-car');

    expect(calls[1]?.url.hostname).toBe('router.hereapi.com');
    expect(calls[1]?.init.method).toBe('GET');
    expect(calls[1]?.url.searchParams.getAll('via')).toEqual(['45.3,9.3', '45.1,9.1', '45.2,9.2']);
    expect(calls[1]?.url.searchParams.get('return')).toContain('routeHandle');
    expect(result.orderedStopIds).toEqual(['start', 'third', 'first', 'second', 'end']);
    expect(result.distanceMeters).toBe(2000);
    expect(result.durationSeconds).toBe(540);
    expect(result.sections).toHaveLength(2);
    expect(result.routeHandle).toBe('route-handle');
    expect(JSON.stringify(result)).not.toContain('server-only');
  });

  it.each([5, 15, 25])('accepts a %i-stop route without losing its jobs', async (count) => {
    const route = Array.from({ length: count }, (_, index) => ({
      id: 'stop-' + index,
      latitude: 45 + index / 1000,
      longitude: 9 + index / 1000,
    }));
    const jobs = Array.from({ length: count - 2 }, (_, index) => index + 1).reverse();
    const { adapter } = adapterReturning([{ body: orsResponse(jobs) }, { body: hereResponse }]);

    const result = await adapter.optimize(route);
    expect(result.orderedStopIds).toHaveLength(count);
    expect(new Set(result.orderedStopIds).size).toBe(count);
  });

  it.each([
    { name: 'duplicate', jobs: [1, 1, 3] },
    { name: 'missing', jobs: [1, 3] },
    { name: 'unknown', jobs: [1, 2, 9] },
  ])('rejects $name jobs before requesting HERE', async ({ jobs }) => {
    const { adapter, calls } = adapterReturning([{ body: orsResponse(jobs) }]);

    await expect(adapter.optimize(stops)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('rejects explicitly unassigned jobs before requesting HERE', async () => {
    const { adapter, calls } = adapterReturning([
      { body: { ...orsResponse(), unassigned: [{ id: 2 }] } },
    ]);

    await expect(adapter.optimize(stops)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('rejects repeated client identifiers before any paid call', async () => {
    const { adapter, calls } = adapterReturning([]);
    const duplicate = [...stops];
    duplicate[1] = { id: 'start', latitude: 45.1, longitude: 9.1 };

    await expect(adapter.optimize(duplicate)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);
  });

  it('rejects oversized routes before any paid call', async () => {
    const { adapter, calls } = adapterReturning([]);
    const oversized = Array.from({ length: 26 }, (_, index) => ({
      id: String(index),
      latitude: 45,
      longitude: 9,
    }));

    await expect(adapter.optimize(oversized)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);
  });

  it('does not call HERE when ORS refuses the account quota', async () => {
    const { adapter, calls } = adapterReturning([{ status: 429, body: {} }]);

    await expect(adapter.optimize(stops)).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
    expect(calls).toHaveLength(1);
  });

  it('rejects an incomplete HERE section instead of shortening the route', async () => {
    const { adapter } = adapterReturning([
      { body: orsResponse() },
      {
        body: {
          routes: [
            {
              sections: [
                { polyline: 'first', summary: { length: 10, duration: 4 } },
                { summary: { length: 20, duration: 8 } },
              ],
            },
          ],
        },
      },
    ]);

    await expect(adapter.optimize(stops)).rejects.toBeInstanceOf(ApiError);
  });
});
