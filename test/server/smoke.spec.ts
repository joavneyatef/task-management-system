import { beforeEach, describe, expect, it } from 'vitest';
import { api, loginAs, seedOrg } from './support';

/**
 * Phase 0 smoke: proves the Express app mounts without binding a port, the
 * disposable Prisma database builds and resets, and cookie-session login works.
 * Real route coverage starts in Phase 4.
 */
describe('server harness smoke', () => {
  it('serves a public route from the test database', async () => {
    await seedOrg();
    const res = await api().get('/api/auth/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(4);
  });

  it('guards /api/state behind auth', async () => {
    const res = await api().get('/api/state');
    expect(res.status).toBe(401);
  });

  it('authenticates via the session cookie', async () => {
    await seedOrg();
    const gm = await loginAs('gm');
    const res = await gm.get('/api/state');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('truncates between tests (afterEach reset works)', async () => {
    const res = await api().get('/api/auth/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(0);
  });
});
