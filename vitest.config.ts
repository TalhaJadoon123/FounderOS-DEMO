import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Pages/components use the automatic JSX runtime (no `import React`), same as
  // Next builds them — without this, importing a *.tsx page throws
  // "React is not defined" under the classic runtime.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Several suites render full app pages, which pulls in the connector graph
    // and does real file + SQLite work. On a slow or memory-constrained box
    // (4 cores, ~12 GB) those land in the 10-25s range and the 5s default fails
    // them as timeouts even though nothing is wrong. A slow pass should be
    // reported as slow, not red.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Vitest defaults to one worker per core. On a 4-core box that starves the
    // RPC channel: workers spend their budget on transform/collect and the
    // parent times out calling "resolveId"/"onTaskUpdate", which surfaces as
    // two phantom failed suites with no assertion failure anywhere. Fewer,
    // better-fed workers finish the same suite reliably.
    maxWorkers: 2,
    minWorkers: 1,
    // A worker that is merely slow should not be recycled mid-file.
    isolate: true,
    // Hermetic creds: .env.local is a live credential store read fresh at call
    // time (lib/creds.ts), so tests must never see the operator's real file. Tests
    // that exercise the store point this at their own tmp path.
    env: {
      FOUNDER_OS_ENV_LOCAL: path.resolve(__dirname, 'tests', '.env.local.does-not-exist'),
    },
  },
});
