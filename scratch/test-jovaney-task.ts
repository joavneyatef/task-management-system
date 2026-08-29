import { canViewTask } from '../src/utils/permissions';
import { getSystemState } from '../server/services/stateService';

async function test() {
  const state = await getSystemState(true);
  const realJovaney = state.users.find(u => u.email === 'jovaneyatef@gmail.com')!;
  const georgeDirector = state.users.find(u => u.role === 'Director' && u.departmentId === 'it')!;
  const otherAssistant = state.users.find(u => u.id === 'ahmed-assistant')!;

  const task = state.tasks.find(t => t.id === 'task-1787920334940-0-tl0rg')!;

  console.log('Task found:', task.title);
  console.log('Assignees:', task.assigneeIds);
  console.log('Real Jovaney (assignee) can view:', canViewTask(realJovaney, task, state.users));
  console.log('George (Director) can view:', canViewTask(georgeDirector, task, state.users));
  console.log('Other Assistant (peer) can view:', canViewTask(otherAssistant, task, state.users));
}

test();
