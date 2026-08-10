import { routeViewAfter, showsMap } from './route-view';
import type { RouteView } from './route-view';

/**
 * Which of the two things the Route section is showing.
 *
 * Two of these rules are the kind that fail silently. A map that outlives the
 * result it was drawn from keeps showing a route the user has since changed —
 * and it looks current, which is worse than showing nothing. And a discard that
 * takes the stops with it turns "go back and edit" into "start again", which the
 * user only discovers after it has happened.
 */

const listing = { current: 'list' as RouteView, hasResult: false };
const showing = { current: 'map' as RouteView, hasResult: true };

describe('when a result arrives', () => {
  it('shows the map without asking', () => {
    // The user pressed Optimize. Making them press something else to see the
    // answer would be charging a tap for work already done.
    expect(routeViewAfter({ kind: 'result-arrived' }, listing)).toBe('map');
  });

  it('shows it again when one arrives while the map is already up', () => {
    expect(routeViewAfter({ kind: 'result-arrived' }, showing)).toBe('map');
  });
});

describe('when the user dismisses it', () => {
  it('goes back to the list', () => {
    expect(routeViewAfter({ kind: 'dismissed' }, showing)).toBe('list');
  });

  it('is a no-op from the list, where there is nothing to dismiss', () => {
    expect(routeViewAfter({ kind: 'dismissed' }, listing)).toBe('list');
  });
});

describe('when the route changes underneath', () => {
  it('leaves the map, because the result no longer describes the stops', () => {
    // The failure this prevents is quiet: a map drawn from three stops, still on
    // screen after a fourth was added, showing an order that is now wrong and
    // looking exactly as authoritative as it did a second ago.
    expect(routeViewAfter({ kind: 'edited' }, showing)).toBe('list');
  });

  it('stays on the list when the list is what is showing', () => {
    expect(routeViewAfter({ kind: 'edited' }, listing)).toBe('list');
  });
});

describe('when the section is reopened', () => {
  it('brings back a result the user never dismissed', () => {
    // They went to Settings and came back. Nothing about the route changed, and
    // re-optimizing would spend an allowance to rebuild an answer still in hand.
    expect(routeViewAfter({ kind: 'section-opened' }, showing)).toBe('map');
  });

  it('opens on the list when there is no result to return to', () => {
    expect(routeViewAfter({ kind: 'section-opened' }, listing)).toBe('list');
  });

  it('opens on the list when the result went away while the section was closed', () => {
    // A cleared route, or a draft restored from storage without its geometry —
    // the result is held in memory and never persisted (ADR-0007).
    expect(routeViewAfter({ kind: 'section-opened' }, { current: 'map', hasResult: false })).toBe(
      'list',
    );
  });
});

describe('the floor under all of it', () => {
  it('refuses the map with nothing to draw', () => {
    // The drawn map has no tiles to fall back on: an empty canvas is the one
    // state it cannot fill honestly.
    expect(showsMap('map', false)).toBe(false);
  });

  it('allows it once there is a result', () => {
    expect(showsMap('map', true)).toBe(true);
  });

  it('never shows it from the list, result or no result', () => {
    expect(showsMap('list', true)).toBe(false);
    expect(showsMap('list', false)).toBe(false);
  });
});
