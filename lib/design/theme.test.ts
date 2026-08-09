import { resolveTheme } from './theme';
import { colours, motion } from './tokens';

/**
 * The interesting cases are the disagreements: the user chose one thing, the
 * system says another, and the OS sometimes says nothing at all.
 */

const appearance = (system: 'light' | 'dark' | null, prefersReducedMotion = false) => ({
  system,
  prefersReducedMotion,
});

describe('what wins', () => {
  it('follows the system when the user has not chosen', () => {
    // The default, and the right one: a user who set their phone to dark at
    // night meant it.
    expect(resolveTheme(null, appearance('dark')).name).toBe('dark');
    expect(resolveTheme(null, appearance('light')).name).toBe('light');
  });

  it('lets an explicit choice override the system', () => {
    expect(resolveTheme('light', appearance('dark')).name).toBe('light');
    expect(resolveTheme('dark', appearance('light')).name).toBe('dark');
  });

  it('falls back to light when the OS will not say', () => {
    // Some Android versions decline under battery saver. Light is the safer
    // guess: a dark interface in sunlight is unreadable, the reverse is merely
    // unpleasant.
    expect(resolveTheme(null, appearance(null)).name).toBe('light');
  });

  it('reports whether the choice was the user’s, without changing what renders', () => {
    // Drives the settings screen's wording, nothing else.
    expect(resolveTheme('dark', appearance('dark')).isExplicit).toBe(true);
    expect(resolveTheme(null, appearance('dark')).isExplicit).toBe(false);
    expect(resolveTheme('dark', appearance('dark')).name).toBe(
      resolveTheme(null, appearance('dark')).name,
    );
  });
});

describe('neither theme is a variation of the other', () => {
  it('hands back that theme’s own token set', () => {
    expect(resolveTheme('dark', appearance('light')).colours).toBe(colours.dark);
    expect(resolveTheme('light', appearance('dark')).colours).toBe(colours.light);
  });
});

describe('reduced motion is bound into the theme', () => {
  it('gives every duration as zero when the user asked for less motion', () => {
    // Bound here so no component has to remember to consult the setting — a
    // component that reads a raw duration cannot honour it, and "cannot" beats
    // "usually remembers to".
    const theme = resolveTheme(null, appearance('light', true));
    expect(theme.duration('sheet')).toBe(0);
    expect(theme.duration('standard')).toBe(0);
  });

  it('leaves them alone otherwise', () => {
    const theme = resolveTheme(null, appearance('light', false));
    expect(theme.duration('sheet')).toBe(motion.sheet);
  });
});
