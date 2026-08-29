import prisma from '../server/db';

async function resetToTwoUsers() {
  console.log('--- STARTING DATABASE RESET ---');

  // 1. Find or verify George account
  let george = await prisma.user.findFirst({
    where: {
      OR: [
        { id: 'user-1787919111462-w2zg3' },
        { email: 'george@gmail.com' }
      ]
    }
  });

  if (!george) {
    console.error('George account not found!');
    return;
  }

  // Ensure George is Director of IT
  george = await prisma.user.update({
    where: { id: george.id },
    data: {
      name: 'george',
      email: 'george@gmail.com',
      role: 'Director',
      title: 'IT Director',
      departmentId: 'it',
      parentId: null,
      status: 'Active'
    }
  });
  console.log(`[KEPT] George Account: ID=${george.id}, Name=${george.name}, Role=${george.role}, Email=${george.email}`);

  // 2. Find or verify Jovaney account
  let jovaney = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'jovaneyatef@gmail.com' },
        { id: 'user-1787913232663-2at6h' },
        { id: 'user-1787913254787-gn9oe' }
      ]
    }
  });

  if (!jovaney) {
    console.error('Jovaney account not found!');
    return;
  }

  // Ensure Jovaney is Assistant in IT reporting to George
  jovaney = await prisma.user.update({
    where: { id: jovaney.id },
    data: {
      name: 'jovaney',
      email: 'jovaneyatef@gmail.com',
      role: 'Assistant',
      title: 'IT Assistant',
      departmentId: 'it',
      parentId: george.id,
      managerId: george.id,
      status: 'Active'
    }
  });
  console.log(`[KEPT] Jovaney Account: ID=${jovaney.id}, Name=${jovaney.name}, Role=${jovaney.role}, ReportsTo=${jovaney.parentId}`);

  const allowedUserIds = [george.id, jovaney.id];

  // 3. Clear all tasks and histories
  const deletedHistories = await prisma.taskHistory.deleteMany({});
  const deletedTasks = await prisma.task.deleteMany({});
  console.log(`[CLEARED] Tasks: ${deletedTasks.count}, Task Histories: ${deletedHistories.count}`);

  // 4. Clear all notifications
  const deletedNotifs = await prisma.notification.deleteMany({});
  console.log(`[CLEARED] Notifications: ${deletedNotifs.count}`);

  // 5. Clear all checklist history
  const deletedChecklistHistory = await prisma.checklistHistory.deleteMany({});
  console.log(`[CLEARED] Checklist History: ${deletedChecklistHistory.count}`);

  // 6. Reset all checklist items to uncompleted fresh state
  const allChecklists = await prisma.checklist.findMany();
  for (const chk of allChecklists) {
    let items = [];
    try {
      items = typeof chk.items === 'string' ? JSON.parse(chk.items) : (chk.items || []);
    } catch {}

    const freshItems = items.map((item: any) => ({
      ...item,
      completed: false,
      completedAt: undefined,
      completedBy: undefined
    }));

    await prisma.checklist.update({
      where: { id: chk.id },
      data: {
        score: 0,
        items: JSON.stringify(freshItems)
      }
    });
  }
  console.log(`[RESET] Checklists reset to fresh 0% completed state.`);

  // 7. Clear projects and chats if any
  await prisma.project.deleteMany({});
  await prisma.chatMessage.deleteMany({});
  console.log(`[CLEARED] Projects & Chat Messages.`);

  // 8. Delete all other users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      id: {
        notIn: allowedUserIds
      }
    }
  });
  console.log(`[REMOVED] ${deletedUsers.count} other user accounts.`);

  // 9. Summary verification
  const remainingUsers = await prisma.user.findMany();
  console.log('\n--- REMAINING USERS IN DATABASE ---');
  console.log(remainingUsers.map(u => ({ id: u.id, name: u.name, role: u.role, department: u.departmentId, email: u.email, reportsTo: u.parentId })));

  const remainingTasks = await prisma.task.count();
  console.log(`Remaining tasks: ${remainingTasks}`);
  console.log('--- DATABASE RESET COMPLETED SUCCESSFULLY ---');
}

resetToTwoUsers().then(() => process.exit(0)).catch(err => {
  console.error('Reset error:', err);
  process.exit(1);
});
