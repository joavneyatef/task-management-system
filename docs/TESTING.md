# Testing & Regression Suite

The full test cycle for this repo (React 19 SPA + single-file Express/Prisma
backend). Assembled over phases 0–8 of the Test Cycle plan.

As of the last assembly run: **445 Vitest tests across 33 files** + **23 Playwright
E2E tests**, `tsc` clean, coverage thresholds enforced, zero `critical` axe
violations.

---

## How to run it

| Command | What it does |
|---|---|
| `npm run lint` | `tsc --noEmit` — typecheck the whole repo (src, server, tests, e2e). |
| `npm test` | Vitest, both projects, no coverage. Fast inner loop. |
| `npm run test:web` | Vitest `web` project only (jsdom + MSW). |
| `npm run test:server` | Vitest `server` project only (node + real SQLite). |
| `npm run test:cov` | Vitest both projects **with coverage thresholds enforced** (the unit/integration gate). |
| `npm run test:e2e` | Playwright — builds a production bundle, boots it against an isolated DB, runs the journeys + a11y + perf specs. |
| `npm run precommit` | typecheck + tests for changed files. Wired to the pre-commit hook. |
| `npm run verify` | `lint` + `test:cov`. The pre-push check. |
| `npm run verify:all` | `verify` + `build` + `test:e2e`. Everything, serially. |
| `npm run release-gate` | The authoritative gate — see [RELEASE_GATE.md](./RELEASE_GATE.md). |
| `npm run hooks:install` | Point git at `.githooks/` (pre-commit + pre-push). Run once per clone. |
| `npm run coverage:trend` | Append a coverage row to `docs/coverage-trend.md`. |

Day-to-day workflow, flake policy, and the weekly maintenance job are in
[CONTINUOUS_TESTING.md](./CONTINUOUS_TESTING.md).

---

## Layers

### 1. Pure logic (Vitest `web`, jsdom)

`src/utils/*.spec.ts` — `permissions`, `checklistReset`, `taskJournal`,
`liveSync`. Extracted, side-effect-free functions held at ~100% with their own
per-file thresholds. These are the RBAC and sync-guard primitives; they are the
most heavily gated code in the repo.

### 2. Component behaviour (Vitest `web`, React Testing Library + MSW)

`src/components/*.spec.tsx` — one spec per component, driven through the real
`LanguageProvider`. HTTP is mocked by MSW (`test/msw/handlers.ts`); the WebSocket
global is a controllable fake (`test/msw/mock-websocket.ts`). Covers the
render + interaction paths; the `language === 'ar'` RTL branches are the main
known gap (tracked in the `src/components/**` branch threshold).

### 3. API + DB integration (Vitest `server`, Supertest + real SQLite)

`test/server/*.spec.ts` + `test/contracts/contract.api.server.spec.ts`. The
Express app is mounted in-process with Supertest; `test/setup.server.ts`
`prisma db push --force-reset`es a disposable `prisma/test.db` and the legacy
JSON store is sandboxed to `prisma/.tmp` via `DATA_DIR`/`BACKUPS_DIR`.

- `auth` / `rbac` — session lifecycle, every `requireRole` route × every role.
- `state` / `mutations` / `reports` / `backups` / `misc` / `ws` — route bodies,
  happy + validation + auth-failure paths, WebSocket presence/lock/broadcast.
- `security` — cookie hardening, HMAC tamper rejection, `x-user-id` cannot
  escalate, credential-leak sweep, backups/env/deploy are management-only,
  path traversal, malformed body → 400 not 500.
- `resilience` — empty/huge bodies, corrupt JSON store fallback, request bursts.

### 4. Contracts (Vitest, both projects)

`test/contracts/` — Zod schemas in `schemas.ts` describe **exactly what the
browser reads** from each endpoint. `contract.api.server.spec.ts` parses real
responses through them; `contract.msw.web.spec.ts` parses the MSW mock payloads
through the same schemas so the mocks can't drift; `contract.types.web.spec.ts`
asserts enum/field parity between the schemas and `src/types.ts` at `tsc` time.

### 5. End-to-end (Playwright, Chromium)

