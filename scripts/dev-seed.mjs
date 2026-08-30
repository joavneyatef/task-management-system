#!/usr/bin/env node
/**
 * Seed an isolated database + JSON store for a local run with KNOWN logins,
 * without touching the committed prisma/dev.db or ./data.json.
 *
 *   node scripts/dev-seed.mjs
 *   # then:
 *   DATABASE_URL=file:<abs .local-run/dev.db> DATA_DIR=<abs .local-run> \
 *   BACKUPS_DIR=<abs .local-run/backups> npm run dev
 *
 * Every seeded account (from data-seed.json) gets password "Passw0rd!" and
 * PIN "1234". Prints the roster when done.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUN_DIR = path.join(ROOT, '.local-run');
const DB_PATH = path.join(RUN_DIR, 'dev.db');
const DB_URL = `file:${DB_PATH.replace(/\\/g, '/')}`;
const DATA_FILE = path.join(RUN_DIR, 'data.json');
const SCHEMA_PATH = path.join(RUN_DIR, 'local.schema.prisma');

export const DEV_PASSWORD = 'Passw0rd!';
export const DEV_PIN = '1234';
export { RUN_DIR, DB_URL, DB_PATH };

const hash = (plain) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(plain, salt, 64).toString('hex')}`;
};

function main() {
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(path.join(RUN_DIR, 'backups'), { recursive: true });

  // temp schema → absolute local db (schema hard-codes prisma/dev.db)
  const schema = readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf-8')
    .replace(/url\s*=\s*"file:\.\/dev\.db"/, `url = "${DB_URL}"`);
  writeFileSync(SCHEMA_PATH, schema);

  const prismaCli = path.join(
    path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
    'build', 'index.js',
  );
  execFileSync(process.execPath, [
    prismaCli, 'db', 'push', '--schema', SCHEMA_PATH,
    '--force-reset', '--skip-generate', '--accept-data-loss',
  ], { stdio: 'inherit' });

  // data-seed.json with known credentials on every account
  const seed = JSON.parse(readFileSync(path.join(ROOT, 'data-seed.json'), 'utf-8'));
  for (const u of seed.users) {
    u.password = hash(DEV_PASSWORD);
    u.pin = hash(DEV_PIN);
  }
  writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));

  execFileSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'prisma', 'seed.ts')], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: DB_URL, SEED_DATA_FILE: DATA_FILE },
  });

  const roster = seed.users
    .map((u) => `  ${u.role.padEnd(14)} ${u.username.padEnd(10)} (${u.name})`)
    .join('\n');
  process.stdout.write(
    `\nLocal DB ready → ${RUN_DIR}\n` +
    `Every account: password "${DEV_PASSWORD}"  ·  PIN "${DEV_PIN}"\n\n${roster}\n\n` +
    `Start the app:\n` +
    `  DATABASE_URL=${DB_URL} \\\n` +
    `  DATA_DIR=${RUN_DIR} \\\n` +
    `  BACKUPS_DIR=${path.join(RUN_DIR, 'backups')} \\\n` +
    `  npm run dev\n`,
  );
}

main();
