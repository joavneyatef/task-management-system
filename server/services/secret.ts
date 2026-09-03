import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Resolves the HMAC key used to sign session cookies. Order of preference:
 *
 *   1. `SESSION_SECRET` env var (>= 16 chars) — set this in production / `.env`.
 *   2. A random 96-hex-char secret generated once and persisted to
 *      `<DATA_DIR>/.session-secret`, then reused on every later boot.
 *
 * There is deliberately NO hardcoded fallback. A literal secret baked into the
 * source would let anyone who can read this repository forge a valid session
 * for any user (including the General Manager). The persisted-file path keeps a
 * self-hosted install zero-config while still giving every deployment its own
 * unique key.
 *
 * If the file can't be written (read-only FS, etc.) the process falls back to an
 * in-memory secret for the current run only — sessions then don't survive a
 * restart, and a warning tells the operator to set `SESSION_SECRET`.
 */
export function resolveSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) {
    return fromEnv.trim();
  }

  const dataDir = process.env.DATA_DIR || process.cwd();
  const secretFile = path.join(dataDir, '.session-secret');

  try {
    const existing = fs.readFileSync(secretFile, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* not created yet — fall through and generate one */
  }

  const generated = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, generated + '\n', { encoding: 'utf-8', mode: 0o600 });
    console.log(
      `[auth] No SESSION_SECRET set — generated one and saved it to ${secretFile}. ` +
        `Keep this file; deleting it (or losing it on redeploy) logs everyone out.`,
    );
  } catch (err) {
    console.warn(
      `[auth] Could not persist a generated SESSION_SECRET (${(err as Error).message}). ` +
        `Using an in-memory secret for this run only — sessions will not survive a restart. ` +
        `Set the SESSION_SECRET environment variable to fix this.`,
    );
  }
  return generated;
}
