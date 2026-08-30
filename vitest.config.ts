import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
// Absolute so the Prisma CLI (db push) and Prisma Client agree on the exact file
// regardless of their cwd. Forward slashes keep the file: URL valid on Windows.
const TEST_DB_URL = `file:${fileURLToPath(new URL('./prisma/test.db', import.meta.url)).replace(/\\/g, '/')}`;
const TMP_DIR = fileURLToPath(new URL('./prisma/.tmp', import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the '@' alias from vite.config.ts so app imports resolve in tests.
    alias: { '@': root.replace(/\/$/, '') },
  },
  test: {
    // Two isolated worlds: jsdom for React, node for the Express/Prisma server.
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          globals: true,
          include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'test/web/**/*.{test,spec}.{ts,tsx}',
            // Phase 5 — contract specs that need jsdom + MSW (mock parity, type-level).
            'test/contracts/**/*.web.{test,spec}.{ts,tsx}',
          ],
          setupFiles: ['./test/setup.web.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          // Schema push + real HTTP/DB round-trips need more headroom than jsdom units.
          hookTimeout: 60_000,
          testTimeout: 20_000,
          include: [
            'server/**/*.{test,spec}.ts',
            'test/server/**/*.{test,spec}.ts',
            // Phase 5 — contract specs that hit the real app over Supertest.
            'test/contracts/**/*.server.{test,spec}.ts',
          ],
          setupFiles: ['./test/setup.server.ts'],
          // The disposable SQLite file is shared across the suite, so the DB
          // reset in afterEach must not race parallel workers.
          pool: 'threads',
          poolOptions: { threads: { singleThread: true } },
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: TEST_DB_URL,
            SESSION_SECRET: 'test-session-secret',
            GEMINI_API_KEY: 'test-key-unused',
            // Redirect the legacy JSON state store + backup files away from the repo.
            DATA_DIR: TMP_DIR,
            BACKUPS_DIR: `${TMP_DIR}/backups`,
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**', 'server/**', 'server.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.{test,spec}.*',
        'src/main.tsx',
        'src/types.ts',
        'test/**',
        'dist/**',
      ],
      // Ratcheted per phase (Test Cycle plan) — thresholds only ever move up.
      // A failing gate here means either a real coverage regression or new tests
      // that justify raising the number in the same change.
      thresholds: {
        // Phase 8 — global regression floor. Set a few points under the current
        // actuals (lines/stmts ~65.6, branches ~63.1, functions ~61.3). The
        // aspirational 80/70 is blocked on App.tsx (0% — pending the useLiveState
        // hook extraction); it is deliberately still in `include` so that debt
        // stays visible in every report rather than being excluded away.
        lines: 63,
        statements: 63,
        branches: 60,
        functions: 58,
        // Phase 2 — pure logic & security core.
        'src/utils/permissions.ts': { statements: 100, branches: 98, functions: 100, lines: 100 },
        'src/utils/checklistReset.ts': { statements: 97, branches: 95, functions: 100, lines: 97 },
        'src/utils/taskJournal.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/utils/liveSync.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'server/services/stateMerge.ts': { statements: 99, branches: 84, functions: 100, lines: 99 },
        'server/services/authService.ts': { statements: 95, branches: 80, functions: 100, lines: 95 },
        // Phase 4 + 7 — API + DB integration and the security/resilience sweep.
        // The hard-coded demo-data seed was removed (a fresh install now starts
        // empty); the remaining uncovered lines are the readState() backward-compat
        // migrations and the dev Vite bootstrap.
        'server.ts': { statements: 76, lines: 76, branches: 63, functions: 92 },
        'server/services/stateService.ts': { statements: 76, lines: 76, branches: 52, functions: 100 },
        // Phase 3 — component behaviour (aggregate; branch coverage is held down
        // by untested Arabic/RTL `language === 'ar'` ternaries, addressed later).
        'src/components/**': { statements: 60, lines: 60, branches: 44, functions: 45 },
        'src/components/Checklists.tsx': { statements: 80, lines: 80, branches: 65, functions: 60 },
      },
    },
  },
});
