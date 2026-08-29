import prisma from '../server/db';

async function check() {
  const georges = await prisma.user.findMany({ where: { OR: [{ name: { contains: 'george' } }, { email: { contains: 'george' } }] } });
  console.log('GEORGE ACCOUNTS:', JSON.stringify(georges, null, 2));

  const jovaneys = await prisma.user.findMany({ where: { OR: [{ name: { contains: 'jovaney' } }, { email: { contains: 'jovaney' } }, { email: { contains: 'egosword' } }] } });
  console.log('JOVANEY ACCOUNTS:', JSON.stringify(jovaneys, null, 2));
}

check().then(() => process.exit(0));
