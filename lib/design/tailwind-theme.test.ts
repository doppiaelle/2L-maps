import {
  colourScale,
  cssVariables,
  fontSizeScale,
  radiusScale,
  spacingScale,
} from './tailwind-theme';
import { colours, layout, metrics, radius, space, text } from './tokens';

/**
 * These tests exist to prove the Tailwind theme is *derived*, not copied. A
 * suite that only checked a few known values would pass while a token added
 * later never reached a class name — which is the failure that pushes somebody
 * back to a hardcoded hex.
 */

describe('every token reaches Tailwind', () => {
  it('exposes every colour, under the name the design document uses', () => {
    const scale = colourScale();
    expect(Object.keys(scale)).toHaveLength(Object.keys(colours.light).length);
    expect(scale['text-primary']).toBe('var(--colour-text-primary)');
    expect(scale['accent-subtle']).toBe('var(--colour-accent-subtle)');
    expect(scale['surface-raised']).toBe('var(--colour-surface-raised)');
  });

  it('binds no colour class to a literal, in either theme', () => {
    // The defect this replaces: the scale emitted `colours.light` values, so a
    // class name meant "light's colour" in both themes. Backgrounds are set
    // inline from `colours[theme]` and were correctly dark, so a dark phone drew
    // near-black text on a near-black background — the design system rendering
    // itself invisible on every screen.
    for (const value of Object.values(colourScale())) {
      expect(value).toMatch(/^var\(--colour-[a-z-]+\)$/);
    }
  });

  it('gives every class a variable that actually exists', () => {
    // The two halves were each correct and never checked against each other:
    // `cssVariables()` carried both palettes, was documented as the mechanism,
    // and was called from nowhere. A class pointing at an undeclared variable
    // resolves to nothing, which is invisible rather than wrong-coloured.
    const declared = new Set(Object.keys(cssVariables().light));

    for (const reference of Object.values(colourScale())) {
      const name = /^var\((?<variable>--colour-[a-z-]+)\)$/.exec(reference)?.groups?.['variable'];
      expect(name).toBeDefined();
      expect(declared.has(name ?? '')).toBe(true);
    }
  });

  it('exposes every spacing and layout value', () => {
    const scale = spacingScale();
    expect(Object.keys(scale)).toHaveLength(Object.keys(space).length + Object.keys(layout).length);
    expect(scale['space-4']).toBe('16px');
    expect(scale['touch-min']).toBe(`${layout.touchMin}px`);
  });

  it('exposes every radius, without the redundant prefix', () => {
    const scale = radiusScale();
    expect(Object.keys(scale)).toHaveLength(Object.keys(radius).length);
    expect(scale['lg']).toBe(`${radius.radiusLg}px`);
  });

  it('exposes every type style from both voices', () => {
    const scale = fontSizeScale();
    expect(Object.keys(scale)).toHaveLength(Object.keys(metrics).length + Object.keys(text).length);
  });
});

describe('a font size cannot be used without its line height', () => {
  it('carries leading and tracking with every size', () => {
    // Tailwind would happily let a size be declared alone, and then every call
    // site has to remember the matching leading class. One forgotten pairing is
    // a row sitting a pixel off from its neighbours — visible, hard to
    // attribute, permanent.
    const scale = fontSizeScale();
    for (const [name, [size, config]] of Object.entries(scale)) {
      expect({ name, hasSize: size.endsWith('px') }).toEqual({ name, hasSize: true });
      expect({ name, hasLeading: config.lineHeight.endsWith('px') }).toEqual({
        name,
        hasLeading: true,
      });
      expect({ name, hasTracking: config.letterSpacing.endsWith('em') }).toEqual({
        name,
        hasTracking: true,
      });
    }
  });

  it('converts the document’s percentage tracking into em', () => {
    const scale = fontSizeScale();
    // `label-sm` is +8% in the design document.
    expect(scale['label-sm']?.[1].letterSpacing).toBe('0.08em');
    // `metric-xl` is −1%.
    expect(scale['metric-xl']?.[1].letterSpacing).toBe('-0.01em');
  });
});

describe('both palettes are emitted as variables', () => {
  it('gives light and dark the same variable names with different values', () => {
    // The `dark:` variant switches values rather than needing a parallel set of
    // class names — which is what keeps both themes first-class rather than
    // making dark an inverted afterthought (CLAUDE.md §8 rule 4).
    const { light, dark } = cssVariables();
    expect(Object.keys(light)).toEqual(Object.keys(dark));
    expect(light['--colour-bg']).toBe(colours.light.bg);
    expect(dark['--colour-bg']).toBe(colours.dark.bg);
    expect(light['--colour-bg']).not.toBe(dark['--colour-bg']);
  });
});
