/** Unit + integration tests (*.spec.ts) under src/. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@gw/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@gw/db$': '<rootDir>/../../packages/db/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  testEnvironment: 'node',
};
