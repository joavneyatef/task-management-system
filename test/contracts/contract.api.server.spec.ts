/**
 * Phase 5 — contract tests, server side.
 *
 * For every endpoint the browser parses into typed state, hit the real
 * Express + Prisma app and assert the response body satisfies the shared
 * contract schema. A green run here means the server keeps its half of the
 * bargain; contract.msw.web.spec.ts proves the mocks keep the other half.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { api, jsonOrg, loginAs, seedOrg, writeJsonState } from '../server/support';
import {
  AcknowledgeSchema,
  AuditLogResponseSchema,
  AuthOkSchema,
  BackupCreateSchema,
  BackupListSchema,
  BackupUploadSchema,
  DepartmentsSchema,
  EnvSchema,
  ErrorBodySchema,
  MeSchema,
  ReportEnvelopeSchema,
  StateMutationSchema,
  SystemDataSchema,
  TaskSwitchSchema,
  UsersDirectorySchema,
} from './schemas';

const DAY = 86_400_000;
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', title: 'Rack audit', description: '', priority: 'Medium', status: 'Open',
  assigneeId: 'asst', assigneeIds: ['asst'], createdBy: 'mgr', assignedBy: 'mgr',
  departmentId: 'dept-it', deadline: new Date(Date.now() + DAY).toISOString(),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  notes: [], attachments: [], version: 1, history: [], ...over,
});
const complaint = (over: Record<string, unknown> = {}) => ({
  id: 'c1', title: 'AC broken', description: 'room 12', source: 'Exclusivi', departmentId: 'dept-it',
  assignedToId: null, createdBy: 'exclusivi-integration', status: 'Open', priority: 'High',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, history: [],
  ...over,
});
const notif = (over: Record<string, unknown> = {}) => ({
  id: 'n1', title: 'Assigned', message: 'you have a task', category: 'Task',
  createdAt: new Date().toISOString(), isRead: false, recipientUserId: 'asst',
  channels: { inApp: true, telegram: false, email: false }, ...over,
});

beforeEach(seedOrg);

describe('@contract public auth surface', () => {
  it('GET /api/auth/users → { users, departments }, no credentials', async () => {
    const res = await api().get('/api/auth/users');
    expect(res.status).toBe(200);
    UsersDirectorySchema.parse(res.body);
  });

  it('GET /api/auth/departments → { departments }', async () => {
    const res = await api().get('/api/auth/departments');
    expect(res.status).toBe(200);
    DepartmentsSchema.parse(res.body);
  });

  it('POST /api/auth/login success → { success, user }', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'gm', password: 'Passw0rd!' });
    expect(res.status).toBe(200);
    AuthOkSchema.parse(res.body);
  });

  it('POST /api/auth/login failure → { error, message }', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'gm', password: 'wrong' });
    expect(res.status).toBe(401);
    ErrorBodySchema.parse(res.body);
  });

  it('POST /api/auth/signup success → { success, user }', async () => {
    const res = await api().post('/api/auth/signup').send({
      name: 'New Hire', email: 'nh@hotel.test', password: 'Str0ngPass1',
      role: 'Assistant', departmentId: 'dept-it', parentId: 'mgr',
    });
    expect(res.status).toBe(201);
    AuthOkSchema.parse(res.body);
  });
});

describe('@contract authenticated session surface', () => {
  it('GET /api/auth/me → { user }', async () => {
    const gm = await loginAs('gm');
    const res = await gm.get('/api/auth/me');
    expect(res.status).toBe(200);
    MeSchema.parse(res.body);
  });

  it('PUT /api/auth/profile → { success, user }', async () => {
    const asst = await loginAs('asst');
    const res = await asst.put('/api/auth/profile').send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    AuthOkSchema.parse(res.body);
  });
});

describe('@contract state sync', () => {
  it('GET /api/state → SystemData', async () => {
    const gm = await loginAs('gm');
    const res = await gm.get('/api/state');
    expect(res.status).toBe(200);
    SystemDataSchema.parse(res.body);
  });

  it('POST /api/state echoes an accepted SystemData', async () => {
    const gm = await loginAs('gm');
    const snap = (await gm.get('/api/state')).body;
    const res = await gm.post('/api/state').send({ ...snap, tasks: [] });
    expect(res.status).toBe(200);
    SystemDataSchema.parse(res.body);
  });
});

describe('@contract task + notification mutations', () => {
  it('POST /api/tasks/:id/switch → { task }', async () => {
    writeJsonState({ users: jsonOrg(), tasks: [task({ assigneeId: 'mgr', assigneeIds: ['mgr'] })] });
    const gm = await loginAs('gm');
    const res = await gm.post('/api/tasks/t1/switch').send({ targetUserId: 'asst' });
    expect(res.status).toBe(200);
    TaskSwitchSchema.parse(res.body);
  });

  it('POST /api/notifications/:id/acknowledge → { notification }', async () => {
    writeJsonState({ users: jsonOrg(), notifications: [notif()] });
    const asst = await loginAs('asst');
    const res = await asst.post('/api/notifications/n1/acknowledge');
    expect(res.status).toBe(200);
    AcknowledgeSchema.parse(res.body);
  });

  it('DELETE /api/tasks/:id → { success, state }', async () => {
    writeJsonState({ users: jsonOrg(), tasks: [task()] });
    const gm = await loginAs('gm');
    const res = await gm.delete('/api/tasks/t1');
    expect(res.status).toBe(200);
    StateMutationSchema.parse(res.body);
  });

  it('DELETE /api/complaints/:id → { success, state }', async () => {
    writeJsonState({ users: jsonOrg(), complaints: [complaint()] });
    const dir = await loginAs('dir');
    const res = await dir.delete('/api/complaints/c1');
    expect(res.status).toBe(200);
    StateMutationSchema.parse(res.body);
  });

  it('DELETE /api/users/:id → { success, state }', async () => {
    writeJsonState({ users: jsonOrg() });
    const gm = await loginAs('gm');
    const res = await gm.delete('/api/users/asst');
    expect(res.status).toBe(200);
    StateMutationSchema.parse(res.body);
  });
});

describe('@contract reports + ops', () => {
  it('GET /api/audit-log → { rows }', async () => {
    writeJsonState({
      users: jsonOrg(),
      tasks: [task({ history: [{ id: 'h1', type: 'create', userId: 'mgr', userName: 'Max Manager', timestamp: new Date().toISOString() }] })],
    });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/audit-log');
    expect(res.status).toBe(200);
    AuditLogResponseSchema.parse(res.body);
  });

  it('GET /api/reports/completed-tasks → report envelope', async () => {
    writeJsonState({
      users: jsonOrg(),
      tasks: [task({ status: 'Completed', completedAt: new Date().toISOString(), startedAt: new Date(Date.now() - DAY).toISOString() })],
    });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/completed-tasks');
    expect(res.status).toBe(200);
    ReportEnvelopeSchema.parse(res.body);
  });

  it('GET /api/reports/performance → report envelope', async () => {
    writeJsonState({ users: jsonOrg(), tasks: [task()] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/performance');
    expect(res.status).toBe(200);
    ReportEnvelopeSchema.parse(res.body);
  });

  it('GET /api/env → { env }', async () => {
    const gm = await loginAs('gm');
    const res = await gm.get('/api/env');
    expect(res.status).toBe(200);
    EnvSchema.parse(res.body);
  });
});

describe('@contract backups', () => {
  it('GET /api/backups → BackupMeta[]', async () => {
    const gm = await loginAs('gm');
    await gm.post('/api/backups/create').send({ createdBy: 'Gina GM' });
    const res = await gm.get('/api/backups');
    expect(res.status).toBe(200);
    BackupListSchema.parse(res.body);
  });

  it('POST /api/backups/create → { filename }', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/backups/create').send({ createdBy: 'Gina GM' });
    expect(res.status).toBe(200);
    BackupCreateSchema.parse(res.body);
  });

  it('POST /api/backups/upload → { filename, metadata }', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/backups/upload').send({
      filename: 'snap.json', createdBy: 'Gina GM',
      backupData: { tasks: [], checklists: [], users: [], departments: [], complaints: [], notifications: [] },
    });
    expect(res.status).toBe(200);
    BackupUploadSchema.parse(res.body);
  });
});
