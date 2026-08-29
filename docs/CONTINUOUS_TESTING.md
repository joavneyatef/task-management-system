# Continuous Testing — steady state

Phase 9. The suite is built (see [TESTING.md](./TESTING.md)) and gated (see
[RELEASE_GATE.md](./RELEASE_GATE.md)). This is how it stays healthy.

## The loop

| When | What runs | Command |
|---|---|---|
| While coding | Vitest watch on the area you're touching | `npm run test:watch` |
| Before each commit | typecheck + tests for changed files | `.githooks/pre-commit` → `npm run precommit` |
| Before each push | full unit + integration, coverage thresholds | `.githooks/pre-push` → `npm run verify` |
| Every push / PR (CI) | unit+integration **and** e2e, then the `release-gate` job | `.github/workflows/test.yml` |
| Before tagging a release | the whole pipeline + bundle budget + manual UAT | `npm run release-gate` + [UAT.md](./UAT.md) |
| Weekly (CI cron) | `npm audit` (fails on high/critical), `npm outdated`, full regression, coverage snapshot | `.github/workflows/maintenance.yml` |

### Enable the local hooks (once per clone)

```bash
npm run hooks:install
```

Sets `core.hooksPath` to `.githooks/`. Bypass a single run with
`git commit --no-verify` / `git push --no-verify` — for genuine WIP only, never
to get a red change past review.

## Adding tests — which layer?

- **A pure function / permission rule** → `src/utils/*.spec.ts`. Aim for ~100%;
  give it its own per-file threshold in `vitest.config.ts`.
- **Component render/interaction** → `src/components/*.spec.tsx` with RTL + MSW.
- **A route, a guard, a DB effect** → `test/server/*.spec.ts` (Supertest).
- **A new endpoint the browser reads** → add its schema to
  `test/contracts/schemas.ts` and a line to both contract specs.
- **A user-visible journey** → `e2e/*.spec.ts`. Keep these few and load-bearing;
  push detail down to the cheaper layers.

Every bug fix lands with the test that would have caught it, at the lowest layer
that can.

## Coverage trend

`vitest.config.ts` thresholds are the hard gate and only ever move up. For the
long view:

```bash
npm run test:cov            # refresh coverage/coverage-summary.json
npm run coverage:trend      # append a dated row to docs/coverage-trend.md
```

- `node scripts/coverage-trend.mjs --summary` — print the row (used by CI job summary).
- `node scripts/coverage-trend.mjs --check` — exit 1 if any metric fell > 0.5 pt
  since the last recorded row (a soft canary; the thresholds are the real gate).

When you raise coverage meaningfully, raise the matching threshold in the same
change so the ratchet holds.

**Standing debt:** `App.tsx` is 0% covered — its polling + WebSocket effects and
`fetchStateFromServer` are still inline. Extracting a `useLiveState()` hook is the
prerequisite for lifting the global floor toward 80/70. Tracked, not excluded.

## Flake policy

A test that fails without a code change is a bug in the test. Treat it like any
other defect.

1. **Reproduce** — `npx vitest run <file> --repeat 20`, or
   `npx playwright test <file> --repeat-each 20`. Playwright already retries
   twice in CI (`retries: process.env.CI ? 2 : 0`); a test that only passes on
   retry is still flaky and still gets triaged.
2. **Fix at the source** — the usual causes here: not awaiting a state settle
   (use `expect(...).toBeVisible()` / `waitForFunction`, never a bare sleep),
   depending on wall-clock time, cross-test state bleed (check `beforeEach`
   isolation), or the fire-and-forget Prisma sync in `writeState` landing during
   the next test.
3. **Quarantine only if you can't fix it now:**
   - Rename the test title to start with `@flaky`.
   - Skip it: `it.skip` (Vitest) / `test.fixme` (Playwright).
   - Add a row to the table below with an owner and a date.
   - Quarantine is capped at **2 weeks**. The weekly maintenance run is the
     reminder to drain it.

### Quarantine

| Test | Owner | Since | Reason | Tracking |
|------|-------|-------|--------|----------|
| _(none)_ | | | | |

## Dependency & security refresh

The `maintenance` workflow runs weekly and on demand (`workflow_dispatch`):

- `npm audit --audit-level=high` **fails the job** on a high/critical advisory —
  patch or document a mitigation.
- `npm audit` (full) and `npm outdated` are printed for review — schedule the
  non-urgent bumps.
- The full regression runs against freshly-resolved transitive deps, so a
  breaking minor upstream shows up here before a release does.
- Bump `@playwright/test` and re-run `npx playwright install` together.
- Keep Node at the CI version (22) locally; `engines` is intentionally unset to
  avoid install friction, so this doc is the source of truth.

## When `main` is red

1. Revert the offending change first; fix forward in a follow-up. A green `main`
   is the shared contract.
2. If it's infra (CI runner, registry, browser download), re-run once; if it
   persists, pin/patch the infra, don't disable the check.
3. A coverage-threshold failure is not "lower the threshold" — it's "add the
   test" or "justify and revert".
