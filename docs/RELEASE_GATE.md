# Release Gate

No build ships unless this gate is **CLEARED**. It is the same set of checks CI
runs on every push; running it locally before tagging catches environment drift.

## Run it

```bash
npm run release-gate
```

`scripts/release-gate.mjs` runs the full pipeline and validates its artefacts,
stopping at the first failure:

| # | Step | Enforced by | Fails when |
|---|---|---|---|
| 1 | Typecheck | `npm run lint` | any `tsc` error in `src/`, `server/`, `test/`, `e2e/` |
| 2 | Unit + integration | `npm run test:cov` | any Vitest failure, or a coverage threshold in `vitest.config.ts` not met |
| 3 | Coverage floor | `coverage/coverage-summary.json` | global lines/statements < 63, branches < 60, functions < 58 |
| 4 | Production build | `npm run build` | `vite build` or the esbuild server bundle fails |
| 5 | Bundle budget | gzip of `dist/assets/*` | JS > 200 KB or CSS > 25 KB gzipped |
| 6 | E2E + a11y + perf | `npm run test:e2e` | any Playwright failure, incl. a `critical` axe violation or a perf budget breach |

`npm run release-gate -- --skip-e2e` skips step 6 for a quick offline check. A
run with `--skip-e2e` is **not** a valid release sign-off.

## Manual checklist (in addition to the automated gate)

- [ ] `docs/UAT.md` executed against a staging build; every scenario **PASS**.
- [ ] `CHANGELOG` / release notes updated.
- [ ] No new entry needed under *Known findings* in `docs/TESTING.md`, or it has
      been triaged and accepted for this release.
- [ ] `prisma/dev.db` and `./data.json` are unmodified by the test run
      (`git status` clean — the suites are sandboxed, a diff here means a leak).
- [ ] Secrets: no real values committed; `.env` is git-ignored and only
      `.env`-shaped docs are in the tree.

## Sign-off

```
Release:      v_______
Commit:       ________
release-gate: CLEARED  (paste the final block from the script)
UAT:          PASS by ____________  on __________
Approved by:  ____________  on __________
```
