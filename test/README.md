# Test harness (Phase 0)

Set up per the Test Cycle plan, Phase 0. This directory holds cross-cutting test
infrastructure; unit specs live next to their source (`src/**`, `server/**`).

## Layout

```
test/
  setup.web.ts        jsdom project setup: jest-dom, MSW, fake WebSocket
  setup.server.ts     node project setup: mock Gemini, build + reset test DB
  factories.ts        makeUser / makeTask / makeChecklist / makeComplaint / makeOrg
  global.d.ts         ambient types for Vitest globals + jest-dom matchers
  shared/
    authz-matrix.ts   one truth table for role permissions, reused by every layer
  msw/
    handlers.ts       baseline happy-path HTTP handlers
    server.ts         MSW server instance
    mock-websocket.ts controllable WebSocket stand-in (.emit() a server frame)
  web/                jsdom specs that don't belong to one source file
  server/
    support.ts        api() / seedOrg() / loginAs() Supertest helpers
    *.spec.ts         HTTP + DB integration specs
```

## Projects

Vitest runs two [projects](../vitest.config.ts):

| project  | env   | includes                                   | setup             |
|----------|-------|--------------------------------------------|-------------------|
| `web`    | jsdom | `src/**/*.spec.tsx`, `test/web/**`          | `setup.web.ts`    |
| `server` | node  | `server/**/*.spec.ts`, `test/server/**`     | `setup.server.ts` |

The `server` project runs single-threaded because it shares one SQLite file
(`prisma/test.db`), rebuilt once per run and truncated in `afterEach`.

## Commands

```bash
npm test            # both projects, one pass
npm run test:watch  # watch mode
npm run test:web    # jsdom project only
npm run test:server # node project only
npm run test:cov    # both + coverage report + thresholds
npm run test:e2e    # Playwright (needs: npx playwright install chromium)
```

### Test database

`prisma/schema.prisma` still hard-codes the dev datasource (`prisma/dev.db`), so
dev/prod are untouched. For tests:

- `vitest.config.ts` sets `DATABASE_URL` to an absolute `file:` URL at
  `prisma/test.db`.
- `server/db.ts` passes that through to `new PrismaClient({ datasourceUrl })`
  only when `DATABASE_URL` is present — otherwise the baked-in dev path is used.
- `test/setup.server.ts` writes a throwaway `prisma/.test.schema.prisma` (the
  real schema with its datasource repointed) and runs `prisma db push
  --force-reset` against it once per run.

A test run therefore cannot touch `prisma/dev.db` or `data.json`.

## Conventions

- **Name tests as behaviour sentences**: `it('rejects an expired session token')`.
- **No logic in test bodies** — no `if`, `for`, `try/catch`. Use `it.each` for variants.
- **One `request.agent()` per role per test**; never share agents across tests.
- **Never assert a hash's literal value** — assert the `verify` round-trip.
- **Fake every clock** (`vi.setSystemTime`); restore in `afterEach`.
- **No arbitrary sleeps** — use `findBy*`, `vi.advanceTimersByTime`, `expect.poll`.
- **Assert request bodies** for anything that mutates, not just the render/return.
- **MSW is `onUnhandledRequest: 'error'`** — add a handler, don't hit the network.
- **A bug fix ships with a test that fails without the fix.** No exceptions.
- **Coverage thresholds only ratchet up.** A PR may raise them, never lower them.
- **A skipped test is a lie** — convert `it.skip` to a tracked ticket or delete it.

## Coverage ratchet

Thresholds start at 0 (Phase 0). Raise them as each phase lands:

| Phase | Target                                                              |
|-------|-------------------------------------------------------------------|
| 2     | `src/utils/permissions.ts` 100/95 · `server/services/authService.ts` 100/90 |
| 3     | components 75/65                                                   |
| 4     | server route modules 85/75                                         |
| 8     | global floor 80/70                                                 |
