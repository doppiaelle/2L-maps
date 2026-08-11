import {
  clampViewport,
  FITTED,
  isFitted,
  MAX_SCALE,
  panBy,
  toCanvas,
  toScreen,
  zoomAbout,
} from './viewport';
import type { Viewport } from './viewport';

/**
 * The lens over the drawing.
 *
 * One property here is a correctness rule rather than a feel: **the inverse must
 * be exact**. A tap arrives in the container's untouched coordinates and the
 * legs it might have hit are in canvas coordinates, so getting the direction
 * backwards selects the wrong hop — and it looks entirely plausible on screen,
 * which is why it has to be answerable without a device.
 *
 * The rest is about not stranding the user: a drawing that can be flung into an
 * empty corner is one they have to find their way back from, and there is no
 * landmark out there to find it by.
 */

const size = { width: 390, height: 640 };
const at = (x: number, y: number) => ({ x, y });

describe('the two directions', () => {
  const zoomed: Viewport = { scale: 2, translateX: -100, translateY: -50 };

  it('round-trips a point exactly', () => {
    const canvasPoint = at(123.5, 456.25);
    expect(toCanvas(toScreen(canvasPoint, zoomed), zoomed)).toEqual(canvasPoint);
  });

  it('is the identity at the fitted view', () => {
    // Nothing is magnified, so a tap is already where it looks.
    expect(toCanvas(at(40, 90), FITTED)).toEqual(at(40, 90));
    expect(toScreen(at(40, 90), FITTED)).toEqual(at(40, 90));
  });

  it('maps a tap to the canvas point actually under it', () => {
    // Doubled and slid left by 100: canvas x = 110 is drawn at 120.
    expect(toCanvas(at(120, 150), zoomed)).toEqual(at(110, 100));
  });
});

describe('keeping the drawing on screen', () => {
  it('pins the fitted view, where there is nothing to pan', () => {
    expect(clampViewport({ scale: 1, translateX: -80, translateY: 40 }, size)).toEqual(FITTED);
  });

  it('allows exactly the overhang and no more', () => {
    // At 2× the picture is one window wider than the window, so it may slide by
    // one window and stop.
    const clamped = clampViewport({ scale: 2, translateX: -5_000, translateY: -5_000 }, size);
    expect(clamped.translateX).toBe(-size.width);
    expect(clamped.translateY).toBe(-size.height);
  });

  it('refuses to slide the drawing away from the top-left corner', () => {
    const clamped = clampViewport({ scale: 2, translateX: 500, translateY: 500 }, size);
    expect(clamped.translateX).toBe(0);
    expect(clamped.translateY).toBe(0);
  });

  it('will not zoom out past the fitted route or in past the ceiling', () => {
    // There is nothing outside the route to look at, and beyond the ceiling the
    // line's own simplification starts reading as corners the road does not have.
    expect(clampViewport({ ...FITTED, scale: 0.2 }, size).scale).toBe(1);
    expect(clampViewport({ ...FITTED, scale: 50 }, size).scale).toBe(MAX_SCALE);
  });
});

describe('a pinch', () => {
  it('holds the point under the fingers still', () => {
    // The user pinches on a stop precisely because that is the part they want
    // larger. Zooming about the centre would slide it out from under them.
    const focus = at(200, 300);
    const before = toCanvas(focus, FITTED);

    const after = zoomAbout(FITTED, focus, 2.5, size);
    expect(toCanvas(focus, after).x).toBeCloseTo(before.x);
    expect(toCanvas(focus, after).y).toBeCloseTo(before.y);
  });

  it('keeps the result on screen', () => {
    // Zooming about a corner would otherwise leave a margin where the drawing
    // used to be.
    const after = zoomAbout(FITTED, at(0, 0), 4, size);
    expect(clampViewport(after, size)).toEqual(after);
  });

  it('stops at the ceiling rather than accumulating past it', () => {
    let viewport = FITTED;
    for (let i = 0; i < 20; i += 1) viewport = zoomAbout(viewport, at(195, 320), 1.5, size);
    expect(viewport.scale).toBe(MAX_SCALE);
  });
});

describe('a drag', () => {
  it('moves the drawing with the finger', () => {
    const moved = panBy({ scale: 2, translateX: -100, translateY: -100 }, at(30, -20), size);
    expect(moved.translateX).toBe(-70);
    expect(moved.translateY).toBe(-120);
  });

  it('does nothing at the fitted view', () => {
    expect(panBy(FITTED, at(50, 50), size)).toEqual(FITTED);
  });
});

describe('whether anything is magnified', () => {
  it('says so, so a reset is offered only when there is something to reset', () => {
    expect(isFitted(FITTED)).toBe(true);
    expect(isFitted({ scale: 2.5, translateX: -10, translateY: -10 })).toBe(false);
  });
});
