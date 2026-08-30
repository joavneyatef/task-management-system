#!/usr/bin/env node
/**
 * Wipe the database back to a clean slate and bootstrap the minimum the app
 * needs to be usable: one General Manager account and the department list.
 *
 *   node scripts/reset-db.mjs                       # default GM below
 *   node scripts/reset-db.mjs you@work.com 'Str0ngPass!'   # your own GM
 *
 * Targets prisma/dev.db + ./data.json by default. Point it elsewhere with
 * DATABASE_URL / DATA_DIR (same vars the server reads), e.g. to reset the
 * isolated .local-run copy.
 *
 * After this the only account is the GM. Sign in as the GM, then create
 * Directors -> Managers -> Assistants through the app's sign-up screen.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DEMO_DATA_VERSION = 'command-center-aug-2026-v3'; // keep in sync with server.ts
const GM_EMAIL = process.argv[2] || 'admin@local';
const GM_PASSWORD = process.argv[3] || 'ChangeMe!123';
const GM_NAME = process.env.GM_NAME || 'System Administrator';

const DEPARTMENTS = [
  { id: 'it', name: 'IT Department' },
  { id: 'fnb', name: 'Food & Beverage' },
  { id: 'rooms', name: 'Rooms Division' },
  { id: 'operations', name: 'Operations' },
];

const hash = (plain) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(plain, salt, 64).toString('hex')}`;
};

const prisma = new PrismaClient(
  process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : undefined,
);

async function main() {
  // 1. wipe every table (children first for FK safety)
  await prisma.chatMessage.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.checklistHistory.deleteMany();
  await prisma.taskHistory.deleteMany();
  await prisma.project.deleteMany();
  await prisma.checklist.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  // 2. empty the legacy JSON store (kept, not deleted, so the server's demo-data
  //    restore branch never fires)
  const dataDir = process.env.DATA_DIR || process.cwd();
  const empty = {
    users: [], departments: [], tasks: [], checklists: [], checklistHistory: [],
    projects: [], notifications: [], chats: [], complaints: [],
    demoDataVersion: DEMO_DATA_VERSION,
  };
  writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(empty, null, 2));

  // 3. departments
  for (const d of DEPARTMENTS) {
    await prisma.department.create({
      data: { id: d.id, name: d.name, description: '', isActive: true, complaintReasons: '[]' },
    });
  }

  // 4. the one bootstrap GM
  await prisma.user.create({
    data: {
      id: 'gm-admin',
      username: GM_EMAIL.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'admin',
      name: GM_NAME,
      email: GM_EMAIL.trim().toLowerCase(),
      role: 'GeneralManager',
      title: 'General Manager',
      status: 'Active',
      password: hash(GM_PASSWORD),
      pin: hash('0000'),
      departmentId: 'operations',
      parentId: null,
      managerId: null,
      positionCode: 'GeneralManager',
      skills: '[]',
    },
  });

  const users = await prisma.user.findMany({ select: { name: true, role: true, email: true } });
  const depts = await prisma.department.findMany({ select: { name: true } });
  console.log('\nDatabase reset.\n');
  console.log('Accounts (', users.length, '):');
  for (const u of users) console.log(`  ${u.role.padEnd(15)} ${u.email}  (${u.name})`);
  console.log('\nDepartments (', depts.length, '):', depts.map((d) => d.name).join(', '));
  console.log('\nTasks / projects / checklists / complaints: 0');
  console.log(`\nSign in as:  ${GM_EMAIL}  /  ${GM_PASSWORD}`);
  console.log('CHANGE THIS PASSWORD after first login (user menu -> User Profile & Password).\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
