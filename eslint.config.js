// @ts-check
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

/**
 * The layering of CLAUDE.md §1 is enforced here rather than trusted to review.
 *
 *   app/ → features/ → components/ → lib/ → types/
 *
 * Dependencies point downward only, and the five external SDKs of §1 are reachable
 * exclusively from their facade. A violation is a lint error, not a nit: an SDK
 * imported into a screen is what makes ADR-0012 unaffordable later, and it is
 * invisible in review once it is one import among forty.
 */

/** External SDKs that may only be imported by the facade that wraps them. */
const SDK_RESTRICTIONS = [
  {
    name: 'react-native-maps',
    message: 'Import react-native-maps only inside the <AppMap> facade (ADR-0005).',
  },
  {
    name: 'react-native-purchases',
    message: 'Import RevenueCat only inside BillingProvider (CLAUDE.md §1).',
  },
  {
    name: '@supabase/supabase-js',
    message: 'Import the Supabase SDK only inside lib/supabase (ADR-0006).',
  },
];

module.exports = [
  ...expoConfig,
  prettier,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'expo-env.d.ts',
      'supabase/functions/**', // Deno runtime, linted separately
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: { parser: tseslint.parser },
    rules: {
      // CLAUDE.md §3: `any` is forbidden; use `unknown` and narrow.
      '@typescript-eslint/no-explicit-any': 'error',
      // CLAUDE.md §3: no non-null assertion — coordinates are nullable by design (ADR-0007).
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': ['error', { paths: SDK_RESTRICTIONS }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // types/ imports nothing.
    files: ['types/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/features/*', '@/components/*', '@/lib/*', '../*'],
              message:
                'types/ sits at the bottom of the layering and imports nothing (CLAUDE.md §1).',
            },
          ],
        },
      ],
    },
  },
  {
    // lib/ decides. Pure functions only: no React, no React Native, no layer above.
    files: ['lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SDK_RESTRICTIONS,
            { name: 'react', message: 'lib/ holds pure functions — no React (CLAUDE.md §1).' },
            {
              name: 'react-native',
              message: 'lib/ holds pure functions — no React Native (CLAUDE.md §1).',
            },
          ],
          patterns: [
            {
              group: ['@/app/*', '@/features/*', '@/components/*'],
              message: 'lib/ must not import from a layer above it (CLAUDE.md §1).',
            },
          ],
        },
      ],
    },
  },
  {
    // components/ renders. No data fetching, no navigation.
    files: ['components/**/*.tsx', 'components/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...SDK_RESTRICTIONS,
            {
              name: '@tanstack/react-query',
              message: 'Shared components never fetch — data arrives as props (CLAUDE.md §1).',
            },
            {
              name: 'expo-router',
              message: 'Shared components never navigate — the caller does (CLAUDE.md §1).',
            },
          ],
          patterns: [
            {
              group: ['@/app/*', '@/features/*'],
              message: 'components/ must not import from a layer above it (CLAUDE.md §1).',
            },
          ],
        },
      ],
    },
  },
  {
    // The facades are the sole place their SDK may be imported.
    files: ['components/map/AppMap*.tsx', 'lib/adapters/**/*.ts', 'lib/supabase/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
