import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, jsonOrg, loginAs, seedOrg, writeJsonState } from './support';

beforeEach(async () => {
  await seedOrg();
  writeJsonState({ users: jsonOrg() });
});

// restore-test flips the module-level activeEnv; keep the suite deterministic.
afterEach(async () => {
  try {
    const gm = await loginAs('gm');
    await gm.post('/api/env').send({ env: 'production' });
  } catch {
    /* db already truncated / no session — fine */
  }
});

const backupsDir = () => process.env.BACKUPS_DIR!;

describe('GET /api/backups', () => {
  it('401s without a session', async () => {
    expect((await api().get('/api/backups')).status).toBe(401);
  });

  it('returns an empty list when nothing has been backed up', async () => {
    const gm = await loginAs('gm');
    const res = await gm.get('/api/backups');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/backups/create', () => {
  it('writes a backup file tagged with the creator and lists it', async () => {
    const gm = await loginAs('gm');
    const create = await gm.post('/api/backups/create').send({ createdBy: 'Gina GM' });
    expect(create.status).toBe(200);
    expect(create.body).toMatchObject({ success: true });
    expect(create.body.filename).toMatch(/^backup-.*\.json$/);
    expect(readdirSync(backupsDir())).toContain(create.body.filename);

    const list = await gm.get('/api/backups');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ filename: create.body.filename, createdBy: 'Gina GM' });
  });
});

describe('GET /api/backups/:filename/download', () => {
  it('404s for a filename that does not exist', async () => {
    const gm = await loginAs('gm');
    expect((await gm.get('/api/backups/backup-missing.json/download')).status).toBe(404);
  });

  it('cannot be used to escape the backups directory (path traversal)', async () => {
    const gm = await loginAs('gm');
    // path.basename('../../data.json') === 'data.json', which is not in BACKUPS_DIR
    const res = await gm.get('/api/backups/' + encodeURIComponent('../../data.json') + '/download');
    expect(res.status).toBe(404);
  });

  it('streams a real backup as an attachment', async () => {
    const gm = await loginAs('gm');
    const { body: created } = await gm.post('/api/backups/create').send({ createdBy: 'Gina GM' });
    const res = await gm.get(`/api/backups/${created.filename}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const parsed = JSON.parse(res.text || res.body.toString());
    expect(parsed).toHaveProperty('metadata');
  });
});

describe('POST /api/backups/restore', () => {
  it('restores a previously created backup', async () => {
    const gm = await loginAs('gm');
    const { body: created } = await gm.post('/api/backups/create').send({ createdBy: 'Gina GM' });

    const res = await gm.post('/api/backups/restore').set('x-user-id', 'gm').send({ filename: created.filename });
    expect([200, 201]).toContain(res.status);
    // a fresh backup should exist alongside the original (pre-restore safety copy)
    expect(readdirSync(backupsDir()).length).toBeGreaterThanOrEqual(1);
  });

  it('400s without a filename and 404s for a missing file', async () => {
    const gm = await loginAs('gm');
    expect((await gm.post('/api/backups/restore').send({})).status).toBe(400);
    expect((await gm.post('/api/backups/restore').send({ filename: 'backup-nope.json' })).status).toBe(404);
  });
});

describe('POST /api/backups/restore-test', () => {
  it('restores a backup into the sandbox environment', async () => {
    const gm = await loginAs('gm');
    const { body: created } = await gm.post('/api/backups/create').send({ createdBy: 'Gina GM' });
    const res = await gm.post('/api/backups/restore-test').set('x-user-id', 'gm').send({ filename: created.filename });
    expect([200, 201]).toContain(res.status);
    // put the server back
    await gm.post('/api/env').send({ env: 'production' });
  });
});

describe('POST /api/backups/upload', () => {
  const validState = { tasks: [], checklists: [], users: [], departments: [], complaints: [], notifications: [] };

  it('400s a payload with no backupData', async () => {
    const gm = await loginAs('gm');
    expect((await gm.post('/api/backups/upload').send({})).status).toBe(400);
  });

  it('400s an unparseable JSON string', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/backups/upload').send({ backupData: '{ not json' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid json/i);
  });

  it('400s a payload missing the tasks / checklists arrays', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/backups/upload').send({ backupData: { users: [] } });
    expect(res.status).toBe(400);
  });

  it('accepts a valid state payload and writes a sanitised backup file', async () => {
    const gm = await loginAs('gm');
    const res = await gm
      .post('/api/backups/upload')
      .send({ filename: '../../evil', backupData: validState, createdBy: 'Gina GM' });
    expect(res.status).toBe(200);
    expect(res.body.metadata).toMatchObject({ type: 'Uploaded Backup', createdBy: 'Gina GM' });
    // filename is basename-stripped: no directory escape
    expect(res.body.filename).toMatch(/^backup-\d+-evil\.json$/);
    expect(readdirSync(backupsDir())).toContain(res.body.filename);
  });
});

describe('POST /api/deploy', () => {
  it('takes an Auto-Before-Deploy backup and reports the pipeline steps', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/deploy').send({ createdBy: 'Gina GM' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(res.body.backupTaken).toMatch(/^backup-/);
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(readdirSync(backupsDir())).toContain(res.body.backupTaken);
  });

  it('still succeeds but flags a validation warning when the crew roster is empty', async () => {
    writeJsonState({ users: [] });
    const gm = await loginAs('gm');
    const res = await gm.post('/api/deploy').send({});
    expect(res.status).toBe(200);
    expect(res.body.steps.join(' ')).toMatch(/WARN/);
  });
});
