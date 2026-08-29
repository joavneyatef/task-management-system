import prisma from '../server/db';
import { getSystemState, saveSystemState } from '../server/services/stateService';
import { canViewTask } from '../src/utils/permissions';

async function testTaskCompletionCycle() {
  console.log('--- TESTING TASK COMPLETION CYCLE & PERSISTENCE ---');
  
  const state = await getSystemState(true);
  const george = state.users.find(u => u.name === 'george')!;
  const jovaney = state.users.find(u => u.name === 'jovaney')!;

  const taskId = `task-test-complete-${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Create task
  const newTask = {
    id: taskId,
    title: 'Verify Completion Sync & Persistence',
    description: 'Testing that completed tasks persist in SQLite and show on Director board',
    priority: 'Medium' as const,
    status: 'Open' as const,
    deadline: new Date(Date.now() + 86400000).toISOString(),
    departmentId: 'it',
    createdBy: george.id,
    assignedBy: george.id,
    assigneeId: jovaney.id,
    assigneeIds: [jovaney.id],
    version: 1,
    notes: [],
    attachments: [],
    history: []
  };

  await saveSystemState({ tasks: [newTask] });
  let check1 = await getSystemState(true);
  let savedTask = check1.tasks.find(t => t.id === taskId);
  console.log('1. Created Task Status in SQLite:', savedTask?.status);

  // 2. Mark In Progress
  const inProgressTask = {
    ...savedTask!,
    status: 'In Progress' as const,
    startedAt: now,
    version: 2
  };
  await saveSystemState({ tasks: [inProgressTask] });
  let check2 = await getSystemState(true);
  savedTask = check2.tasks.find(t => t.id === taskId);
  console.log('2. In Progress Task Status in SQLite:', savedTask?.status);

  // 3. Mark Completed
  const completedTask = {
    ...savedTask!,
    status: 'Completed' as const,
    completedAt: now,
    completedById: jovaney.id,
    actualDurationSec: 120,
    version: 3
  };
  await saveSystemState({ tasks: [completedTask] });
  let check3 = await getSystemState(true);
  savedTask = check3.tasks.find(t => t.id === taskId);
  console.log('3. Completed Task Status in SQLite:', savedTask?.status);

  // 4. Verification
  console.log('4. George can view completed task:', canViewTask(george, savedTask as any, check3.users));
  console.log('5. Jovaney can view completed task:', canViewTask(jovaney, savedTask as any, check3.users));

  if (savedTask?.status === 'Completed') {
    console.log('✅ Task successfully saved as Completed and verified in SQLite database!');
  } else {
    console.error('❌ Task completion failed to persist!');
    process.exit(1);
  }

  // Cleanup test task
  await prisma.task.deleteMany({ where: { id: taskId } });
}

testTaskCompletionCycle().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
