/**
 * Supertest + Prisma helpers for the server (integration) project.
 *
 *   const res = await api().get('/api/state');          // unauthenticated
 *   const gm  = await loginAs('gm'); await gm.get(...);  // authenticated agent
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import supertest from 'supertest';
import { app } from '../../server';
import prisma from '../../server/db';
import { hashPassword } from '../../server/services/authService';
import { TEST_PASSWORD } from '../factories';

export { app, prisma, TEST_PASSWORD };

/**
 * Several routes (DELETE /api/tasks|complaints|users/:id, /tasks/:id/switch,
 * /notifications/:id/acknowledge) still read/write the legacy JSON store rather
 * than Prisma. This overwrites that store (sandboxed to $DATA_DIR by the test
 * setup) so those routes have something to act on.
 */
export function writeJsonState(partial: Record<string, unknown> = {}): void {
  const base = {
    demoDataVersion: 'command-center-aug-2026-v3',
    users: [], departments: [], tasks: [], checklists: [], checklistHistory: [],
    projects: [], complaints: [], notifications: [], chats: [],
  };
  writeFileSync(join(process.env.DATA_DIR!, 'data.json'), JSON.stringify({ ...base, ...partial }));
}

/** Plain-object mirror of seedOrg for the JSON store. */
export const jsonOrg = () => [
  { id: 'gm', username: 'gm', name: 'GM', role: 'GeneralManager', title: 'GM', email: 'gm@hotel.test', status: 'Active', departmentId: 'dept-it', skills: [] },
  { id: 'dir', username: 'dir', name: 'DIR', role: 'Director', title: 'Director', email: 'dir@hotel.test', status: 'Active', departmentId: 'dept-it', parentId: 'gm', skills: [] },
  { id: 'mgr', username: 'mgr', name: 'MGR', role: 'Manager', title: 'Manager', email: 'mgr@hotel.test', status: 'Active', departmentId: 'dept-it', parentId: 'dir', skills: [] },
  { id: 'asst', username: 'asst', name: 'ASST', role: 'Assistant', title: 'Assistant', email: 'asst@hotel.test', status: 'Active', departmentId: 'dept-it', parentId: 'mgr', skills: [] },
];

export const api = () => supertest(app);

type SeedRole = 'gm' | 'dir' | 'mgr' | 'asst';

const ROLE_MAP: Record<SeedRole, string> = {
  gm: 'GeneralManager',
  dir: 'Director',
  mgr: 'Manager',
  asst: 'Assistant',
};

/**
 * Writes the canonical org (see makeOrg) into the test database:
 * one IT department and a gm -> dir -> mgr -> asst reporting chain,
 * every account sharing the password `TEST_PASSWORD`.
 */
export async function seedOrg(): Promise<void> {
  await prisma.department.create({
    data: { id: 'dept-it', name: 'IT Department', complaintReasons: '[]' },
  });

  const password = hashPassword(TEST_PASSWORD);
  const rows: Array<{ id: SeedRole; parentId?: SeedRole }> = [
    { id: 'gm' },
    { id: 'dir', parentId: 'gm' },
    { id: 'mgr', parentId: 'dir' },
    { id: 'asst', parentId: 'mgr' },
  ];

  for (const { id, parentId } of rows) {
    await prisma.user.create({
      data: {
        id,
        username: id,
        name: id.toUpperCase(),
        email: `${id}@hotel.test`,
        role: ROLE_MAP[id],
        title: ROLE_MAP[id],
        status: 'Active',
        password,
        departmentId: 'dept-it',
        parentId: parentId ?? null,
        managerId: parentId ?? null,
        skills: '[]',
      },
    });
  }
}

/** Logs in and returns a supertest agent that carries the session cookie. */
export async function loginAs(id: SeedRole) {
  const agent = supertest.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ identifier: id, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`loginAs(${id}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}
