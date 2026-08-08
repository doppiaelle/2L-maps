/**
 * Two projects, because the two halves of this repository run on different
 * runtimes and neither preset works for the other.
 *
 * `app` is the Expo client: jest-expo, React Native module resolution, RNTL.
 * `backend` is the schema and the Edge Function logic: plain Node, so PGlite can
 * boot a real Postgres in-process and the migrations are executed rather than
 * only reviewed (docs/36_IMPLEMENTATION_PLAN.md §7).
 */

const moduleNameMapper = {
  '^@/app/(.*)$': '<rootDir>/app/$1',
  '^@/features/(.*)$': '<rootDir>/features/$1',
  '^@/components/(.*)$': '<rootDir>/components/$1',
  '^@/lib/(.*)$': '<rootDir>/lib/$1',
  '^@/types$': '<rootDir>/types/index.ts',
  '^@/types/(.*)$': '<rootDir>/types/$1',
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      moduleNameMapper,
      testMatch: [
        '<rootDir>/app/**/*.test.{ts,tsx}',
        '<rootDir>/components/**/*.test.{ts,tsx}',
        '<rootDir>/features/**/*.test.{ts,tsx}',
        '<rootDir>/lib/**/*.test.{ts,tsx}',
        '<rootDir>/types/**/*.test.ts',
      ],
    },
    {
      displayName: 'backend',
      testEnvironment: 'node',
      moduleNameMapper,
      transform: {
        '^.+\\.[jt]sx?$': [
          'babel-jest',
          { presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]] },
        ],
      },
      testMatch: ['<rootDir>/supabase/**/*.test.ts'],
    },
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'features/**/*.{ts,tsx}',
    'supabase/functions/**/*.ts',
    '!**/*.test.{ts,tsx}',
  ],
};
