import prisma from '../server/db';
async function run() {
  const tasks = await prisma.task.findMany({ select: { id: true, title: true, creatorId: true, assigneeId: true, assigneeIds: true, departmentId: true, status: true } });
  console.log(JSON.stringify(tasks, null, 2));
}
run();
