const base = require('./jest.config');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'unit',
  testMatch: [
    '**/__tests__/unit/**/*.test.js',
    '**/*.unit.test.js',
  ],
  coverageDirectory: 'coverage/unit',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
