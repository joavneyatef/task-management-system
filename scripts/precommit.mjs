#!/usr/bin/env node
/**
 * Phase 9 — the fast local check. Wired to `.githooks/pre-commit`.
 *
 *   1. typecheck (whole repo — cheap, catches the majority of breakage)
 *   2. Vitest for the files this commit touches (`--changed`), or the full
 *      `web` project if git can't tell us what changed.
 *
 * Target: a few seconds on a small commit. The heavier gates run on pre-push
 * (`npm run verify`) and in CI (`release-gate`).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const quiet = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

process.stdout.write('\n▶ precommit 1/2 — typecheck\n');
run('npm run lint');

process.stdout.write('\n▶ precommit 2/2 — tests for changed files\n');
const insideGit = quiet('git rev-parse --is-inside-work-tree') === 'true';
if (insideGit) {
  // --changed diffs against HEAD; --passWithNoTests keeps docs-only commits green.
  run('npx vitest run --changed --passWithNoTests');
} else {
  process.stdout.write('  (not a git work tree — running the web project instead)\n');
  run('npm run test:web');
}

process.stdout.write('\n✔ precommit passed\n');
