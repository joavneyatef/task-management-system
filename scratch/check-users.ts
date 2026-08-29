import prisma from '../server/db';
async function run() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, departmentId: true, parentId: true, managerId: true, status: true } });
  console.log(JSON.stringify(users, null, 2));
}
run();
