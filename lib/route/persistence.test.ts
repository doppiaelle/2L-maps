import {
  ROUTE_STATUSES,
  canTransition,
  displayName,
  fromRows,
  partitionByAllowance,
  progressFromRows,
  statusFor,
  toRows,
  type RouteRow,
  type RouteStatus,
  type SavedRouteSummary,
  type StopRow,
} from './persistence';
import { emptyDraft } from './draft';
import type { DraftRoute } from './draft';
import type { Stop } from '@/types';

/**
 * Two things are being protected here.
 *
 * **The lifecycle.** `route_status` is an ordering, not a set of flags, and an
 * illegal transition is a defect rather than a branch to tolerate — a completed
 * day that can go back to `draft` is a day that can be re-driven and re-billed.
 *
 * **The durability boundary.** No coordinate may cross into a row. `stops` has
 * no expiry mechanism, so a coordinate written there is a terms breach that
 * nothing would ever clean up (ADR-0007).
 */

const stop = (id: string, position: number, overrides: Partial<Stop> = {}): Stop => ({
  id,
  placeId: `place-${id}`,
  label: null,
  note: null,
  position,
  entryOrder: position,
  coordinate: {
    latitude: 45.7,
    longitude: 9.7,
    formattedAddress: `Via ${id} 1, Bergamo`,
    refreshedAt: new Date().toISOString(),
  },
  placeText: null,
  isCompleted: false,
  ...overrides,
});

const draftWith = (stops: readonly Stop[], overrides: Partial<DraftRoute> = {}): DraftRoute => ({
  ...emptyDraft('route-1'),
  stops,
  ...overrides,
});

const routeRow = (overrides: Partial<RouteRow> = {}): RouteRow => ({
  id: 'route-1',
  user_id: 'user-1',
  name: null,
  status: 'draft',
  is_round_trip: false,
  origin_place_id: null,
  origin_is_current_location: true,
  optimized_at: null,
  optimization_tier: null,
  is_degraded: false,
  total_distance_m: null,
  total_duration_s: null,
  ...overrides,
});

const stopRow = (overrides: Partial<StopRow> = {}): StopRow => ({
  id: 'stop-a',
  route_id: 'route-1',
  place_id: 'place-a',
  label: null,
  note: null,
  entry_order: 0,
  optimized_order: null,
  state: 'pending',
  leg_distance_m: null,
  leg_duration_s: null,
  ...overrides,
});

