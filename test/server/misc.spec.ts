import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, jsonOrg, loginAs, seedOrg, writeJsonState } from './support';

beforeEach(async () => {
  await seedOrg();
  writeJsonState({
    users: jsonOrg(),
    departments: [{ id: 'dept-it', name: 'IT Department', managerIds: ['mgr'], isActive: true }],
  });
});

describe('GET/POST /api/env', () => {
  // The route mutates a module-level `activeEnv`; keep the suite deterministic.
  afterEach(async () => {
    const gm = await loginAs('gm');
    await gm.post('/api/env').send({ env: 'production' });
  });

  it('401s without a session', async () => {
    expect((await api().get('/api/env')).status).toBe(401);
  });

  it('reports the current environment', async () => {
    const gm = await loginAs('gm');
    const res = await gm.get('/api/env');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ env: 'production' });
  });

  it('400s an invalid environment name', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/env').send({ env: 'staging' });
    expect(res.status).toBe(400);
  });

  it('toggles to the test sandbox and back', async () => {
    const gm = await loginAs('gm');
    expect((await gm.post('/api/env').send({ env: 'test' })).status).toBe(200);
    expect((await gm.get('/api/env')).body.env).toBe('test');
  });
});

describe('POST /api/chat', () => {
  it('400s when messages is not an array', async () => {
    const gm = await loginAs('gm');
    expect((await gm.post('/api/chat').send({ messages: 'hi' })).status).toBe(400);
    expect((await gm.post('/api/chat').send({})).status).toBe(400);
  });

  it('returns the (mocked) model reply for a valid conversation', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/chat').send({ messages: [{ role: 'user', content: 'status?' }] });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('stub AI reply');
  });
});

describe('POST /api/complaints/ingest', () => {
  const key = process.env.EXCLUSIVI_API_KEY || 'exclusivi-dev-key';

  it('401s a caller without a valid x-exclusivi-key', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/complaints/ingest').send({ title: 't', description: 'd' });
    expect(res.status).toBe(401);
  });

  it('400s when title or description is missing', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/complaints/ingest').set('x-exclusivi-key', key).send({ title: 'only title' });
    expect(res.status).toBe(400);
  });

  it('creates and routes a complaint from a valid external payload', async () => {
    const gm = await loginAs('gm');
    const res = await gm
      .post('/api/complaints/ingest')
      .set('x-exclusivi-key', key)
      .send({ externalId: 'EX-9', title: 'Slow Wi-Fi', description: 'Room 204', priority: 'High' });
    expect([200, 201]).toContain(res.status);
    const created = res.body.complaint ?? res.body;
    expect(created.title).toContain('Slow Wi-Fi');
    expect(created.departmentId).toBe('dept-it');
    expect(created.status).toBe('Open');
  });

  it('accepts an external caller with the key and no user session (the Exclusivi webhook)', async () => {
    const res = await api()
      .post('/api/complaints/ingest')
      .set('x-exclusivi-key', key)
      .send({ title: 'No session here', description: 'posted straight from Exclusivi' });
    expect(res.status).toBe(201);
    expect((res.body.complaint ?? res.body).title).toContain('No session here');
  });

  it('still rejects an external caller with a bad key and no session', async () => {
    const res = await api()
      .post('/api/complaints/ingest')
      .set('x-exclusivi-key', 'wrong')
      .send({ title: 't', description: 'd' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/exclusivi/feedback', () => {
  it('401s without a session', async () => {
    expect((await api().get('/api/exclusivi/feedback')).status).toBe(401);
  });
});
