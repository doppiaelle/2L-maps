import type { Point } from './projection';

/**
 * Zoom and pan over a drawing that is otherwise fixed.
 *
 * **The canvas fits the whole route and nothing else, which is right until it
 * is not.** Four stops spanning Italy leave every one of them a few points
 * across, and a driver who wants to see which side of a town a delivery is on
 * has no way to look. So the drawing gains a lens: the projection still fits the
 * route, and this magnifies what it produced.
 *
 * **The transform is applied to the container, not to each shape.** Scaling the
 * whole picture — strokes and pins with it — is the paper-map-under-a-lens
 * model, and it is coherent: nothing is redrawn at a different level of detail,
 * because we have no different level of detail to redraw it at. An SVG that kept
 * its stroke widths while the geometry grew would imply a map that knows more
 * when you look closer, and this one does not.
 *
 * **The inverse is the reason this is a module.** A tap arrives in the untouched
 * coordinates of the container; the legs it might have hit are in canvas
 * coordinates. Getting that backwards selects the wrong hop, and it looks
 * entirely plausible on screen — which is the class of defect that has to be
 * answerable without a device (`lib/map/leg-selection.ts`).
 */

export interface Viewport {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

/** The whole route, fitted, which is where every canvas starts and what a double
 *  tap returns to. */
export const FITTED: Viewport = { scale: 1, translateX: 0, translateY: 0 };

/** Never below the fitted view: zooming out past the route would leave the
 *  drawing floating in a margin, and there is nothing out there to see. */
export const MIN_SCALE = 1;

/**
 * Eight times the fitted view.
 *
 * Enough to separate two stops on the same street at national scale, and short
 * of the point where the drawn line's own simplification becomes visible as
 * corners the road does not have (`lib/map/simplify.ts`).
 */
export const MAX_SCALE = 8;

/** Canvas coordinates → what the eye is looking at. */
export function toScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.translateX,
    y: point.y * viewport.scale + viewport.translateY,
  };
}

/**
 * What the eye is looking at → canvas coordinates.
 *
 * The one a tap needs, and the exact inverse of `toScreen` rather than an
 * approximation of it.
 */
export function toCanvas(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.translateX) / viewport.scale,
    y: (point.y - viewport.translateY) / viewport.scale,
  };
}

/**
 * Keep the drawing on screen.
 *
 * At the fitted scale there is nothing to pan, so the offsets are pinned to
 * zero. Zoomed in, the picture may be moved only as far as its own edges: a map
 * that can be flung into an empty corner is one the user has to find their way
 * back from, and there is no landmark out there to find it by.
 */
export function clampViewport(
  viewport: Viewport,
  size: { readonly width: number; readonly height: number },
): Viewport {
  const scale = Math.min(Math.max(viewport.scale, MIN_SCALE), MAX_SCALE);

  // How much larger the drawing is than the window it is seen through. That
  // overhang is exactly how far it may slide.
  const slackX = Math.max(size.width * (scale - 1), 0);
  const slackY = Math.max(size.height * (scale - 1), 0);

  return {
    scale,
    translateX: withoutNegativeZero(Math.min(0, Math.max(viewport.translateX, -slackX))),
    translateY: withoutNegativeZero(Math.min(0, Math.max(viewport.translateY, -slackY))),
  };
}

/**
 * `-0` is `0` to every comparison and a different value to `Object.is`.
 *
 * Clamping a negative offset against a zero slack produces it, and it would
 * survive into state, into a test's deep equality and into a transform string
 * as `-0`. Nothing renders differently; the point is that two viewports meaning
 * the same thing should *be* the same thing.
 */
function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * A pinch, about the point the fingers are on.
 *
 * Zooming about the centre would slide whatever the user is looking at out from
 * under them — they pinch on a stop precisely because that is the part they want
 * larger. Holding the focal point still is what makes the gesture feel attached
 * to the drawing rather than to the screen.
 */
export function zoomAbout(
  viewport: Viewport,
  focus: Point,
  factor: number,
  size: { readonly width: number; readonly height: number },
): Viewport {
  const scale = Math.min(Math.max(viewport.scale * factor, MIN_SCALE), MAX_SCALE);
  // The canvas point currently under the fingers, which must still be under them
  // afterwards.
  const anchor = toCanvas(focus, viewport);

  return clampViewport(
    {
      scale,
      translateX: focus.x - anchor.x * scale,
      translateY: focus.y - anchor.y * scale,
    },
    size,
  );
}

export function panBy(
  viewport: Viewport,
  delta: Point,
  size: { readonly width: number; readonly height: number },
): Viewport {
  return clampViewport(
    {
      scale: viewport.scale,
      translateX: viewport.translateX + delta.x,
      translateY: viewport.translateY + delta.y,
    },
    size,
  );
}

/** Whether anything is magnified, so a control that undoes it can be offered
 *  only when there is something to undo. */
export function isFitted(viewport: Viewport): boolean {
  return viewport.scale <= MIN_SCALE;
}
