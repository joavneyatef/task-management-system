/**
 * Phase 6 E2E global setup.
 *
 * Builds a fully isolated backend world before Playwright starts the server:
 *   1. wipe e2e/.tmp
 *   2. synth a Prisma schema whose datasource points at an absolute e2e.db
 *   3. `prisma db push --force-reset` that schema (never touches prisma/dev.db)
 *   4. derive a seed fixture from data-seed.json with a known password on every
 *      account, drop it in the isolated DATA_DIR, and run prisma/seed.ts against
 *      the disposable database
 *
 * The webServer (see playwright.config.ts) then boots with DATABASE_URL /
 * DATA_DIR / BACKUPS_DIR pointed at these same disposable paths.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  E2E_BACKUPS_DIR,
  E2E_DATA_DIR,
  E2E_DATA_FILE,
  E2E_DB_PATH,
  E2E_DB_URL,
  E2E_PASSWORD,
  E2E_SCHEMA_PATH,
  E2E_TMP,
  REAL_SCHEMA_PATH,
  REAL_SEED_FILE,
} from './paths';

/** Mirrors authService.hashPassword so seeded accounts accept E2E_PASSWORD. */
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export default function globalSetup() {
  rmSync(E2E_TMP, { recursive: true, force: true });
  mkdirSync(E2E_BACKUPS_DIR, { recursive: true });

  // 1. disposable schema — only the datasource url differs from the real one.
  const schema = readFileSync(REAL_SCHEMA_PATH, 'utf-8').replace(
    /url\s*=\s*"file:\.\/dev\.db"/,
    `url = "${E2E_DB_URL}"`,
  );
  if (!schema.includes(E2E_DB_URL)) {
    throw new Error('global-setup: could not repoint the Prisma datasource url');
  }
  writeFileSync(E2E_SCHEMA_PATH, schema);

  // 2. create the schema in the fresh database.
  const prismaCli = path.join(
    path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
    'build',
    'index.js',
  );
  execFileSync(
    process.execPath,
    [prismaCli, 'db', 'push', '--schema', E2E_SCHEMA_PATH, '--force-reset', '--skip-generate', '--accept-data-loss'],
    { stdio: 'inherit' },
  );

  // 3. seed fixture: data-seed.json with every credential replaced by a known one.
  const seed = JSON.parse(readFileSync(REAL_SEED_FILE, 'utf-8')) as {
    users: Array<Record<string, unknown>>;
    demoDataVersion?: string;
  };
  for (const u of seed.users) {
    u.password = hashPassword(E2E_PASSWORD);
    if (u.pin) u.pin = hashPassword('0000');
  }
  writeFileSync(E2E_DATA_FILE, JSON.stringify(seed, null, 2));

  // 4. populate the disposable Prisma DB from that fixture (node --import tsx
  //    runs the TS seed script without a separate build step).
  const seedScript = path.join(path.dirname(REAL_SCHEMA_PATH), 'seed.ts');
  execFileSync(process.execPath, ['--import', 'tsx', seedScript], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: E2E_DB_URL, SEED_DATA_FILE: E2E_DATA_FILE },
  });

  // eslint-disable-next-line no-console
  console.log(`\n[e2e] isolated backend ready:\n  db      ${E2E_DB_PATH}\n  data    ${E2E_DATA_DIR}\n`);
}
