import prisma from '../server/db';

async function cleanup() {
  // 1. Find the real jovaney user
  const realJovaney = await prisma.user.findFirst({
    where: { email: 'jovaneyatef@gmail.com' }
  });

  if (!realJovaney) {
    console.log('Real jovaney account not found!');
    return;
  }

  console.log('Real Jovaney ID:', realJovaney.id);

  // 2. Find any tasks assigned to duplicate test accounts (like 'user-1787912618037-9hvnb' or similar)
  const allTasks = await prisma.task.findMany();
  for (const t of allTasks) {
    let ids: string[] = [];
    try {
      ids = typeof t.assigneeIds === 'string' ? JSON.parse(t.assigneeIds) : (t.assigneeIds || []);
    } catch {}

    if (t.assigneeId === 'user-1787912618037-9hvnb' || ids.includes('user-1787912618037-9hvnb')) {
      const updatedIds = ids.map(id => id === 'user-1787912618037-9hvnb' ? realJovaney.id : id);
      if (!updatedIds.includes(realJovaney.id)) updatedIds.push(realJovaney.id);
      
      await prisma.task.update({
        where: { id: t.id },
        data: {
          assigneeId: realJovaney.id,
          assigneeIds: JSON.stringify(updatedIds),
          departmentId: 'it'
        }
      });
      console.log(`Reassigned task "${t.title}" (id: ${t.id}) to real Jovaney (${realJovaney.id})`);
    }
  }

  // 3. Remove duplicate dummy test user accounts
  const dummyEmails = ['jovaney.it@hotel.local', 'staff.new@hotel.local'];
  for (const email of dummyEmails) {
    const deleted = await prisma.user.deleteMany({
      where: { email }
    });
    console.log(`Deleted ${deleted.count} dummy user with email: ${email}`);
  }

  console.log('Cleanup completed successfully.');
}

cleanup();
