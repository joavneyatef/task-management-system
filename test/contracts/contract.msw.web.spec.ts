/**
 * Phase 5 — contract tests, mock side.
 *
 * The web suite runs entirely against the MSW handlers in test/msw/handlers.ts.
 * If those mocks drift from the real server's response shape, component tests
 * pass against a fiction. This spec runs the mock payloads through the exact
 * same schemas contract.api.server.spec.ts runs the real ones through, so the
 * two can't silently diverge.
 */
import { describe, expect, it } from 'vitest';
import {
  AcknowledgeSchema,
  AuditLogResponseSchema,
  AuthOkSchema,
  BackupCreateSchema,
  BackupListSchema,
  DepartmentsSchema,
  EnvSchema,
  MeSchema,
  SystemDataSchema,
  UsersDirectorySchema,
} from './schemas';

const json = (path: string, init?: RequestInit) =>
  fetch(path, init).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('@contract MSW handlers honour the response schemas', () => {
  it('GET /api/auth/me', async () => {
    const { body } = await json('/api/auth/me');
    MeSchema.parse(body);
  });

  it('GET /api/auth/users', async () => {
    const { body } = await json('/api/auth/users');
    UsersDirectorySchema.parse(body);
  });

  it('GET /api/auth/departments', async () => {
    const { body } = await json('/api/auth/departments');
    DepartmentsSchema.parse(body);
  });

  it('POST /api/auth/login (success)', async () => {
    const { body } = await json('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'mgr', password: 'x' }),
    });
    AuthOkSchema.parse(body);
  });

  it('GET /api/state', async () => {
    const { body } = await json('/api/state');
    SystemDataSchema.parse(body);
  });

  it('POST /api/state (echo)', async () => {
    const seed = (await json('/api/state')).body;
    const { body } = await json('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...seed, tasks: [] }),
    });
    SystemDataSchema.parse(body);
  });

  it('GET /api/env', async () => {
    const { body } = await json('/api/env');
    EnvSchema.parse(body);
  });

  it('POST /api/notifications/:id/acknowledge', async () => {
    const { body } = await json('/api/notifications/n1/acknowledge', { method: 'POST' });
    AcknowledgeSchema.parse(body);
  });

  it('GET /api/audit-log', async () => {
    const { body } = await json('/api/audit-log');
    AuditLogResponseSchema.parse(body);
  });

  it('GET /api/backups', async () => {
    const { body } = await json('/api/backups');
    BackupListSchema.parse(body);
  });

  it('POST /api/backups/create', async () => {
    const { body } = await json('/api/backups/create', { method: 'POST' });
    BackupCreateSchema.parse(body);
  });
});
