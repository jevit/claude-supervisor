const base = require('./jest.config');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'integration',
  testMatch: [
    '**/__tests__/integration/**/*.test.js',
    '**/*.integration.test.js',
  ],
  testTimeout: 30000, // les tests d'intégration frappent le vrai backend
  coverageDirectory: 'coverage/integration',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
