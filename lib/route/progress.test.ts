import { startedRoute, stopStateOf } from './progress';

/**
 * What survived the deletion of Done and Skip.
 *
 * The file this replaces was the largest test suite in `lib/` — sixty-odd cases
 * about marking, skipping, re-marking, pruning orphans and deciding which stop
 * came next. All of it described a loop the driver never ran
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)), and deleting
 * the behaviour without deleting its tests would have left the suite asserting a
 * product that no longer exists.
 *
 * Two things are still worth pinning down: that the record of a handoff is a
 * timestamp its caller supplies rather than one this module reads off a clock,
 * and that `unreachable` comes from the optimizer and from nowhere else.
 */

describe('handing a route over', () => {
  it('records when, not what was finished', () => {
    const at = new Date('2026-08-11T07:30:00.000Z');
    expect(startedRoute('route-1', at)).toEqual({
      routeId: 'route-1',
      startedAt: '2026-08-11T07:30:00.000Z',
    });
  });

  it('takes the instant from its caller rather than from a clock', () => {
    // The store sequences the write before the handoff and owns the clock. A
    // `new Date()` in here would make the ordering untestable.
    const a = startedRoute('r', new Date('2020-01-01T00:00:00.000Z'));
    const b = startedRoute('r', new Date('2020-01-01T00:00:00.000Z'));
    expect(a).toEqual(b);
  });
});

describe('which stops are unreachable', () => {
  it('reads the optimizer’s answer and nothing else', () => {
    expect(stopStateOf('s2', ['s2'])).toBe('unreachable');
    expect(stopStateOf('s1', ['s2'])).toBe('pending');
  });

  it('reports pending when the optimizer named none', () => {
    expect(stopStateOf('s1', [])).toBe('pending');
  });
});
