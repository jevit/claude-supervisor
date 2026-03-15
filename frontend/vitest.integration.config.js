import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'integration',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    include: [
      'src/**/__tests__/integration/**/*.test.{js,jsx}',
      'src/**/*.integration.test.{js,jsx}',
    ],
    testTimeout: 30000, // les tests d'intégration frappent le vrai backend
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/main.jsx',
        'src/**/__tests__/**',
        'src/**/*.unit.test.{js,jsx}',
        'src/**/*.integration.test.{js,jsx}',
      ],
      reportsDirectory: 'coverage/integration',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 50,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
  },
});
