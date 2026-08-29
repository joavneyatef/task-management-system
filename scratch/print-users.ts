import prisma from '../server/db';

async function check() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    console.log(`ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role} | Parent: ${u.parentId}`);
  }
}

check().then(() => process.exit(0));
