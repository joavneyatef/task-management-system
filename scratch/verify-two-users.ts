import { getAssignableUsers, canViewTask } from '../src/utils/permissions';
import { getSystemState } from '../server/services/stateService';

async function test() {
  const state = await getSystemState(true);
  console.log('Total users in state:', state.users.length);
  console.log('Total tasks in state:', state.tasks.length);

  const george = state.users.find(u => u.name === 'george')!;
  const jovaney = state.users.find(u => u.name === 'jovaney')!;

  console.log('George:', { id: george.id, name: george.name, role: george.role });
  console.log('Jovaney:', { id: jovaney.id, name: jovaney.name, role: jovaney.role, parentId: jovaney.parentId });

  const assignableByGeorge = getAssignableUsers(george, state.users);
  console.log('Users George can assign tasks to:', assignableByGeorge.map(u => ({ id: u.id, name: u.name, role: u.role })));

  const testTask = {
    id: 'sample-task',
    title: 'Test Clean Task',
    assigneeId: jovaney.id,
    assigneeIds: [jovaney.id],
    createdBy: george.id,
    departmentId: 'it'
  };

  console.log('George can view sample task:', canViewTask(george, testTask, state.users));
  console.log('Jovaney can view sample task:', canViewTask(jovaney, testTask, state.users));
}

test().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
