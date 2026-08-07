/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/features/(.*)$': '<rootDir>/features/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/types$': '<rootDir>/types/index.ts',
    '^@/types/(.*)$': '<rootDir>/types/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'features/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/supabase/functions/'],
};
