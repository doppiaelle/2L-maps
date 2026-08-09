import { AA_INTERFACE, AA_TEXT, contrastRatio, parseHex, thresholdFor } from './contrast';
import { colours, layout, metrics, motion, radius, space, text, durationFor } from './tokens';
import type { ThemeName } from './tokens';

/**
 * The contrast tests are the point of this file.
 *
 * `CLAUDE.md` §10 rule 3 requires WCAG AA in both themes, and until something
 * computes the ratios that requirement is a sentence in a document. These
 * compute them from the shipped token values, so a colour changed for looks
 * fails here rather than in front of a user reading a screen in sunlight.
 */

const THEMES: readonly ThemeName[] = ['light', 'dark'];

describe('every token is a colour', () => {
  it.each(THEMES)('%s parses', (theme) => {
    for (const [name, value] of Object.entries(colours[theme])) {
      expect({ name, value, parsed: parseHex(value) !== null }).toEqual({
        name,
        value,
        parsed: true,
      });
    }
  });
});

describe('text contrast meets WCAG AA in both themes', () => {
  it.each(THEMES)('primary text on every surface — %s', (theme) => {
    const c = colours[theme];
    for (const surface of [c.bg, c.surface, c.surfaceRaised]) {
      const ratio = contrastRatio(c.textPrimary, surface) ?? 0;
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(THEMES)('secondary text on every surface — %s', (theme) => {
    // Meta lines carry real information — distance, duration, the address — so
    // they are held to the text threshold, not the interface one.
    const c = colours[theme];
    for (const surface of [c.bg, c.surface, c.surfaceRaised]) {
      const ratio = contrastRatio(c.textSecondary, surface) ?? 0;
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(THEMES)('text on an accent fill — %s', (theme) => {
    // The primary action's label. If this fails, the one control the product is
    // built around is unreadable.
    const c = colours[theme];
    expect(contrastRatio(c.accentOn, c.accent) ?? 0).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.accentOn, c.accentPressed) ?? 0).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(THEMES)('error text on its own tinted background — %s', (theme) => {
    const c = colours[theme];
    expect(contrastRatio(c.danger, c.dangerSubtle) ?? 0).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('interface contrast meets the 3:1 threshold', () => {
  it.each(THEMES)('the accent as a control, not as text — %s', (theme) => {
    // A mint chip or an active route line is an interface element: 3:1 against
    // the surface it sits on.
    const c = colours[theme];
    expect(contrastRatio(c.accent, c.surface) ?? 0).toBeGreaterThanOrEqual(AA_INTERFACE);
    expect(contrastRatio(c.accent, c.bg) ?? 0).toBeGreaterThanOrEqual(AA_INTERFACE);
  });

  it.each(THEMES)('danger and warning as indicators — %s', (theme) => {
    const c = colours[theme];
    expect(contrastRatio(c.danger, c.surface) ?? 0).toBeGreaterThanOrEqual(AA_INTERFACE);
    expect(contrastRatio(c.warning, c.surface) ?? 0).toBeGreaterThanOrEqual(AA_INTERFACE);
  });
});

describe('the large-text allowance is applied only where it applies', () => {
  it('lowers the bar at 24 pt, and at 18.66 pt when bold', () => {
    expect(thresholdFor(metrics.metricMd.size, false)).toBe(3);
    expect(thresholdFor(19, true)).toBe(3);
    expect(thresholdFor(19, false)).toBe(AA_TEXT);
    expect(thresholdFor(text.body.size, true)).toBe(AA_TEXT);
  });

  it('does not let a small label borrow it', () => {
    // Uppercase labels are the smallest type shipped, so they are exactly where
    // a mistaken large-text allowance would do the most harm.
    expect(thresholdFor(metrics.labelXs.size, true)).toBe(AA_TEXT);
  });
});

describe('an unparseable colour fails rather than passing', () => {
  it('returns null instead of a ratio computed from zeroes', () => {
    // Defaulting the other way is how a token typo becomes an accessibility
    // regression that no test notices.
    expect(contrastRatio('not-a-colour', '#FFFFFF')).toBeNull();
    expect(parseHex('#GGG')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });

  it('accepts the short hex form', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('gives black on white the maximum ratio, in either order', () => {
    // Order-independence matters: otherwise a caller gets a passing result by
    // swapping foreground and background.
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });
});

describe('the numbers the documents fix', () => {
  it('keeps the touch minimum at 44', () => {
    // Non-negotiable, map markers included (CLAUDE.md §10 rule 2).
    expect(layout.touchMin).toBe(44);
  });

  it('keeps every spacing value on the 4 pt grid', () => {
    for (const [name, value] of Object.entries(space)) {
      expect({ name, remainder: value % 4 }).toEqual({ name, remainder: 0 });
    }
  });

  it('never ships body text below 13 pt', () => {
    for (const [name, token] of Object.entries(text)) {
      expect({ name, belowMinimum: token.size < 13 }).toEqual({ name, belowMinimum: false });
    }
  });

  it('confines uppercase to the label styles', () => {
    // Uppercase is measurably harder to read at length and for readers with
    // dyslexia, so it never carries body copy (docs/23_ACCESSIBILITY.md).
    for (const [name, token] of Object.entries(text)) {
      expect({ name, uppercase: token.uppercase }).toEqual({ name, uppercase: false });
    }
    expect(metrics.labelSm.uppercase).toBe(true);
    expect(metrics.labelXs.uppercase).toBe(true);
  });

  it('makes every metric tabular', () => {
    // A changing ETA must not shift the layout under a thumb that is about to
    // tap something.
    for (const name of ['metricXl', 'metricLg', 'metricMd'] as const) {
      expect({ name, tabular: metrics[name].tabular }).toEqual({ name, tabular: true });
    }
  });

  it('keeps the sheet transition inside its budget', () => {
    expect(motion.sheet).toBeLessThan(300);
  });
});

describe('reduced motion', () => {
  it('makes every transition instant', () => {
    // Not "shorter" — instant. Nothing may depend on an animation to be
    // understood (CLAUDE.md §10 rule 6).
    for (const token of Object.keys(motion) as (keyof typeof motion)[]) {
      expect(durationFor(token, true)).toBe(0);
    }
  });

  it('leaves the normal durations alone otherwise', () => {
    expect(durationFor('sheet', false)).toBe(motion.sheet);
  });
});

describe('radii', () => {
  it('gives the sheet the largest non-pill radius', () => {
    // The product's most recognisable shape.
    expect(radius.radiusLg).toBeGreaterThan(radius.radiusMd);
    expect(radius.radiusMd).toBeGreaterThan(radius.radiusSm);
  });
});
