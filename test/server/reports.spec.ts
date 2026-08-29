import { beforeEach, describe, expect, it } from 'vitest';
import { jsonOrg, loginAs, seedOrg, writeJsonState } from './support';

const dept = { id: 'dept-it', name: 'IT Department', managerIds: ['mgr'], isActive: true };

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Rack audit',
  description: '',
  priority: 'Medium',
  status: 'Completed',
  assigneeId: 'asst',
  assigneeIds: ['asst'],
  createdBy: 'mgr',
  departmentId: 'dept-it',
  deadline: new Date('2026-08-30T00:00:00Z').toISOString(),
  createdAt: new Date('2026-08-20T09:00:00Z').toISOString(),
  updatedAt: new Date('2026-08-21T10:00:00Z').toISOString(),
  completedAt: new Date('2026-08-21T10:00:00Z').toISOString(),
  actualDurationSec: 3600,
  notes: [],
  attachments: [],
  version: 1,
  history: [],
  ...over,
});

beforeEach(seedOrg);

describe('GET /api/reports/completed-tasks', () => {
  it('returns a JSON envelope with generatedAt, count, and rows', async () => {
    writeJsonState({ users: jsonOrg(), departments: [dept], tasks: [task(), task({ id: 't2', status: 'Open' })] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/completed-tasks');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 2 });
    expect(res.body.generatedAt).toBeTruthy();
    expect(res.body.rows[0]).toMatchObject({ id: 't1', assignee: 'ASST', durationMinutes: 60 });
  });

  it('filters by status and departmentId', async () => {
    writeJsonState({
      users: jsonOrg(),
      departments: [dept],
      tasks: [task({ id: 'done', status: 'Completed' }), task({ id: 'open', status: 'Open' }), task({ id: 'other', departmentId: 'dept-fnb' })],
    });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/completed-tasks?status=Completed&departmentId=dept-it');
    expect(res.body.rows.map((r: { id: string }) => r.id)).toEqual(['done']); // 'open' wrong status, 'other' wrong dept
  });

  it('filters by createdAt date range', async () => {
    writeJsonState({
      users: jsonOrg(),
      departments: [dept],
      tasks: [
        task({ id: 'in', createdAt: '2026-08-20T09:00:00Z' }),
        task({ id: 'before', createdAt: '2026-07-01T09:00:00Z' }),
      ],
    });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/completed-tasks?startDate=2026-08-01T00:00:00Z');
    expect(res.body.rows.map((r: { id: string }) => r.id)).toEqual(['in']);
  });

  it('emits a UTF-8 CSV attachment with a BOM and a header row for format=csv', async () => {
    writeJsonState({ users: jsonOrg(), departments: [dept], tasks: [task()] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/completed-tasks?format=csv');
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=".*\.csv"/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(res.text).toMatch(/Task ID,Title,Department/);
    expect(res.text).toMatch(/t1,Rack audit,IT Department/);
  });
});

describe('GET /api/reports/performance', () => {
  it('returns an aggregated JSON report for the GM', async () => {
    writeJsonState({ users: jsonOrg(), departments: [dept], tasks: [task()], complaints: [] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/reports/performance');
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });
});

describe('GET /api/audit-log', () => {
  const taskWithHistory = task({
    id: 'th1',
    title: 'Cabling',
    history: [
      { id: 'h1', type: 'create', userId: 'mgr', userName: 'MGR', timestamp: '2026-08-20T09:00:00Z', details: 'created' },
      { id: 'h2', type: 'complete', userId: 'asst', userName: 'ASST', timestamp: '2026-08-21T10:00:00Z', details: 'done' },
    ],
  });

  it('aggregates task/complaint/checklist history into audit rows', async () => {
    writeJsonState({ users: jsonOrg(), departments: [dept], tasks: [taskWithHistory], complaints: [], checklistHistory: [] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/audit-log');
    expect(res.status).toBe(200);
    const actions = res.body.rows.filter((r: { entityId: string }) => r.entityId === 'th1').map((r: { action: string }) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'complete']));
  });

  it('honours the entityType filter', async () => {
    writeJsonState({ users: jsonOrg(), departments: [dept], tasks: [taskWithHistory], complaints: [], checklistHistory: [] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/audit-log?entityType=Complaint');
    expect(res.body.rows.every((r: { entityType: string }) => r.entityType === 'Complaint')).toBe(true);
  });

  it('can render CSV', async () => {
    writeJsonState({ users: jsonOrg(), departments: [dept], tasks: [taskWithHistory], complaints: [], checklistHistory: [] });
    const gm = await loginAs('gm');
    const res = await gm.get('/api/audit-log?format=csv');
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });
});
