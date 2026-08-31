import { beforeEach, describe, expect, it } from 'vitest';
import { api, loginAs, seedOrg } from './support';

type Role = 'gm' | 'dir' | 'mgr' | 'asst';
const ALL: Role[] = ['gm', 'dir', 'mgr', 'asst'];

/**
 * Every requireRole()-guarded route: allowed roles get past the guard (200/404),
 * everyone else is 403, and no session is 401. The guard runs before any data
 * access, so this is independent of what the route then does.
 */
const GUARDED: { name: string; method: 'get' | 'delete'; path: string; allow: Role[] }[] = [
  { name: 'DELETE /api/tasks/:id', method: 'delete', path: '/api/tasks/nope', allow: ['gm', 'dir', 'mgr'] },
  { name: 'DELETE /api/complaints/:id', method: 'delete', path: '/api/complaints/nope', allow: ['gm', 'dir', 'mgr'] },
  { name: 'DELETE /api/users/:id', method: 'delete', path: '/api/users/nope', allow: ['gm'] },
  { name: 'GET /api/reports/completed-tasks', method: 'get', path: '/api/reports/completed-tasks', allow: ['gm'] },
  { name: 'GET /api/reports/performance', method: 'get', path: '/api/reports/performance', allow: ['gm'] },
  { name: 'GET /api/audit-log', method: 'get', path: '/api/audit-log', allow: ['gm'] },
];

beforeEach(seedOrg);

describe.each(GUARDED)('$name', ({ method, path, allow }) => {
  it('401s without a session', async () => {
    expect((await api()[method](path)).status).toBe(401);
  });

  it.each(ALL)('role %s', async (role) => {
    const agent = await loginAs(role);
    const res = await agent[method](path);
    if (allow.includes(role)) {
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }
  });
});
