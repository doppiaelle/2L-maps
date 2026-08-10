import { colours, layout, metrics, radius, space, text } from './tokens';
import type { TypeToken } from './tokens';

/**
 * The Tailwind theme, derived from the tokens rather than restated beside them.
 *
 * Two hand-kept lists of colours diverge, and they diverge in the way that is
 * hardest to catch: one theme, one screen, one value. Generating this means the
 * contrast test that guards the tokens also guards what components can reach for
 * — a colour that fails the test cannot be spelled in a class name either.
 *
 * **Colours are variable references, not values.** `cssVariables()` carries both
 * palettes and `ThemeVariables` binds the active one at the root, so a class
 * name means "the current theme's surface-raised" rather than "light's". The
 * previous arrangement emitted light literals here and was the reason dark mode
 * showed near-black text on a near-black background.
 */

/** `textPrimary` → `text-primary`, and `space4` → `space-4`. Digits need their
 *  own boundary: without it `space4` stays `space4`, and the class a reviewer
 *  reads stops matching the row in the design document. */
const kebab = (camel: string): string =>
  camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/([a-z])(\d)/g, '$1-$2');

/**
 * `text-primary`, `accent-subtle`, `surface-raised` — the names the design
 * document uses, so a reviewer reading a class can find the row.
 *
 * **Each name resolves to a variable, not a literal, and that is the whole
 * point.** This used to emit `colours.light` values directly, which made every
 * colour class a light-theme colour in both themes. Backgrounds were unaffected
 * — they are set inline from `colours[theme]` and were correctly dark — so the
 * result on a dark phone was `#111112` text on a `#0B0B0C` background: the
 * design system rendering itself invisible, on every screen.
 *
 * `cssVariables()` below already existed to carry both palettes, and this file's
 * own header already claimed dark resolved through it. Nothing called it. The
 * variables are now what the classes point at, and `ThemeVariables` applies them.
 */
export function colourScale(): Record<string, string> {
  return Object.fromEntries(
    Object.keys(colours.light).map((name) => [kebab(name), `var(--colour-${kebab(name)})`]),
  );
}

export function spacingScale(): Record<string, string> {
  const scale: Record<string, string> = {};
  for (const [name, value] of Object.entries(space)) {
    scale[kebab(name)] = `${value}px`;
  }
  for (const [name, value] of Object.entries(layout)) {
    scale[kebab(name)] = `${value}px`;
  }
  return scale;
}

export function radiusScale(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(radius).map(([name, value]) => [
      kebab(name).replace('radius-', ''),
      `${value}px`,
    ]),
  );
}

/**
 * Font sizes carry their line height and tracking with them.
 *
 * Tailwind lets a size be declared alone, and then every call site has to
 * remember the matching leading class. One forgotten pairing is a row that sits
 * a pixel off from its neighbours — visible, hard to attribute, and permanent.
 */
export function fontSizeScale(): Record<
  string,
  [string, { lineHeight: string; letterSpacing: string }]
> {
  const entries = Object.entries({ ...metrics, ...text }) as [string, TypeToken][];
  return Object.fromEntries(
    entries.map(([name, token]) => [
      kebab(name),
      [
        `${token.size}px`,
        {
          lineHeight: `${token.lineHeight}px`,
          // Tracking is a percentage of the size in the design document; em is
          // the same thing in a unit CSS accepts.
          letterSpacing: `${token.tracking / 100}em`,
        },
      ],
    ]),
  );
}

/**
 * Both palettes as CSS variables, so the `dark:` variant switches values rather
 * than requiring a parallel set of class names.
 */
export function cssVariables(): { light: Record<string, string>; dark: Record<string, string> } {
  const toVars = (theme: 'light' | 'dark'): Record<string, string> =>
    Object.fromEntries(
      Object.entries(colours[theme]).map(([name, value]) => [`--colour-${kebab(name)}`, value]),
    );
  return { light: toVars('light'), dark: toVars('dark') };
}
