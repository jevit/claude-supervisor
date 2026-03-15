import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'unit',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    include: [
      'src/**/__tests__/unit/**/*.test.{js,jsx}',
      'src/**/*.unit.test.{js,jsx}',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/main.jsx',
        'src/**/__tests__/**',
        'src/**/*.unit.test.{js,jsx}',
        'src/**/*.integration.test.{js,jsx}',
      ],
      reportsDirectory: 'coverage/unit',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
