#!/usr/bin/env node
/**
 * Phase 8 — the release gate.
 *
 * One command that must exit 0 before a release is cut. It runs the full
 * regression pipeline and then validates the artefacts it produced:
 *
 *   1. typecheck            — npm run lint
 *   2. unit + integration   — npm run test:cov   (coverage thresholds enforced by vitest)
 *   3. production build     — npm run build
 *   4. bundle budget        — gzipped dist/assets within limits
 *   5. end-to-end + a11y    — npm run test:e2e   (Playwright, incl. axe + perf specs)
 *
 * Anything that fails stops the gate. On success it prints a sign-off block.
 *
 * Usage:  npm run release-gate            (full run)
 *         npm run release-gate -- --skip-e2e   (skip step 5, e.g. offline)
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const skipE2E = args.has('--skip-e2e');

// Keep these in lock-step with vitest.config.ts (global floor) and
// e2e/perf.spec.ts (bundle budget). Duplicated on purpose so the gate is a
// single readable contract.
const COVERAGE_FLOOR = { lines: 63, statements: 63, branches: 60, functions: 58 };
const BUNDLE_BUDGET_KB = { js: 200, css: 25 };

const results = [];
let failed = false;

function step(name, fn) {
  process.stdout.write(`\n▶ ${name}\n`);
  const t0 = Date.now();
  try {
    fn();
    const ms = Date.now() - t0;
    results.push({ name, ok: true, ms });
    process.stdout.write(`✔ ${name} (${(ms / 1000).toFixed(1)}s)\n`);
  } catch (err) {
    failed = true;
    results.push({ name, ok: false, ms: Date.now() - t0, detail: err.message });
    process.stdout.write(`x ${name} FAILED\n${err.message}\n`);
  }
}

const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

step('1. typecheck', () => run('npm run lint'));

step('2. unit + integration (coverage-gated)', () => run('npm run test:cov'));

step('3. coverage floor', () => {
  const total = JSON.parse(readFileSync(new URL('../coverage/coverage-summary.json', import.meta.url))).total;
  const under = Object.entries(COVERAGE_FLOOR).filter(([k, min]) => total[k].pct < min);
  if (under.length) {
    throw new Error(
      under.map(([k, min]) => `  ${k}: ${total[k].pct}% < required ${min}%`).join('\n'),
    );
  }
  process.stdout.write(
    `  lines ${total.lines.pct}%  stmts ${total.statements.pct}%  branches ${total.branches.pct}%  funcs ${total.functions.pct}%\n`,
  );
});

step('4. production build', () => run('npm run build'));

step('5. bundle budget', () => {
  const dir = new URL('../dist/assets/', import.meta.url);
  const files = readdirSync(dir);
  const gz = (re) =>
    files.filter((f) => re.test(f)).reduce((n, f) => n + gzipSync(readFileSync(new URL(f, dir))).length, 0) / 1024;
  const js = gz(/\.js$/);
  const css = gz(/\.css$/);
  process.stdout.write(`  gzipped JS ${js.toFixed(1)} KB / ${BUNDLE_BUDGET_KB.js} KB   CSS ${css.toFixed(1)} KB / ${BUNDLE_BUDGET_KB.css} KB\n`);
  if (js > BUNDLE_BUDGET_KB.js) throw new Error(`  JS bundle ${js.toFixed(1)} KB exceeds ${BUNDLE_BUDGET_KB.js} KB`);
  if (css > BUNDLE_BUDGET_KB.css) throw new Error(`  CSS bundle ${css.toFixed(1)} KB exceeds ${BUNDLE_BUDGET_KB.css} KB`);
});

if (skipE2E) {
  results.push({ name: '6. end-to-end + a11y + perf', ok: true, ms: 0, detail: 'skipped (--skip-e2e)' });
  process.stdout.write('\n⤼ 6. end-to-end + a11y + perf — skipped (--skip-e2e)\n');
} else {
  step('6. end-to-end + a11y + perf', () => run('npm run test:e2e'));
}

process.stdout.write('\n' + '─'.repeat(64) + '\n');
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  const note = r.detail ? ` — ${r.detail.split('\n')[0]}` : '';
  process.stdout.write(`  [${mark}] ${r.name}${note}\n`);
}
process.stdout.write('─'.repeat(64) + '\n');

if (failed) {
  process.stdout.write('\n RELEASE GATE: BLOCKED\n\n');
  process.exit(1);
}
process.stdout.write(
  `\n RELEASE GATE: CLEARED${skipE2E ? ' (e2e skipped — not valid for a production release)' : ''}\n` +
    `   commit: ${safe('git rev-parse --short HEAD') || 'n/a'}\n` +
    `   date:   ${new Date().toISOString()}\n\n`,
);

function safe(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
