#!/usr/bin/env node
/**
 * Phase 9 — coverage-trend ledger.
 *
 * Reads coverage/coverage-summary.json (produced by `npm run test:cov`) and:
 *
 *   default      append a dated row to docs/coverage-trend.md
 *   --summary    print the row to stdout only (CI job summary), no file write
 *   --check      compare against the last recorded row; exit 1 if any metric
 *                dropped by more than DRIFT points (a soft canary — the hard
 *                gate is the per-file/global thresholds in vitest.config.ts)
 *
 * Run `npm run test:cov` first so the summary JSON is fresh.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUMMARY = fileURLToPath(new URL('../coverage/coverage-summary.json', import.meta.url));
const LEDGER = fileURLToPath(new URL('../docs/coverage-trend.md', import.meta.url));
const DRIFT = 0.5;
const METRICS = ['lines', 'statements', 'branches', 'functions'];

const args = new Set(process.argv.slice(2));

if (!existsSync(SUMMARY)) {
  console.error('coverage/coverage-summary.json not found — run `npm run test:cov` first.');
  process.exit(2);
}

const total = JSON.parse(readFileSync(SUMMARY, 'utf-8')).total;
const pcts = Object.fromEntries(METRICS.map((m) => [m, total[m].pct]));
const date = new Date().toISOString().slice(0, 10);
const rev = safeRev();
const row = `| ${date} | ${rev} | ${pcts.lines} | ${pcts.statements} | ${pcts.branches} | ${pcts.functions} |`;

const HEADER = [
  '# Coverage trend',
  '',
  'Appended by `npm run coverage:trend` after a coverage run. Newest at the bottom.',
  'The hard gates live in `vitest.config.ts`; this is just the long view.',
  '',
  '| Date | Commit | Lines % | Statements % | Branches % | Functions % |',
  '|------|--------|---------|--------------|------------|-------------|',
].join('\n');

if (args.has('--check')) {
  const prev = lastRecordedRow();
  if (!prev) {
    console.log('coverage-trend: no prior row to compare against — skipping check.');
    process.exit(0);
  }
  const drops = METRICS
    .map((m, i) => ({ m, delta: pcts[m] - prev[i] }))
    .filter(({ delta }) => delta < -DRIFT);
  if (drops.length) {
    console.error(`coverage-trend: regression beyond ${DRIFT} pts:`);
    for (const { m, delta } of drops) console.error(`  ${m}: ${delta.toFixed(2)} pts`);
    process.exit(1);
  }
  console.log('coverage-trend: no metric dropped beyond the drift budget.');
  process.exit(0);
}

if (args.has('--summary')) {
  console.log('### Coverage\n');
  console.log('| Lines | Statements | Branches | Functions |');
  console.log('|-------|------------|----------|-----------|');
  console.log(`| ${pcts.lines}% | ${pcts.statements}% | ${pcts.branches}% | ${pcts.functions}% |`);
  process.exit(0);
}

// default: append
let body = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf-8').trimEnd() : HEADER;
if (!body.includes('| Date | Commit |')) body = HEADER;
writeFileSync(LEDGER, `${body}\n${row}\n`);
console.log(`coverage-trend: appended → docs/coverage-trend.md\n${row}`);

function safeRev() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'n/a';
  } catch {
    return 'n/a';
  }
}
function lastRecordedRow() {
  if (!existsSync(LEDGER)) return null;
  const lines = readFileSync(LEDGER, 'utf-8').trim().split('\n');
  const dataRows = lines.filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l));
  if (!dataRows.length) return null;
  const cells = dataRows.at(-1).split('|').map((s) => s.trim());
  // ['', date, commit, lines, statements, branches, functions, '']
  return [Number(cells[3]), Number(cells[4]), Number(cells[5]), Number(cells[6])];
}
