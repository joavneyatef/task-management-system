/**
 * Phase 7 — resilience.
 *
 * The server must degrade to a 4xx (or a sane fallback), never a 500 or a hung
 * socket, when it is handed bad input or finds its legacy JSON store corrupt.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, jsonOrg, loginAs, seedOrg, writeJsonState } from './support';

beforeEach(async () => {
  await seedOrg();
  writeJsonState({ users: jsonOrg() });
});

describe('bad request bodies', () => {
  it('POST /api/state with an empty object is a 400, not a 500', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/state').send({});
    expect(res.status).toBe(400);
  });

  it('a 100k-character task title is accepted without error', async () => {
    const gm = await loginAs('gm');
    const snap = (await gm.get('/api/state')).body;
    const huge = 'x'.repeat(100_000);
    const res = await gm.post('/api/state').send({
      ...snap,
      tasks: [{
        id: 'huge', title: huge, description: '', priority: 'Medium', status: 'Open',
        assigneeId: null, assigneeIds: [], createdBy: 'gm', departmentId: 'dept-it',
        deadline: new Date(Date.now() + 86_400_000).toISOString(), createdAt: new Date().toISOString(),
        notes: [], attachments: [], version: 1,
      }],
    });
    expect(res.status).toBe(200);
    expect(res.body.tasks.find((t: { id: string }) => t.id === 'huge').title).toHaveLength(100_000);
  });

  it('an unknown task id on a mutation is a 404, not a 500', async () => {
    const gm = await loginAs('gm');
    expect((await gm.post('/api/tasks/does-not-exist/switch').send({ targetUserId: 'asst' })).status).toBe(404);
  });
});

describe('the server does not wedge under a burst', () => {
  it('answers 20 concurrent GET /api/state requests', async () => {
    const gm = await loginAs('gm');
    const results = await Promise.all(Array.from({ length: 20 }, () => gm.get('/api/state')));
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});

describe('corrupt legacy JSON store', () => {
  it('a mutation route recovers (falls back to defaults) instead of 500ing', async () => {
    // readState() logs the parse failure before falling back — that's expected.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeFileSync(join(process.env.DATA_DIR!, 'data.json'), '{ this is not : valid json');
    const gm = await loginAs('gm'); // auth is Prisma-backed, unaffected by the bad file
    const res = await gm.post('/api/tasks/whatever/switch').send({ targetUserId: 'asst' });
    expect(res.status).toBe(404);
    // writeState() kicks off a fire-and-forget Prisma sync of the demo fallback
    // data; let its (expected, logged) FK rejection land under the mock.
    await new Promise((r) => setTimeout(r, 250));
    errSpy.mockRestore();
  });
});
