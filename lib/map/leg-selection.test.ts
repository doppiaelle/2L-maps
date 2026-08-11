import {
  distanceToPolyline,
  legAt,
  LEG_TOUCH_RADIUS,
  legAtScreenPoint,
  legSummary,
} from './leg-selection';
import { FITTED } from './viewport';
import type { Point } from './projection';

/**
 * Tapping a hop.
 *
 * Two things here would fail quietly. **The wrong leg** is the worse one: a
 * route that doubles back through the same junction has two legs a few points
 * apart, and answering with whichever came first in the array would show the
 * driver the distance of a segment their finger was nowhere near — and it would
 * look entirely plausible. **A corridor narrower than a finger** is the other:
 * the line is 5 pt wide, and a hit test on the stroke itself is a control nobody
 * can press (`CLAUDE.md` §10 rule 2).
 */

const p = (x: number, y: number): Point => ({ x, y });

/** Two hops in an L: east along the top, then south down the right. */
const elbow: readonly (readonly Point[])[] = [
  [p(0, 0), p(100, 0)],
  [p(100, 0), p(100, 100)],
];

describe('which leg was tapped', () => {
  it('answers the one under the finger', () => {
    expect(legAt(p(50, 4), elbow)).toBe(0);
    expect(legAt(p(96, 50), elbow)).toBe(1);
  });

  it('answers none when the tap is off the route', () => {
    // The canvas is mostly empty space. A tap in it means "nothing", not "the
    // nearest thing anywhere on screen".
    expect(legAt(p(50, 300), elbow)).toBeNull();
  });

  it('reaches as far as a finger does, not as far as the line is drawn', () => {
    // The route is drawn at 5 pt. Twenty-two either side is what turns it into a
    // 44 pt corridor.
    expect(legAt(p(50, LEG_TOUCH_RADIUS - 1), elbow)).toBe(0);
    expect(legAt(p(50, LEG_TOUCH_RADIUS + 1), elbow)).toBeNull();
  });

  it('takes the nearest leg rather than the first that is close enough', () => {
    // A route through a town centre and out again passes the same junction
    // twice. Answering with the earlier one would select a segment the finger
    // was nowhere near, and it would look plausible.
    const doublingBack: readonly (readonly Point[])[] = [
      [p(0, 0), p(100, 0)],
      [p(0, 12), p(100, 12)],
    ];

    expect(legAt(p(50, 11), doublingBack)).toBe(1);
    expect(legAt(p(50, 1), doublingBack)).toBe(0);
  });

  it('ignores a leg with nothing to measure against', () => {
    // A hop of a few metres can decode to one vertex. Not an error — simply not
    // selectable.
    expect(legAt(p(0, 0), [[p(0, 0)]])).toBeNull();
    expect(legAt(p(0, 0), [[]])).toBeNull();
  });

  it('answers none for a route with no legs at all', () => {
    expect(legAt(p(0, 0), [])).toBeNull();
  });
});

describe('a tap on a map that has been zoomed', () => {
  it('answers about the hop the finger is actually on', () => {
    // Doubled and slid: the leg drawn along canvas y = 0 appears on screen at
    // y = -40 + 0, so a finger at screen (100, -40) is on it. Without the
    // inversion this would measure the screen point against canvas geometry and
    // answer about a hop that is nowhere near.
    const zoomed = { scale: 2, translateX: 0, translateY: -40 };
    expect(legAtScreenPoint({ x: 100, y: -40 }, zoomed, elbow)).toBe(0);
  });

  it('shrinks the corridor with the drawing, not against it', () => {
    // The 44 pt corridor is in canvas units, so at 2x it covers twice as much
    // screen. A tap 30 screen-points off the line is 15 canvas-points off, and
    // still a hit — which is what the finger sees.
    const zoomed = { scale: 2, translateX: 0, translateY: 0 };
    expect(legAtScreenPoint({ x: 50, y: 30 }, zoomed, elbow)).toBe(0);
    expect(legAtScreenPoint({ x: 50, y: 30 }, FITTED, elbow)).toBeNull();
  });

  it('is the plain question at the fitted view', () => {
    expect(legAtScreenPoint({ x: 50, y: 4 }, FITTED, elbow)).toBe(legAt({ x: 50, y: 4 }, elbow));
  });
});

describe('what a leg says', () => {
  const legs = [
    { distanceMeters: 2400, durationSeconds: 480 },
    { distanceMeters: 11_200, durationSeconds: 1_500 },
  ];

  it('gives the two numbers Google measured, and nothing derived', () => {
    // No share of the total, no "fastest leg". Arithmetic presented as
    // measurement is precisely what this product just withdrew rather than
    // estimate (ADR-0027).
    expect(legSummary(0, legs)?.value).toBe('2.4 km · 8 min');
  });

  it('says which hop it is out loud, because the canvas cannot be explored', () => {
    expect(legSummary(1, legs)?.spoken).toBe('Leg 2 of 2, 11.2 km, 25 min');
  });

  it('reports nothing for an index the result does not have', () => {
    expect(legSummary(5, legs)).toBeNull();
    expect(legSummary(-1, legs)).toBeNull();
  });
});

describe('distance to a line', () => {
  it('measures to the nearest point on a segment, not to its ends', () => {
    expect(distanceToPolyline(p(50, 30), [p(0, 0), p(100, 0)])).toBeCloseTo(30);
  });

  it('clamps to an endpoint when the foot falls outside the segment', () => {
    expect(distanceToPolyline(p(-30, 40), [p(0, 0), p(100, 0)])).toBeCloseTo(50);
  });

  it('survives a repeated vertex rather than dividing by zero', () => {
    expect(distanceToPolyline(p(13, 14), [p(10, 10), p(10, 10)])).toBeCloseTo(5);
  });

  it('has nothing to measure against with fewer than two points', () => {
    expect(distanceToPolyline(p(0, 0), [p(1, 1)])).toBeNull();
  });
});
