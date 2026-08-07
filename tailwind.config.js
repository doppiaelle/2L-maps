/**
 * Design tokens are owned by docs/07_DESIGN_SYSTEM.md. This file maps them onto
 * Tailwind so components can only reference tokens, never literal values
 * (CLAUDE.md §8). The palette itself lands in wave 4; wave 0 establishes the
 * pipeline and the content globs.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
};
