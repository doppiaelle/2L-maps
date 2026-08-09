import { buildPlanRows, placeIdsToResolve } from './plan-rows';
import type { ResolvedPlace } from './plan-rows';
import { emptyProgress, markStop } from './progress';
import { COORDINATE_MAX_AGE_DAYS } from '@/types';
import type { Stop } from '@/types';

/**
 * The join every screen depends on, and the place where a thirty-day-old route
 * either comes back readable or does not.
 */

const NOW = new Date('2026-08-09T09:00:00.000Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const stop = (id: string, overrides: Partial<Stop> = {}): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  note: null,
  position: 0,
  entryOrder: 0,
  coordinate: {
    latitude: 45.7,
    longitude: 9.7,
    formattedAddress: `Via ${id}, Bergamo`,
    refreshedAt: daysAgo(1),
  },
  isCompleted: false,
  ...overrides,
});

const resolved = (entries: Record<string, ResolvedPlace>) => new Map(Object.entries(entries));

describe('which coordinate wins', () => {
  it('uses the local one while it is still fresh', () => {
    // A reused coordinate costs nothing and the map draws on the first frame
    // rather than after a round trip.
    const { markers } = buildPlanRows({
      stops: [stop('a')],
      resolved: resolved({
        'place-a': { address: 'Somewhere else', coordinate: { latitude: 0, longitude: 0 } },
      }),
      progress: null,
      now: NOW,
    });

    expect(markers[0]?.coordinate).toEqual({ latitude: 45.7, longitude: 9.7 });
  });

  it('uses the resolved one once the local copy has expired', () => {
    // Drawing a driver's route from month-old data is the failure this avoids.
    const expired = stop('a', {
      coordinate: {
        latitude: 45.7,
        longitude: 9.7,
        formattedAddress: 'Via a, Bergamo',
        refreshedAt: daysAgo(COORDINATE_MAX_AGE_DAYS + 1),
      },
    });

    const { markers } = buildPlanRows({
      stops: [expired],
      resolved: resolved({
        'place-a': { address: 'Via Nuova', coordinate: { latitude: 46, longitude: 10 } },
      }),
      progress: null,
      now: NOW,
    });

    expect(markers[0]?.coordinate).toEqual({ latitude: 46, longitude: 10 });
  });

  it('reports a stop it cannot place rather than dropping it', () => {
    const { rows, markers, undrawableStopIds } = buildPlanRows({
      stops: [stop('a', { coordinate: null })],
      resolved: new Map(),
      progress: null,
      now: NOW,
    });

    expect(rows).toHaveLength(1);
    expect(markers[0]?.coordinate).toBeNull();
    expect(undrawableStopIds).toEqual(['a']);
  });
});

describe('the address after thirty days', () => {
  it('comes back from the resolved batch', () => {
    // `formatted_address` is purged with the coordinates, so an old route holds
    // nothing but a place id until this returns.
    const { rows } = buildPlanRows({
      stops: [stop('a', { coordinate: null })],
      resolved: resolved({
        'place-a': { address: 'Via Nuova 4', coordinate: { latitude: 46, longitude: 10 } },
      }),
      progress: null,
      now: NOW,
    });

    expect(rows[0]?.address).toBe('Via Nuova 4');
  });

  it('is null when nothing could resolve it, and the row still exists', () => {
    // The user's own label survives indefinitely and carries the row; the row
    // itself must never vanish because Google forgot an address.
    const { rows } = buildPlanRows({
      stops: [stop('a', { coordinate: null, label: 'Warehouse' })],
      resolved: new Map(),
      progress: null,
      now: NOW,
    });

    expect(rows[0]?.address).toBeNull();
    expect(rows[0]?.label).toBe('Warehouse');
  });
});

describe('a stop’s state', () => {
  it('comes from progress, not from the stored flag', () => {
    // `isCompleted` is what the server last saw; progress is what happened
    // since, including marks made with no signal at all.
    const progress = markStop(emptyProgress('route-1'), 'a', 'completed');

    const { rows } = buildPlanRows({
      stops: [stop('a', { isCompleted: false })],
      resolved: new Map(),
      progress,
      now: NOW,
    });

    expect(rows[0]?.state).toBe('completed');
  });

  it('is pending when no route is underway', () => {
    const { rows } = buildPlanRows({
      stops: [stop('a', { isCompleted: true })],
      resolved: new Map(),
      progress: null,
      now: NOW,
    });

    expect(rows[0]?.state).toBe('pending');
  });
});

describe('what is worth asking the server about', () => {
  it('asks for nothing when every coordinate is fresh', () => {
    // A billed batch for data already held (docs/31_COST_MODEL.md).
    expect(placeIdsToResolve([stop('a'), stop('b')], NOW)).toEqual([]);
  });

  it('asks only about the expired ones', () => {
    const expired = stop('b', {
      coordinate: {
        latitude: 45.7,
        longitude: 9.7,
        formattedAddress: 'Via b',
        refreshedAt: daysAgo(COORDINATE_MAX_AGE_DAYS + 1),
      },
    });

    expect(placeIdsToResolve([stop('a'), expired], NOW)).toEqual(['place-b']);
  });

  it('asks once about an address that appears twice', () => {
    // A morning delivery and an afternoon collection at the same address is a
    // real working day, and it is one lookup.
    const first = stop('a', { coordinate: null });
    const second = stop('b', { coordinate: null, placeId: 'place-a' });

    expect(placeIdsToResolve([first, second], NOW)).toEqual(['place-a']);
  });

  it('asks about a stop that never had a coordinate', () => {
    expect(placeIdsToResolve([stop('a', { coordinate: null })], NOW)).toEqual(['place-a']);
  });
});
