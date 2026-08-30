import { beforeEach, describe, expect, it } from 'vitest';
import type { SystemData } from '../../src/types';
import { api, loginAs, prisma, seedOrg } from './support';

const DAY = 86_400_000;

async function seedTask(over: Record<string, unknown> = {}) {
  return prisma.task.create({
    data: {
      id: 't1',
      title: 'Rack audit',
      description: '',
      priority: 'Medium',
      status: 'Open',
      deadline: new Date(Date.now() + DAY),
      creatorId: 'mgr',
      assignedBy: 'mgr',
      assigneeId: 'asst',
      assigneeIds: JSON.stringify(['asst']),
      departmentId: 'dept-it',
      version: 1,
      notes: JSON.stringify([]),
      ...over,
    },
  });
}

/** Returns the client-shaped state for an authenticated agent. */
const stateOf = async (agent: Awaited<ReturnType<typeof loginAs>>) =>
  (await agent.get('/api/state')).body as SystemData;

const withTaskEdit = (state: SystemData, id: string, patch: Record<string, unknown>): SystemData => ({
  ...state,
  tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

beforeEach(seedOrg);

describe('GET /api/state', () => {
  it('401s without a session', async () => {
    expect((await api().get('/api/state')).status).toBe(401);
  });

  it('returns the system state with no credential material', async () => {
    await seedTask();
    const gm = await loginAs('gm');
    const res = await gm.get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(4);
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toContain('t1');
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt\$/);
  });
});

describe('POST /api/state — validation & auth', () => {
  it('401s without a session', async () => {
    expect((await api().post('/api/state').send({ users: [] })).status).toBe(401);
  });

  it('400s when the payload has no users array', async () => {
    const gm = await loginAs('gm');
    expect((await gm.post('/api/state').send({ tasks: [] })).status).toBe(400);
  });
});

describe('POST /api/state — mutations', () => {
  it('persists a valid task edit made by the GM', async () => {
    await seedTask();
    const gm = await loginAs('gm');
    const snap = await stateOf(gm);

    const res = await gm.post('/api/state').send(withTaskEdit(snap, 't1', { title: 'Rack audit v2' }));
    expect(res.status).toBe(200);

    const after = await stateOf(gm);
    expect(after.tasks.find((t) => t.id === 't1')!.title).toBe('Rack audit v2');
  });

  it('403s an Assistant editing a task that is not theirs', async () => {
    await seedTask({ assigneeId: 'mgr', assigneeIds: JSON.stringify(['mgr']), creatorId: 'mgr' });
    const asst = await loginAs('asst');
    const snap = await stateOf(asst);
    // the assistant can still SEE it via /api/state (server returns full state),
    // but must not be able to mutate it
    const res = await asst.post('/api/state').send(withTaskEdit(snap, 't1', { title: 'sneaky' }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('lets an Assistant edit a task assigned to them', async () => {
    await seedTask({ assigneeId: 'asst', assigneeIds: JSON.stringify(['asst']) });
    const asst = await loginAs('asst');
    const snap = await stateOf(asst);
    const res = await asst.post('/api/state').send(withTaskEdit(snap, 't1', { status: 'In Progress' }));
    expect(res.status).toBe(200);
    expect((await stateOf(asst)).tasks.find((t) => t.id === 't1')!.status).toBe('In Progress');
  });

  it('lets an Assistant progress their task even when the snapshot also carries an untouched task they do not own', async () => {
    // Regression: getSystemState returns tasks with `lastTransferredById: undefined`;
    // JSON.stringify drops that key, so an *unmodified* foreign task used to fail
    // deepEqual and 403 the whole sync in authorizeStateMutation.
    await seedTask({ id: 't1', assigneeId: 'asst', assigneeIds: JSON.stringify(['asst']) });
    await seedTask({ id: 't2', assigneeId: 'mgr', assigneeIds: JSON.stringify(['mgr']), creatorId: 'mgr' });
    const asst = await loginAs('asst');

    let snap = await stateOf(asst);
    let res = await asst.post('/api/state').send(withTaskEdit(snap, 't1', { status: 'In Progress', startedAt: new Date().toISOString() }));
    expect(res.status).toBe(200);

    snap = await stateOf(asst);
    res = await asst.post('/api/state').send(withTaskEdit(snap, 't1', {
      status: 'Completed', completedAt: new Date().toISOString(), completedById: 'asst', actualDurationSec: 1800,
    }));
    expect(res.status).toBe(200);

    // Management sees the completed state + the recorded duration.
    const asMgr = (await (await loginAs('mgr')).get('/api/state')).body as SystemData;
    const done = asMgr.tasks.find((t) => t.id === 't1')!;
    expect(done.status).toBe('Completed');
    expect(done.actualDurationSec).toBe(1800);
    // the foreign task was left untouched
    expect(asMgr.tasks.find((t) => t.id === 't2')!.status).toBe('Open');
  });

  it('lets a Director create a task for an Assistant when the snapshot also holds drifted tasks', async () => {
    await seedTask({ id: 'other', assigneeId: 'mgr', assigneeIds: JSON.stringify(['mgr']), creatorId: 'mgr' });
    const dir = await loginAs('dir');
    const snap = await stateOf(dir);
    const now = new Date().toISOString();
    const created = {
      id: 'dir-made', title: 'From the director', description: '', priority: 'Medium', status: 'Open',
      assigneeId: 'asst', assigneeIds: ['asst'], createdBy: 'dir', assignedBy: 'dir', departmentId: 'dept-it',
      deadline: new Date(Date.now() + DAY).toISOString(), createdAt: now, updatedAt: now,
      notes: [], attachments: [], version: 1, history: [],
    };
    const res = await dir.post('/api/state').send({ ...snap, tasks: [...snap.tasks, created] });
    expect(res.status).toBe(200);

    // the assistant it was assigned to can see it
    const asAsst = (await (await loginAs('asst')).get('/api/state')).body as SystemData;
    expect(asAsst.tasks.some((t) => t.id === 'dir-made')).toBe(true);
  });

  it('round-trips the assigneeIds JSON column as an array', async () => {
    await seedTask({ assigneeIds: JSON.stringify(['asst', 'mgr']), assigneeId: 'asst' });
    const gm = await loginAs('gm');
    const t = (await stateOf(gm)).tasks.find((x) => x.id === 't1')!;
    expect(Array.isArray(t.assigneeIds)).toBe(true);
    expect(t.assigneeIds).toEqual(['asst', 'mgr']);
  });
});

describe('POST /api/state — optimistic concurrency (current behaviour)', () => {
  it('does NOT return 409 on a stale write — the merge silently prefers the server', async () => {
    await seedTask({ version: 1 });
    const gm = await loginAs('gm');
    const stale = await stateOf(gm); // version 1 snapshot

    // first write bumps the server version and content
    await gm.post('/api/state').send(withTaskEdit(stale, 't1', { title: 'server change' }));

    // second write from the now-stale snapshot — server wins, no 409
    const res = await gm.post('/api/state').send(withTaskEdit(stale, 't1', { title: 'stale change' }));
    expect(res.status).toBe(200);
    expect(res.body.tasks.find((t: { id: string }) => t.id === 't1')!.title).toBe('server change');
  });

  it('keeps both edits when two agents change different tasks', async () => {
    await seedTask({ id: 't1', title: 'one' });
    await seedTask({ id: 't2', title: 'two' });
    const gm = await loginAs('gm');
    const mgr = await loginAs('mgr');
    const snap = await stateOf(gm);

    const r1 = await gm.post('/api/state').send(withTaskEdit(snap, 't1', { title: 'one edited' }));
    const snap2 = await stateOf(mgr); // mgr syncs before its own edit (realistic)
    const r2 = await mgr.post('/api/state').send(withTaskEdit(snap2, 't2', { title: 'two edited' }));
    expect([r1.status, r2.status]).toEqual([200, 200]);

    const after = await stateOf(gm);
    expect(after.tasks.find((t) => t.id === 't1')!.title).toBe('one edited');
    expect(after.tasks.find((t) => t.id === 't2')!.title).toBe('two edited');
  });
});
