/**
 * Tailwind's theme, generated from `lib/design/tokens.ts`.
 *
 * Nothing here is a value. `docs/07_DESIGN_SYSTEM.md` owns the numbers, the
 * token module is their single expression in code, and this file only maps them
 * onto class names — so a colour that fails the contrast test in
 * `lib/design/tokens.test.ts` cannot be spelled in a class name either
 * (CLAUDE.md §8 rule 1).
 *
 * Required at build time through ts-node's transpile-only register, because
 * Tailwind's config is plain CommonJS and the tokens are TypeScript.
 */
// `skipProject` matters: the app's tsconfig targets React Native and its
// rootDir inference fails when the only file compiled is a token module. This
// register is for one build-time import, not for type-checking the project —
// `npm run typecheck` does that against the real config.
require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  // TypeScript 6 deprecates the `node10` resolution this defaults to; `bundler`
  // is what the project uses anyway.
  compilerOptions: { module: 'commonjs', target: 'es2020', moduleResolution: 'bundler' },
});

const {
  colourScale,
  spacingScale,
  radiusScale,
  fontSizeScale,
} = require('./lib/design/tailwind-theme.ts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    // `extend` would leave Tailwind's default palette reachable, and a component
    // could then write `bg-slate-500` and pass review. Replacing the scales
    // outright means the only colours that exist are ours.
    colors: colourScale(),
    spacing: spacingScale(),
    borderRadius: radiusScale(),
    fontSize: fontSizeScale(),
    extend: {},
  },
  plugins: [],
};