`e2e/*.spec.ts` against a production build on a fully isolated backend
(`e2e/global-setup.ts` — temp Prisma schema → absolute `e2e/.tmp/e2e.db`,
`prisma/seed.ts` with a known password, `DATA_DIR`/`BACKUPS_DIR` → `e2e/.tmp`).
Never touches `prisma/dev.db` or `./data.json`.

- `smoke` — shell + public API served.
- `auth` — login/logout, wrong password, reload survival, email login.
- `navigation` — sidebar drives the URL hash; landing-tab behaviour on reload.
- `rbac` — per-role sidebar visibility, GM-only API refused for an assistant.
- `tasks` — assignee sees their work, GM sees the roster, board search filters.
- `perf` — gzip bundle budget, `GET /api/state` latency, DOMContentLoaded.
- `a11y` — `@axe-core/playwright`, WCAG 2.1 A/AA, gate on `critical`.

---

## Coverage gates (`vitest.config.ts` → `test.coverage.thresholds`)

Thresholds only ever move up. A failing gate means either a real regression or
new tests that justify raising the number in the same change.

- **Global floor**: lines/statements 63, branches 60, functions 58.
- **Per-file ratchets**: the Phase 2 utils (~100), `authService` / `stateMerge`
  (95–99), `server.ts` (78/63/92), `stateService` (76/52/100), `Checklists.tsx`
  (80), `src/components/**` aggregate (60/44/45).
- **Known debt, deliberately not excluded**: `App.tsx` is 0% (the polling +
  WebSocket effects and `fetchStateFromServer` are still inline). Extracting a
  `useLiveState()` hook is the prerequisite for the aspirational 80/70 global
  floor. It stays in `include` so the debt shows in every report.

---

## CI (`.github/workflows/test.yml`)

Three jobs: **unit + integration** (`lint` + `test:cov`), **end-to-end**
(`playwright install` + `test:e2e`), and **release gate** (`needs` both; the
single required status check). Coverage and the Playwright report/`test-results`
are uploaded as artifacts.

## Findings — fixed

- **`/api/complaints/ingest` was unreachable by the external webhook** (`app.use('/api', requireAuth)`
  shadowed its own `x-exclusivi-key` check). The session gate now skips this one
  path; the shared-secret still governs it. — `test/server/misc.spec.ts`
- **`hasManagerAccess` was an alias for `isManager`** so GM/Director couldn't open
  the "Control Crew & PINs" panel, backup/restore, or checklist authoring. It is
  now a real "Manager-level or above" helper (GM ∨ Director ∨ Manager), matching
  `canAccessAuditLog` / `canSendTasks` and the server `requireRole` guard.
- **Deep links didn't survive a reload for privileged users.** `fetchStateFromServer`
  now honours a hash pointing at a tab the user may open, and only falls back to
  the role's home tab otherwise. — `e2e/rbac.spec.ts`, `e2e/navigation.spec.ts`
- **Logout didn't revoke the session token.** An in-process kill-switch
  (`sessionsRevokedBefore`) now rejects any token minted before that user's last
  logout — a copied cookie stops working immediately. (In-memory only; a durable
  store still needs a schema change.) — `test/server/security.spec.ts`
- **`saveSystemState` FK ordering / P2003.** It now syncs
  departments → users → tasks → checklists → history, nulls any dangling
  `departmentId` FK instead of throwing, and skips `checklistHistory` rows with no
  parent checklist.

## Findings — still open

- **Split-brain storage**: auth/RBAC is Prisma-backed, several mutation routes
  still use the legacy JSON file store. Architectural; not a point fix.
- **Optimistic concurrency is half-built**: the merge silently drops stale edits;
  the wired-up 409 path + client conflict modal stay dormant. Activating them
  makes the live client pop spurious conflict modals during normal sync races
  (rapid tab switches, broadcast/poll ordering) — the client would need to stop
  POSTing version-stale snapshots first. See the note in `mergeStateWithServer`.
- **axe `color-contrast`** (impact: serious) across the dark theme — needs a
  design pass; the a11y specs gate on `critical` only.
