import { colours, durationFor, motion, type ColourTokens, type ThemeName } from './tokens';

/**
 * Resolving the theme, as a pure function of what the system reports and what
 * the user chose.
 *
 * It lives in `lib/` rather than in a provider component because it is a
 * decision, and components render (`CLAUDE.md` §1). Putting it in a hook would
 * make "what happens when the user picked dark and then turned the system to
 * light" a thing you verify by mounting a tree.
 *
 * **Both themes are first-class** (`CLAUDE.md` §8 rule 4). There is no notion of
 * a default theme here that dark is a variation of — `system` resolves to
 * whichever the device reports, and neither branch is the fallback.
 */

/** `null` means follow the system, which is the default and the right one: a
 *  user who set their phone to dark at night meant it. */
export type ThemePreference = ThemeName | null;

export interface Appearance {
  /** What the OS reports. `null` when it will not say — some Android versions
   *  under battery saver — in which case light is the safer guess: a dark
   *  interface rendered in sunlight is unreadable, the reverse is merely
   *  unpleasant. */
  readonly system: ThemeName | null;
  readonly prefersReducedMotion: boolean;
}

export interface ResolvedTheme {
  readonly name: ThemeName;
  readonly colours: ColourTokens;
  /** True when the user chose this explicitly rather than inheriting it. Drives
   *  the settings screen's wording, not the rendering. */
  readonly isExplicit: boolean;
  duration: (token: keyof typeof motion) => number;
}

export function resolveTheme(preference: ThemePreference, appearance: Appearance): ResolvedTheme {
  const name = preference ?? appearance.system ?? 'light';

  return {
    name,
    colours: colours[name],
    isExplicit: preference !== null,
    // Bound here so no component has to remember to consult the reduced-motion
    // setting. A component that reads a raw duration cannot honour it, and
    // "cannot" is better than "usually remembers to".
    duration: (token) => durationFor(token, appearance.prefersReducedMotion),
  };
}
