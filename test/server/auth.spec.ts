import { beforeEach, describe, expect, it } from 'vitest';
import { api, loginAs, prisma, seedOrg, TEST_PASSWORD } from './support';

beforeEach(seedOrg);

describe('GET /api/auth/users (public directory)', () => {
  it('returns users and departments with no credentials', async () => {
    const res = await api().get('/api/auth/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(4);
    expect(res.body.departments.map((d: { id: string }) => d.id)).toContain('dept-it');
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('password');
      expect(u).not.toHaveProperty('pin');
    }
  });
});

describe('GET /api/auth/departments', () => {
  it('lists active departments', async () => {
    const res = await api().get('/api/auth/departments');
    expect(res.status).toBe(200);
    expect(res.body.departments.map((d: { id: string }) => d.id)).toContain('dept-it');
  });
});

describe('POST /api/auth/login', () => {
  it('400s when identifier or password is missing', async () => {
    expect((await api().post('/api/auth/login').send({ identifier: 'gm' })).status).toBe(400);
    expect((await api().post('/api/auth/login').send({ password: 'x' })).status).toBe(400);
  });

  it('401s on a wrong password', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'gm', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('401s for an unknown identifier', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'nobody@nowhere', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('403s an Off Duty account with ACCOUNT_DISABLED', async () => {
    await prisma.user.update({ where: { id: 'asst' }, data: { status: 'Off Duty' } });
    const res = await api().post('/api/auth/login').send({ identifier: 'asst', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ACCOUNT_DISABLED');
  });

  it('sets an HttpOnly session cookie and returns a sanitized user on success', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'gm', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, user: { id: 'gm' } });
    expect(res.body.user).not.toHaveProperty('password');
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).join(';');
    expect(cookie).toMatch(/hotel_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it.each([
    ['id', 'gm'],
    ['email (mixed case)', 'GM@Hotel.TEST'],
    ['username', 'gm'],
    ['name', 'GM'],
  ])('accepts login by %s', async (_label, identifier) => {
    const res = await api().post('/api/auth/login').send({ identifier, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/auth/me & logout', () => {
  it('401s without a session cookie', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
  });

  it('returns the acting user for a valid session', async () => {
    const gm = await loginAs('gm');
    const res = await gm.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'gm' });
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('logout clears the session cookie', async () => {
    const gm = await loginAs('gm');
    const res = await gm.post('/api/auth/logout');
    expect(res.body).toEqual({ success: true });
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).join(';');
    expect(cookie).toMatch(/hotel_session=;/);
  });
});

describe('PUT /api/auth/profile', () => {
  it('401s without a session', async () => {
    expect((await api().put('/api/auth/profile').send({ name: 'Hacker' })).status).toBe(401);
  });

  it('updates the acting user\'s name and persists it', async () => {
    const asst = await loginAs('asst');
    const res = await asst.put('/api/auth/profile').send({ name: 'Renamed Assistant' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Renamed Assistant');
    expect((await prisma.user.findUnique({ where: { id: 'asst' } }))!.name).toBe('Renamed Assistant');
  });

  it('409s when the new email belongs to another user', async () => {
    const asst = await loginAs('asst');
    const res = await asst.put('/api/auth/profile').send({ email: 'mgr@hotel.test' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_EXISTS');
  });

  it('400s a weak new password and leaves the hash untouched', async () => {
    const before = (await prisma.user.findUnique({ where: { id: 'asst' } }))!.password;
    const asst = await loginAs('asst');
    const res = await asst.put('/api/auth/profile').send({ newPassword: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('WEAK_PASSWORD');
    expect((await prisma.user.findUnique({ where: { id: 'asst' } }))!.password).toBe(before);
  });

  it('changes the password when the new one is strong (old one stops working)', async () => {
    const asst = await loginAs('asst');
    expect((await asst.put('/api/auth/profile').send({ newPassword: 'Br4ndNewPass' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: 'asst', password: TEST_PASSWORD })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ identifier: 'asst', password: 'Br4ndNewPass' })).status).toBe(200);
  });

  it('updates phone and avatar without touching credentials', async () => {
    const asst = await loginAs('asst');
    const res = await asst.put('/api/auth/profile').send({ phone: '  +20 111  ', avatar: ' http://img ' });
    expect(res.status).toBe(200);
    const row = (await prisma.user.findUnique({ where: { id: 'asst' } }))!;
    expect(row.phone).toBe('+20 111');
    expect(row.avatar).toBe('http://img');
  });
});

describe('POST /api/auth/signup', () => {
  const base = {
    name: 'New Hire',
    email: 'new.hire@hotel.test',
    password: 'Str0ngPass1',
    role: 'Assistant' as const,
    departmentId: 'dept-it',
    parentId: 'mgr',
  };

  it('creates the account, hashes the password, and sets a session cookie', async () => {
    const res = await api().post('/api/auth/signup').send(base);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, user: { email: 'new.hire@hotel.test' } });
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).join(';');
    expect(cookie).toMatch(/hotel_session=/);

    const created = await prisma.user.findFirst({ where: { email: 'new.hire@hotel.test' } });
    expect(created!.password).toMatch(/^scrypt\$/);
  });

  it('400s a weak password', async () => {
    const res = await api().post('/api/auth/signup').send({ ...base, password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('WEAK_PASSWORD');
  });

  it('409s a duplicate email', async () => {
    const res = await api().post('/api/auth/signup').send({ ...base, email: 'mgr@hotel.test' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_EXISTS');
  });

  it('400s when the reporting line does not match the role (Assistant under GM)', async () => {
    const res = await api().post('/api/auth/signup').send({ ...base, parentId: 'gm' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_HIERARCHY');
  });
});
