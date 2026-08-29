import prisma from '../server/db';

async function listAll() {
  const users = await prisma.user.findMany();
  console.log('USERS IN DB:');
  console.log(JSON.stringify(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, departmentId: u.departmentId, parentId: u.parentId })), null, 2));

  const tasksCount = await prisma.task.count();
  const notifCount = await prisma.notification.count();
  const auditCount = await prisma.auditLog.count();
  const chkHistCount = await prisma.checklistHistory.count();
  console.log({ tasksCount, notifCount, auditCount, chkHistCount });
}

listAll().then(() => process.exit(0));
