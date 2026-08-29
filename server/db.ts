import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// The schema hard-codes the dev datasource (prisma/dev.db). The test runner sets
// DATABASE_URL to a disposable database and we honour it here, so dev/prod
// behaviour is unchanged when the variable is absent.
const prismaOptions = process.env.DATABASE_URL
  ? { datasourceUrl: process.env.DATABASE_URL }
  : undefined;

export const prisma = global.prismaGlobal || new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;
