/**
 * Phase 7 — security sweep.
 *
 * Session integrity, credential non-disclosure, header-spoofing resistance, and
 * the broken-access-control fix on the backups / env / deploy surface.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { api, jsonOrg, loginAs, seedOrg, TEST_PASSWORD, writeJsonState } from './support';

beforeEach(async () => {
  await seedOrg();
  writeJsonState({ users: jsonOrg() });
});

async function freshCookie(identifier = 'gm'): Promise<string> {
  const res = await api().post('/api/auth/login').send({ identifier, password: TEST_PASSWORD });
  const raw = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('hotel_session='))!;
  return decodeURIComponent(raw.split(';')[0].split('=')[1]);
}

describe('session cookie hardening', () => {
  it('is HttpOnly, SameSite=Lax, root-scoped and time-boxed', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'gm', password: TEST_PASSWORD });
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('hotel_session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/(;|$)/);
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('accepts a pristine session token', async () => {
    const token = await freshCookie('gm');
    const res = await api().get('/api/auth/me').set('Cookie', `hotel_session=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
  });

  it('rejects a session token whose HMAC has been altered by one character', async () => {
    const token = await freshCookie('gm');
    const flipped = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
    const res = await api().get('/api/auth/me').set('Cookie', `hotel_session=${encodeURIComponent(flipped)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token whose payload (user id) has been swapped', async () => {
    const token = await freshCookie('asst');
    const forged = token.replace(/^asst\./, 'gm.'); // keep the old signature
    const res = await api().get('/api/auth/me').set('Cookie', `hotel_session=${encodeURIComponent(forged)}`);
    expect(res.status).toBe(401);
  });

  it('logout expires the session cookie', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/auth/logout');
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).join(';');
    expect(cookie).toMatch(/hotel_session=;/);
    expect(cookie).toMatch(/Max-Age=0/);
  });

  it('a token copied before logout stops working after logout', async () => {
    const token = await freshCookie('gm');
    const cookie = `hotel_session=${encodeURIComponent(token)}`;
    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

    await api().post('/api/auth/logout').set('Cookie', cookie);

    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('the x-user-id header cannot escalate privilege', () => {
  it('an assistant session + x-user-id: gm is still forbidden on a GM route', async () => {
    const asst = await loginAs('asst');
    const res = await asst.get('/api/reports/performance').set('x-user-id', 'gm');
    expect(res.status).toBe(403);
  });

  it('an assistant session + x-user-id: gm is still forbidden on a delete route', async () => {
    const asst = await loginAs('asst');
    const res = await asst.delete('/api/users/mgr').set('x-user-id', 'gm');
    expect(res.status).toBe(403);
  });

  it('no session + x-user-id: gm is unauthenticated, not authorised', async () => {
    const res = await api().get('/api/state').set('x-user-id', 'gm');
    expect(res.status).toBe(401);
  });
});

describe('credential fields never cross the wire', () => {
  const leak = /scrypt\$|"password"\s*:|"pin"\s*:/;

  it('GET /api/state', async () => {
    const gm = await loginAs('gm');
    expect(JSON.stringify((await gm.get('/api/state')).body)).not.toMatch(leak);
  });

  it('GET /api/auth/users (public directory)', async () => {
    expect(JSON.stringify((await api().get('/api/auth/users')).body)).not.toMatch(leak);
  });

  it('GET /api/auth/me', async () => {
    const gm = await loginAs('gm');
    expect(JSON.stringify((await gm.get('/api/auth/me')).body)).not.toMatch(leak);
  });

  it('POST /api/auth/login', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'gm', password: TEST_PASSWORD });
    expect(JSON.stringify(res.body)).not.toMatch(leak);
  });
});

describe('broken access control — backups / env / deploy are management-only', () => {
  const ROUTES = [
    ['get', '/api/backups'],
    ['post', '/api/backups/create'],
    ['get', '/api/backups/anything.json/download'],
    ['post', '/api/backups/upload'],
    ['post', '/api/backups/restore'],
    ['post', '/api/backups/restore-test'],
    ['post', '/api/deploy'],
    ['post', '/api/env'],
  ] as const;

  it.each(ROUTES)('%s %s → 401 without a session', async (method, path) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (api() as any)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)('%s %s → 403 for an authenticated assistant', async (method, path) => {
    const asst = await loginAs('asst');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (asst as any)[method](path).send({});
    expect(res.status).toBe(403);
  });

  it.each(ROUTES)('%s %s → not 403 for a manager', async (method, path) => {
    const mgr = await loginAs('mgr');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (mgr as any)[method](path).send({});
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('backup download cannot escape the backups directory', () => {
  it('a traversal filename resolves to its basename and 404s', async () => {
    const mgr = await loginAs('mgr');
    const res = await mgr.get('/api/backups/' + encodeURIComponent('../../data.json') + '/download');
    expect(res.status).toBe(404);
  });
});

describe('malformed input is rejected, not fatal', () => {
  it('a broken JSON body is a 400', async () => {
    const res = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "identifier": "gm", ');
    expect(res.status).toBe(400);
  });

  it('the server keeps serving after a malformed request', async () => {
    await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    const ok = await api().get('/api/auth/users');
    expect(ok.status).toBe(200);
  });
});