describe('the lifecycle', () => {
  it('lets a draft become optimized', () => {
    expect(canTransition('draft', 'optimized')).toBe(true);
  });

  it('lets an optimized route fall back to draft, because an edit invalidates it', () => {
    // Adding a stop after an optimization genuinely invalidates the result, and
    // the draft clears `isOptimized` for the same reason.
    expect(canTransition('optimized', 'draft')).toBe(true);
  });

  it('refuses to reopen a finished day', () => {
    // Undoing a completion is marking a stop, not resurrecting a route. Allowing
    // this would let a completed day be re-driven and re-billed.
    expect(canTransition('completed', 'draft')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });

  it('refuses to send an underway route back to planning', () => {
    // A mid-route re-optimization keeps the route underway. Sending it back
    // would make a driver halfway through a day look like they had not started.
    expect(canTransition('in_progress', 'optimized')).toBe(false);
    expect(canTransition('in_progress', 'draft')).toBe(false);
  });

  it('lets the user archive from anywhere they can reach', () => {
    // Archiving is the way out, including out of a route abandoned mid-drive.
    for (const status of ROUTE_STATUSES) {
      if (status === 'archived') continue;
      expect(canTransition(status, 'archived')).toBe(true);
    }
  });

  it('treats archived as terminal', () => {
    for (const status of ROUTE_STATUSES) {
      if (status === 'archived') continue;
      expect(canTransition('archived', status)).toBe(false);
    }
  });

  it('accepts re-asserting the state already held', () => {
    // Two writes racing to record the same optimization is ordinary, not an
    // error, and refusing the second would surface a failure for a no-op.
    for (const status of ROUTE_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });
});

describe('what status a route is in', () => {
  it('is draft before anything has happened', () => {
    expect(statusFor({ isOptimized: false, isUnderway: false, isFinished: false })).toBe('draft');
  });

  it('is optimized once a result produced the order', () => {
    expect(statusFor({ isOptimized: true, isUnderway: false, isFinished: false })).toBe(
      'optimized',
    );
  });

  it('lets in-progress outrank optimized', () => {
    expect(statusFor({ isOptimized: true, isUnderway: true, isFinished: false })).toBe(
      'in_progress',
    );
  });

  it('lets finished outrank everything', () => {
    expect(statusFor({ isOptimized: true, isUnderway: true, isFinished: true })).toBe('completed');
  });
});

describe('a draft as rows', () => {
  it('writes no coordinate anywhere', () => {
    // The rule this test exists for. `stops` has no expiry mechanism, so a
    // coordinate written there is a breach nothing would ever clean up.
    const { stops } = toRows(draftWith([stop('a', 0), stop('b', 1)]), 'user-1', {
      status: 'draft',
      progress: null,
      totals: null,
    });

    const serialised = JSON.stringify(stops);
    expect(serialised).not.toContain('45.7');
    expect(serialised).not.toContain('9.7');
    expect(serialised).not.toContain('Bergamo');
  });

  it('keeps the label and the note, which are the user’s own words', () => {
    const { stops } = toRows(
      draftWith([stop('a', 0, { label: 'Back entrance', note: 'Ring twice' })]),
      'user-1',
      { status: 'draft', progress: null, totals: null },
    );

    expect(stops[0]?.label).toBe('Back entrance');
    expect(stops[0]?.note).toBe('Ring twice');
  });

  it('leaves optimized_order null until an optimization produced the order', () => {
    // The difference between a list the user typed and a list an engine
    // returned, which is what "already the fastest order" is measured against.
    const { stops } = toRows(draftWith([stop('a', 0)]), 'user-1', {
      status: 'draft',
      progress: null,
      totals: null,
    });
    expect(stops[0]?.optimized_order).toBeNull();
  });

  it('records the optimized order once there is one', () => {
    const { stops } = toRows(draftWith([stop('a', 0)], { isOptimized: true }), 'user-1', {
      status: 'optimized',
      progress: null,
      totals: null,
    });
    expect(stops[0]?.optimized_order).toBe(0);
  });

  it('stores the degraded flag so a T0 result stays labelled in history', () => {
    const { route } = toRows(
      draftWith([stop('a', 0)], { isOptimized: true, isDegraded: true }),
      'user-1',
      {
        status: 'optimized',
        progress: null,
        totals: {
          tier: 'T0',
          distanceMeters: 1000,
          durationSeconds: null,
          optimizedAt: '2026-08-09T10:00:00Z',
        },
      },
    );
    expect(route.is_degraded).toBe(true);
    expect(route.optimization_tier).toBe('T0');
  });

  it('carries progress onto the rows', () => {
    const { stops } = toRows(draftWith([stop('a', 0), stop('b', 1)]), 'user-1', {
      status: 'in_progress',
      progress: { routeId: 'route-1', states: { a: 'completed', b: 'skipped' } },
      totals: null,
    });

    expect(stops.map((row) => row.state)).toEqual(['completed', 'skipped']);
  });
});

describe('rows as a draft', () => {
  it('never invents a coordinate', () => {
    // Even a plausible one would be a coordinate with no refresh date, which is
    // the single case the expiry rule cannot handle.
    const draft = fromRows(routeRow(), [stopRow()]);
    expect(draft.stops[0]?.coordinate).toBeNull();
  });

  it('restores the optimized order when there is one', () => {
    const draft = fromRows(routeRow({ status: 'optimized' }), [
      stopRow({ id: 'a', entry_order: 0, optimized_order: 1 }),
      stopRow({ id: 'b', entry_order: 1, optimized_order: 0 }),
    ]);

    expect(draft.stops.map((s) => s.id)).toEqual(['b', 'a']);
    expect(draft.isOptimized).toBe(true);
  });

  it('falls back to the entry order rather than an order nobody chose', () => {
    const draft = fromRows(routeRow(), [
      stopRow({ id: 'a', entry_order: 1 }),
      stopRow({ id: 'b', entry_order: 0 }),
    ]);

    expect(draft.stops.map((s) => s.id)).toEqual(['b', 'a']);
    expect(draft.isOptimized).toBe(false);
  });

  it('does not claim an optimization when only some stops have one', () => {
    // A route edited after optimization: one stop added, no result. Claiming it
    // was optimized would put "already the fastest order" on a list the user
    // half-typed.
    const draft = fromRows(routeRow(), [
      stopRow({ id: 'a', entry_order: 0, optimized_order: 0 }),
      stopRow({ id: 'b', entry_order: 1, optimized_order: null }),
    ]);
    expect(draft.isOptimized).toBe(false);
  });

  it('keeps the degraded label across a save and a reload', () => {
    const draft = fromRows(routeRow({ is_degraded: true }), [stopRow()]);
    expect(draft.isDegraded).toBe(true);
  });

  it('renumbers positions contiguously from zero', () => {
    const draft = fromRows(routeRow(), [
      stopRow({ id: 'a', entry_order: 5 }),
      stopRow({ id: 'b', entry_order: 9 }),
    ]);
    expect(draft.stops.map((s) => s.position)).toEqual([0, 1]);
  });
});

describe('progress across devices', () => {
  it('restores what was already done on a route underway', () => {
    const progress = progressFromRows(routeRow({ status: 'in_progress' }), [
      stopRow({ id: 'a', state: 'completed' }),
      stopRow({ id: 'b', state: 'pending' }),
    ]);

    expect(progress).toEqual({ routeId: 'route-1', states: { a: 'completed' } });
  });

  it('has no progress for a route that has not started', () => {
    // A draft with progress attached would put a plan into the in-progress
    // state on launch, which outranks everything else the user might want.
    expect(progressFromRows(routeRow({ status: 'optimized' }), [stopRow()])).toBeNull();
  });
});

describe('naming a route nobody named', () => {
  const summary = (overrides: Partial<SavedRouteSummary> = {}): SavedRouteSummary => ({
    routeId: 'route-1',
    name: null,
    status: 'completed' as RouteStatus,
    stopCount: 12,
    isDegraded: false,
    distanceMeters: null,
    durationSeconds: null,
    updatedAt: '2026-08-04T09:30:00.000Z',
    ...overrides,
  });

  it('uses the name when there is one', () => {
    expect(displayName(summary({ name: 'Monday north' }))).toBe('Monday north');
  });

  it('describes the day when there is not', () => {
    // Naming a day's deliveries is work the user gets nothing for, so almost no
    // route has a name. The date and the count are how a driver looks for last
    // Tuesday's round.
    expect(displayName(summary())).toBe('4 Aug · 12 stops');
  });

  it('does not treat whitespace as a name', () => {
    expect(displayName(summary({ name: '   ' }))).toContain('12 stops');
  });

  it('says stop rather than stops for one', () => {
    expect(displayName(summary({ stopCount: 1 }))).toContain('1 stop');
  });
});

describe('how many routes a plan keeps', () => {
  const summaries = Array.from({ length: 5 }, (_, index) => ({
    routeId: `route-${index}`,
    name: null,
    status: 'completed' as RouteStatus,
    stopCount: 3,
    isDegraded: false,
    distanceMeters: null,
    durationSeconds: null,
    updatedAt: '2026-08-04T09:30:00.000Z',
  }));

  it('shows the newest within the allowance', () => {
    expect(partitionByAllowance(summaries, 3).visible.map((s) => s.routeId)).toEqual([
      'route-0',
      'route-1',
      'route-2',
    ]);
  });

  it('locks the rest rather than hiding them', () => {
    // They are the user's own work. A product that silently deletes a driver's
    // records in order to sell them back is a different product.
    expect(partitionByAllowance(summaries, 3).locked).toHaveLength(2);
  });

  it('locks everything when the allowance is nothing', () => {
    expect(partitionByAllowance(summaries, 0).visible).toHaveLength(0);
    expect(partitionByAllowance(summaries, 0).locked).toHaveLength(5);
  });
});
