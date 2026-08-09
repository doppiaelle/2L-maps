/**
 * The design tokens, and the only place their values exist.
 *
 * [`docs/07_DESIGN_SYSTEM.md`](../../docs/07_DESIGN_SYSTEM.md) owns these
 * numbers; this file cites it (`CLAUDE.md` §13 rule 9). The Tailwind config is
 * generated from here rather than written alongside it, because two hand-kept
 * lists of colours diverge — and they diverge silently, in one theme, on one
 * screen nobody opened during review.
 *
 * Components read tokens and never literals (`CLAUDE.md` §8 rule 1). The test
 * beside this file checks the contrast ratios these values actually produce,
 * which is the difference between claiming WCAG AA and meeting it.
 */

export type ThemeName = 'light' | 'dark';

export interface ColourTokens {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textTertiary: string;

  readonly accent: string;
  readonly accentPressed: string;
  readonly accentSubtle: string;
  readonly accentOn: string;

  readonly danger: string;
  readonly dangerSubtle: string;
  readonly warning: string;
  readonly info: string;
}

/** `bg` matches the paper map base, so map and interface read as one surface. */
const LIGHT: ColourTokens = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E4E4E1',
  textPrimary: '#111112',
  textSecondary: '#6B6B70',
  textTertiary: '#9A9AA0',

  // Darkened twice. The visual reference's mint was picked against a dark
  // background; docs/07_DESIGN_SYSTEM.md recorded `#0FA97E` as "darkened to
  // reach 4.5:1 against surface", and it reaches 3.00 — a white label on it
  // fails, and it fails 3:1 as a control against `bg` too. The contrast test
  // beside this file is what caught it. These values measure 5.12:1 and 6.69:1
  // with a white label, and 4.77:1 against `bg`.
  accent: '#0A7D5C',
  accentPressed: '#08694D',
  accentSubtle: '#E6F7F1',
  accentOn: '#FFFFFF',

  // `#D92D20` measured 4.44:1 on its own tinted background — near enough to
  // pass a glance and not near enough to pass the rule.
  danger: '#D0271B',
  dangerSubtle: '#FEF3F2',
  warning: '#B54708',
  info: '#3538CD',
};

const DARK: ColourTokens = {
  bg: '#0B0B0C',
  surface: '#161618',
  // Dark elevation is surface lightness, not shadow: a shadow on near-black is
  // invisible, so stacking one would be decoration that costs a render pass.
  surfaceRaised: '#1F1F22',
  border: '#2A2A2E',
  textPrimary: '#F5F5F3',
  textSecondary: '#9A9AA0',
  textTertiary: '#6B6B70',

  accent: '#2FD3A5',
  accentPressed: '#26B98F',
  accentSubtle: '#12332A',
  accentOn: '#04231A',

  danger: '#FF5C4D',
  dangerSubtle: '#3A1512',
  warning: '#F79009',
  info: '#8098F9',
};

export const colours: Readonly<Record<ThemeName, ColourTokens>> = { light: LIGHT, dark: DARK };

// ─── Typography ──────────────────────────────────────────────────────────────

export interface TypeToken {
  readonly size: number;
  readonly weight: '400' | '600' | '700';
  readonly lineHeight: number;
  /** Percentage of the font size. Negative tightens. */
  readonly tracking: number;
  readonly uppercase: boolean;
  /** Tabular figures, so a changing ETA does not shift the layout under a
   *  thumb that is about to tap something. */
  readonly tabular: boolean;
}

/**
 * Voice 1 — condensed uppercase, for metrics and labels.
 *
 * Uppercase is confined to labels of at most three words: it is measurably
 * harder to read at length and for readers with dyslexia, so it never carries
 * body copy (docs/23_ACCESSIBILITY.md).
 */
export const metrics = {
  metricXl: {
    size: 44,
    weight: '700',
    lineHeight: 48,
    tracking: -1,
    uppercase: false,
    tabular: true,
  },
  metricLg: {
    size: 32,
    weight: '700',
    lineHeight: 36,
    tracking: -0.5,
    uppercase: false,
    tabular: true,
  },
  metricMd: {
    size: 24,
    weight: '600',
    lineHeight: 28,
    tracking: 0,
    uppercase: false,
    tabular: true,
  },
  labelSm: {
    size: 11,
    weight: '600',
    lineHeight: 14,
    tracking: 8,
    uppercase: true,
    tabular: false,
  },
  labelXs: {
    size: 10,
    weight: '600',
    lineHeight: 12,
    tracking: 10,
    uppercase: true,
    tabular: false,
  },
} as const satisfies Record<string, TypeToken>;

/** Voice 2 — geometric sans, for everything else. Body never goes below 13. */
export const text = {
  titleLg: {
    size: 22,
    weight: '600',
    lineHeight: 28,
    tracking: 0,
    uppercase: false,
    tabular: false,
  },
  titleMd: {
    size: 17,
    weight: '600',
    lineHeight: 22,
    tracking: 0,
    uppercase: false,
    tabular: false,
  },
  body: { size: 16, weight: '400', lineHeight: 22, tracking: 0, uppercase: false, tabular: false },
  bodyStrong: {
    size: 16,
    weight: '600',
    lineHeight: 22,
    tracking: 0,
    uppercase: false,
    tabular: false,
  },
  caption: {
    size: 13,
    weight: '400',
    lineHeight: 18,
    tracking: 0,
    uppercase: false,
    tabular: false,
  },
  captionStrong: {
    size: 13,
    weight: '600',
    lineHeight: 18,
    tracking: 0,
    uppercase: false,
    tabular: false,
  },
} as const satisfies Record<string, TypeToken>;

// ─── Spacing, radius, elevation ──────────────────────────────────────────────

/** 4 pt base grid. Every spacing value is a multiple of 4. */
export const space = {
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 24,
  space6: 32,
  space7: 48,
  space8: 64,
} as const;

export const layout = {
  screenPadding: 20,
  /** Generous, so the list needs no dividers — the space is the separator. */
  listRowGap: 20,
  /** Non-negotiable, map markers included: the visual pin may be smaller than
   *  its hit area, but the hit area may not shrink (CLAUDE.md §10 rule 2). */
  touchMin: 44,
} as const;

export const radius = {
  radiusSm: 8,
  radiusMd: 14,
  /** The sheet's top corners — the product's most recognisable shape. */
  radiusLg: 22,
  radiusFull: 999,
} as const;

// ─── Motion ──────────────────────────────────────────────────────────────────

/**
 * Durations, in milliseconds.
 *
 * Under reduced motion every one of these becomes 0 and nothing depends on
 * animation to be understood (`CLAUDE.md` §10 rule 6) — which is why the sheet's
 * detent is state rather than a position derived from an animation.
 */
export const motion = {
  instant: 0,
  quick: 120,
  standard: 220,
  /** The sheet. Budgeted at under 300 ms, gesture-driven and interruptible
   *  (docs/24_PERFORMANCE.md). */
  sheet: 280,
} as const;

export function durationFor(token: keyof typeof motion, prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : motion[token];
}
