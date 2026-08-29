import prisma from '../server/db';
async function run() {
  const users = await prisma.user.findMany({ where: { email: { contains: 'jovaney' } } });
  console.log(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
}
run();
