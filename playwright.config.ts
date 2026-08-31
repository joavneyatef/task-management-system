import { defineConfig, devices } from '@playwright/test';
import {
  E2E_BACKUPS_DIR,
  E2E_BASE_URL,
  E2E_DATA_DIR,
  E2E_DB_URL,
  E2E_PORT,
} from './e2e/paths';

/**
 * Phase 6 — critical-journey E2E against a production build.
 *
 * global-setup.ts builds a fully disposable backend (isolated sqlite + JSON
 * store, seeded with a known password on every account). The webServer below
 * boots `node dist/server.cjs` pointed at those disposable paths, on a
 * dedicated port (E2E_PORT, not the 3000 the dev server uses), so a test run
 * never reads or writes prisma/dev.db, ./data.json, or ./backups — and a dev
 * server or browser tab left open on 3000 can't cross-contaminate it.
 *
 * Requires the Chromium binary: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node dist/server.cjs',
    url: E2E_BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      PORT: String(E2E_PORT),
      DATABASE_URL: E2E_DB_URL,
      DATA_DIR: E2E_DATA_DIR,
      BACKUPS_DIR: E2E_BACKUPS_DIR,
      SESSION_SECRET: 'e2e-session-secret',
      GEMINI_API_KEY: 'e2e-key-unused',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
