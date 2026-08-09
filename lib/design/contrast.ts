/**
 * WCAG contrast, computed rather than asserted.
 *
 * `CLAUDE.md` §10 rule 3 requires 4.5:1 for text and 3:1 for interface elements,
 * in both themes, including content over the map. A design system can claim that
 * in prose forever; this module is what lets a test disagree.
 *
 * The formula is WCAG 2.x relative luminance. It is not a perceptual model and
 * is known to be generous in places — a mid-grey on white passes while looking
 * thin — so passing here is the floor, not proof that a pairing reads well.
 */

export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_INTERFACE = 3;

/** Text at 24 pt, or 18.66 pt bold, qualifies for the lower threshold. */
export function thresholdFor(sizePt: number, isBold: boolean): number {
  const isLarge = sizePt >= 24 || (isBold && sizePt >= 18.66);
  return isLarge ? AA_LARGE_TEXT : AA_TEXT;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Accepts `#RGB` and `#RRGGBB`. Anything else is a token typo, and returning
 *  null makes the test fail loudly rather than computing a ratio from zeroes. */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, '');

  if (value.length === 3) {
    const [r, g, b] = [...value].map((c) => Number.parseInt(c + c, 16));
    return r === undefined || g === undefined || b === undefined || [r, g, b].some(Number.isNaN)
      ? null
      : { r, g, b };
  }

  if (value.length !== 6) return null;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b].some(Number.isNaN) ? null : { r, g, b };
}

/** WCAG relative luminance: sRGB channels linearised, then weighted. */
export function relativeLuminance(colour: Rgb): number {
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/**
 * The ratio between two colours, from 1 (identical) to 21 (black on white).
 *
 * Order-independent by construction: the lighter is always the numerator, so a
 * caller cannot get a passing result by swapping foreground and background.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (fg === null || bg === null) return null;

  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrast(foreground: string, background: string, threshold: number): boolean {
  const ratio = contrastRatio(foreground, background);
  // An unparseable colour is a failure, not a pass. Defaulting the other way is
  // how a typo becomes an accessibility regression nobody notices.
  return ratio !== null && ratio >= threshold;
}
