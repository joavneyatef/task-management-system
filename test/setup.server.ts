import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

// The Gemini SDK is never exercised for real in tests. Mock it before any server
// module that imports it is loaded (vi.mock is hoisted above imports).
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: 'stub AI reply' }),
    },
  })),
}));

const prismaDir = fileURLToPath(new URL('../prisma/', import.meta.url));
const realSchema = `${prismaDir}schema.prisma`;
const testSchema = `${prismaDir}.test.schema.prisma`;

// Child models first so foreign keys never block a truncate.
const TABLES = [
  'ChatMessage',
  'Notification',
  'ChecklistHistory',
  'TaskHistory',
  'Project',
  'Checklist',
  'Task',
  'User',
  'Department',
] as const;

const prismaCli = join(
  dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
  'build',
  'index.js',
);

beforeAll(() => {
  // The committed schema hard-codes prisma/dev.db, and `db push` has no --url
  // flag, so write a throwaway schema whose datasource points at the disposable
  // test database (DATABASE_URL is set by vitest.config.ts) and push that.
  const schema = readFileSync(realSchema, 'utf8').replace(
    /datasource\s+db\s*\{[^}]*\}/m,
    `datasource db {\n  provider = "sqlite"\n  url      = "${process.env.DATABASE_URL}"\n}`,
  );
  writeFileSync(testSchema, schema);

  // Call the Prisma CLI directly (not via npx) to avoid ~10s of resolution overhead.
  execFileSync(
    process.execPath,
    [prismaCli, 'db', 'push', '--schema', testSchema, '--force-reset', '--skip-generate', '--accept-data-loss'],
    { env: process.env, stdio: 'ignore' },
  );

  if (process.env.DATA_DIR) mkdirSync(process.env.DATA_DIR, { recursive: true });
  if (process.env.BACKUPS_DIR) mkdirSync(process.env.BACKUPS_DIR, { recursive: true });
}, 60_000);

// A minimal, demo-version-stamped JSON store so server.ts's readState() does not
// fall back to restoring data-seed.json (the shipped demo data).
const EMPTY_JSON_STATE = {
  demoDataVersion: 'command-center-aug-2026-v3',
  users: [],
  departments: [],
  tasks: [],
  checklists: [],
  checklistHistory: [],
  projects: [],
  complaints: [],
  notifications: [],
  chats: [],
};

beforeEach(() => {
  if (process.env.DATA_DIR) {
    writeFileSync(join(process.env.DATA_DIR, 'data.json'), JSON.stringify(EMPTY_JSON_STATE));
    writeFileSync(join(process.env.DATA_DIR, 'data-test.json'), JSON.stringify(EMPTY_JSON_STATE));
  }
  if (process.env.BACKUPS_DIR) {
    rmSync(process.env.BACKUPS_DIR, { recursive: true, force: true });
    mkdirSync(process.env.BACKUPS_DIR, { recursive: true });
  }
});

afterEach(async () => {
  const { prisma } = await import('../server/db');
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
});

afterAll(async () => {
  const { prisma } = await import('../server/db');
  await prisma.$disconnect();
});
