import { beforeEach, describe, expect, it } from 'vitest';
import { api, jsonOrg, loginAs, prisma, seedOrg, writeJsonState } from './support';

const DAY = 86_400_000;

/** Create a task row in the Prisma store (the DELETE handler's source of truth). */
const seedDbTask = (id: string, over: Record<string, unknown> = {}) =>
  prisma.task.create({
    data: {
      id, title: `task ${id}`, description: '', priority: 'Medium', status: 'Open',
      deadline: new Date(Date.now() + DAY), creatorId: 'mgr', assignedBy: 'mgr',
      assigneeId: 'asst', assigneeIds: JSON.stringify(['asst']), departmentId: 'dept-it',
      version: 1, notes: JSON.stringify([]), ...over,
    },
  });
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Rack audit',
  description: '',
  priority: 'Medium',
  status: 'Open',
  assigneeId: 'asst',
  assigneeIds: ['asst'],
  createdBy: 'mgr',
  assignedBy: 'mgr',
  departmentId: 'dept-it',
  deadline: new Date(Date.now() + DAY).toISOString(),
  createdAt: new Date().toISOString(),
  notes: [],
  attachments: [],
  version: 1,
  ...over,
});

beforeEach(seedOrg);

describe('POST /api/tasks/:id/switch', () => {
  it('401s without a session', async () => {
    writeJsonState({ users: jsonOrg(), tasks: [task()] });
    expect((await api().post('/api/tasks/t1/switch').send({ targetUserId: 'asst' })).status).toBe(401);
  });

  it('404s for an unknown task or target', async () => {
    writeJsonState({ users: jsonOrg(), tasks: [task()] });
    const gm = await loginAs('gm');
    expect((await gm.post('/api/tasks/ghost/switch').send({ targetUserId: 'asst' })).status).toBe(404);
    expect((await gm.post('/api/tasks/t1/switch').send({ targetUserId: 'ghost' })).status).toBe(404);
  });

  it('400s when the target is unavailable (On Leave)', async () => {
    const users = jsonOrg().map((u) => (u.id === 'asst' ? { ...u, status: 'On Leave' } : u));
    writeJsonState({ users, tasks: [task()] });
    const gm = await loginAs('gm');
    const res = await gm.post('/api/tasks/t1/switch').send({ targetUserId: 'asst' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TARGET_UNAVAILABLE');
  });

  it('403s a Manager switching to someone outside their team', async () => {
    // 'dir' is not a Manager's assistant report
    writeJsonState({ users: jsonOrg(), tasks: [task()] });
    const mgr = await loginAs('mgr');
    const res = await mgr.post('/api/tasks/t1/switch').send({ targetUserId: 'dir' });
    expect(res.status).toBe(403);
  });

  it('lets the GM switch a task to any available user', async () => {
    writeJsonState({ users: jsonOrg(), tasks: [task({ assigneeId: 'mgr', assigneeIds: ['mgr'] })] });
    const gm = await loginAs('gm');
    const res = await gm.post('/api/tasks/t1/switch').send({ targetUserId: 'asst' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/notifications/:id/acknowledge', () => {
  const notif = (over = {}) => ({
    id: 'n1', title: 'x', message: 'y', category: 'Task', createdAt: new Date().toISOString(),
    isRead: false, recipientUserId: 'asst', channels: { inApp: true, telegram: false, email: false }, ...over,
  });

  it('404s for an unknown notification', async () => {
    writeJsonState({ users: jsonOrg(), notifications: [] });
    const asst = await loginAs('asst');
    expect((await asst.post('/api/notifications/ghost/acknowledge')).status).toBe(404);
  });

  it('403s acknowledging a notification addressed to someone else', async () => {
    writeJsonState({ users: jsonOrg(), notifications: [notif({ recipientUserId: 'mgr' })] });
    const asst = await loginAs('asst');
    expect((await asst.post('/api/notifications/n1/acknowledge')).status).toBe(403);
  });

  it('stamps acknowledgedAt / acknowledgedBy for the rightful recipient', async () => {
    writeJsonState({ users: jsonOrg(), notifications: [notif()] });
    const asst = await loginAs('asst');
    const res = await asst.post('/api/notifications/n1/acknowledge');
    expect(res.status).toBe(200);
    expect(res.body.notification.acknowledgedAt).toBeTruthy();
    expect(res.body.notification.acknowledgedBy).toBe('asst');
  });
});

describe('DELETE /api/tasks/:id (happy path + 404)', () => {
  it('404s for a task that is not in the store', async () => {
    const gm = await loginAs('gm');
    expect((await gm.delete('/api/tasks/ghost')).status).toBe(404);
  });

  it('removes the task and returns the trimmed state', async () => {
    await seedDbTask('keep');
    await seedDbTask('gone');
    const mgr = await loginAs('mgr');
    const res = await mgr.delete('/api/tasks/gone');
    expect(res.status).toBe(200);
    expect(res.body.state.tasks.map((t: { id: string }) => t.id)).toEqual(['keep']);
  });

  it('the deleted task stays gone even when the client keeps echoing a stale snapshot', async () => {
    // Regression: DELETE only filtered the JSON mirror, leaving the row in
    // Prisma, so GET /api/state returned it. And even after the Prisma fix, the
    // live client re-POSTs its whole task list from refs on many triggers; a
    // snapshot captured just before the delete still carries the row and
    // mergeStateWithServer re-creates it as "new" (version 1). The task flashed
    // away and came back. A short server-side tombstone closes the race.
    await seedDbTask('keep');
    await seedDbTask('gone');
    const gm = await loginAs('gm');

    // Grab the FULL snapshot *before* deleting — this is what a racing sync holds.
    const staleSnapshot = (await gm.get('/api/state')).body;
    expect(staleSnapshot.tasks.map((t: { id: string }) => t.id).sort()).toEqual(['gone', 'keep']);

    expect((await gm.delete('/api/tasks/gone')).status).toBe(200);
    expect((await gm.get('/api/state')).body.tasks.map((t: { id: string }) => t.id)).toEqual(['keep']);

    // The stale client now POSTs its pre-delete snapshot (still contains 'gone').
    const res = await gm.post('/api/state').send(staleSnapshot);
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toEqual(['keep']);

    // ...and again, a few times, like the real burst.
    await gm.post('/api/state').send(staleSnapshot);
    await gm.post('/api/state').send(staleSnapshot);

    expect((await gm.get('/api/state')).body.tasks.map((t: { id: string }) => t.id)).toEqual(['keep']);
    expect(await prisma.task.count()).toBe(1);
  });
});

describe('DELETE /api/complaints/:id (happy path + 404)', () => {
  const complaint = (id: string) => ({
    id, title: `Complaint ${id}`, description: '', source: 'Exclusivi', departmentId: 'dept-it',
    assignedToId: null, createdBy: 'exclusivi-integration', status: 'Open', priority: 'Medium',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, history: [],
  });

  it('404s for an unknown complaint', async () => {
    writeJsonState({ users: jsonOrg(), complaints: [] });
    const dir = await loginAs('dir');
    expect((await dir.delete('/api/complaints/ghost')).status).toBe(404);
  });

  it('removes the complaint and returns the trimmed state', async () => {
    writeJsonState({ users: jsonOrg(), complaints: [complaint('keep'), complaint('gone')] });
    const dir = await loginAs('dir');
    const res = await dir.delete('/api/complaints/gone');
    expect(res.status).toBe(200);
    expect(res.body.state.complaints.map((c: { id: string }) => c.id)).toEqual(['keep']);
  });
});

describe('DELETE /api/users/:id (GM only, happy path + 404)', () => {
  it('404s for an unknown user', async () => {
    writeJsonState({ users: jsonOrg() });
    const gm = await loginAs('gm');
    expect((await gm.delete('/api/users/ghost')).status).toBe(404);
  });

  it('removes the user from the roster', async () => {
    writeJsonState({ users: jsonOrg() });
    const gm = await loginAs('gm');
    const res = await gm.delete('/api/users/asst');
    expect(res.status).toBe(200);
    expect(res.body.state.users.map((u: { id: string }) => u.id)).not.toContain('asst');
  });
});
