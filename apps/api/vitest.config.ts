import { existsSync } from 'node:fs';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests read DATABASE_URL from the environment (CI) or from apps/api/.env (local).
if (existsSync('.env')) process.loadEnvFile('.env');

// SWC keeps decorator metadata, which NestJS dependency injection needs; esbuild drops it.
const decorators = swc.vite({
  module: { type: 'es6' },
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
  },
});

export default defineConfig({
  plugins: [decorators],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.spec.ts'],
          // One database, one file at a time; each test runs inside a rolled-back transaction.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
