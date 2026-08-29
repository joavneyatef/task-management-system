/**
 * Absolute, disposable locations for the E2E run. Shared by playwright.config.ts
 * (webServer env) and global-setup.ts (schema push + seed) so the booted server
 * and the setup step agree on exactly one isolated database + JSON store.
 *
 * Nothing here points at a repo file: the E2E server must never read or write
 * prisma/dev.db, ./data.json, or ./backups.
 */
import { fileURLToPath } from 'node:url';

const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** file: URL for a sqlite path, forward-slashed so it stays valid on Windows. */
const fileUrl = (p: string) => `file:${p.replace(/\\/g, '/')}`;

export const E2E_TMP = dir('./.tmp');
export const E2E_DB_PATH = dir('./.tmp/e2e.db');
export const E2E_DB_URL = fileUrl(E2E_DB_PATH);
export const E2E_SCHEMA_PATH = dir('./.tmp/e2e.schema.prisma');
export const E2E_DATA_DIR = dir('./.tmp/data');
export const E2E_BACKUPS_DIR = dir('./.tmp/data/backups');
export const E2E_DATA_FILE = dir('./.tmp/data/data.json');
export const REAL_SCHEMA_PATH = dir('../prisma/schema.prisma');
export const REAL_SEED_FILE = dir('../data-seed.json');

/** Credentials every seeded user shares in the E2E database. */
export const E2E_PASSWORD = 'LongBeach!1';
export const E2E_PORT = 3000;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
