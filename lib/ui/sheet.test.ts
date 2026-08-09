import {
  detentFraction,
  detentHeight,
  FLICK_VELOCITY,
  nearestDetent,
  PEEK_HEIGHT,
  resolveDetent,
  showsRowActions,
  showsStopList,
} from './sheet';

/**
 * A sheet that only snaps to the nearest detent ignores a deliberate flick; one
 * that only follows velocity jumps two detents from a nudge. Both feel broken in
 * a way nobody can describe afterwards, and neither is visible in review — so
 * both are tested here at their boundaries.
 */

const SCREEN = 800;

describe('detent heights', () => {
  it('gives peek a fixed height, not a fraction', () => {
    // It holds a known amount of content — the metrics and the action — and on a
    // tall phone a percentage would leave it half empty.
    expect(detentHeight('collapsed', SCREEN)).toBe(PEEK_HEIGHT);
    expect(detentHeight('collapsed', 1200)).toBe(PEEK_HEIGHT);
  });

  it('never exceeds the screen', () => {
    // A very small device, or 200% Dynamic Type in landscape.
    expect(detentHeight('collapsed', 120)).toBe(120);
  });

  it('leaves the map visible even at full height', () => {
    // A sheet that covers everything is a screen, and the user is meant to keep
    // their place on the map.
    expect(detentHeight('expanded', SCREEN)).toBeLessThan(SCREEN);
  });

  it('reports the fraction the map has to pad for', () => {
    // Derived from the same heights the sheet is drawn at, so the camera padding
    // cannot drift from the thing it is padding for.
    expect(detentFraction('half', SCREEN)).toBeCloseTo(0.5, 6);
    expect(detentFraction('expanded', SCREEN)).toBeCloseTo(0.9, 6);
  });

  it('has nothing to report for a screen with no height', () => {
    // The first frame, before layout.
    expect(detentFraction('half', 0)).toBe(0);
  });
});

describe('releasing a drag', () => {
  it('snaps to the nearest detent when released slowly', () => {
    expect(resolveDetent(SCREEN * 0.48, 0, SCREEN, 'collapsed')).toBe('half');
    expect(resolveDetent(SCREEN * 0.85, 10, SCREEN, 'half')).toBe('expanded');
    expect(resolveDetent(190, -5, SCREEN, 'half')).toBe('collapsed');
  });

  it('honours a flick regardless of where it was released', () => {
    // The user committed. Snapping back to where their finger happened to be is
    // the app overruling them.
    expect(resolveDetent(PEEK_HEIGHT, FLICK_VELOCITY, SCREEN, 'collapsed')).toBe('half');
    expect(resolveDetent(SCREEN * 0.89, -FLICK_VELOCITY, SCREEN, 'expanded')).toBe('half');
  });

  it('moves exactly one detent on a flick, never two', () => {
    // Two would mean a nudge takes the user from peek to full, past the detent
    // they were reaching for.
    expect(resolveDetent(PEEK_HEIGHT, FLICK_VELOCITY * 10, SCREEN, 'collapsed')).toBe('half');
  });

  it('stays put when flicked past the end', () => {
    expect(resolveDetent(SCREEN * 0.9, FLICK_VELOCITY, SCREEN, 'expanded')).toBe('expanded');
    expect(resolveDetent(PEEK_HEIGHT, -FLICK_VELOCITY, SCREEN, 'collapsed')).toBe('collapsed');
  });

  it('treats just-under-the-threshold as a drag, not a flick', () => {
    // The boundary is the whole point of having one.
    expect(resolveDetent(PEEK_HEIGHT + 5, FLICK_VELOCITY - 1, SCREEN, 'collapsed')).toBe(
      'collapsed',
    );
  });

  it('reveals less when the release is an exact tie', () => {
    // At a midpoint the user has not committed, and showing less is the
    // recoverable mistake: the map stays visible and one more drag opens it.
    const midpoint = (detentHeight('collapsed', SCREEN) + detentHeight('half', SCREEN)) / 2;
    expect(nearestDetent(midpoint, SCREEN)).toBe('collapsed');
  });
});

describe('what each detent shows', () => {
  it('keeps the list out of peek', () => {
    // Mounting a virtualised list behind the metrics costs frames during the one
    // transition this product is judged on (docs/24_PERFORMANCE.md).
    expect(showsStopList('collapsed')).toBe(false);
    expect(showsStopList('half')).toBe(true);
    expect(showsStopList('expanded')).toBe(true);
  });

  it('keeps row actions for full height only', () => {
    // There is no room for them beside an address at half.
    expect(showsRowActions('half')).toBe(false);
    expect(showsRowActions('expanded')).toBe(true);
  });
});
